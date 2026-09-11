import { describe, expect, test } from "bun:test";
import {
  parseBhs,
  serializeBhs,
  BhsError,
  BhsUnknownKeyError,
  isShareableBhsPatch,
  bhsPatchPath,
} from "../app/src/bhs.ts";

// ── Round-trip: load text → model → save text → byte-identical ──

describe("bhs document round-trip", () => {
  test("mizer path variant round-trips byte-identical", () => {
    const text = '{"patch":{"kind":"mizer","path":"~/mizer/warehouse.yml"}}';
    const doc = parseBhs(text);
    expect(serializeBhs(doc)).toBe(text);
  });

  test("mvr path variant round-trips byte-identical", () => {
    const text = '{"patch":{"kind":"mvr","path":"shows/warehouse.mvr"}}';
    const doc = parseBhs(text);
    expect(serializeBhs(doc)).toBe(text);
  });

  test("snapshot variant round-trips byte-identical with fixture data", () => {
    const text = '{"patch":{"kind":"snapshot","fixtures":[{"id":1,"position":[0,0,0]}]}}';
    const doc = parseBhs(text);
    expect(serializeBhs(doc)).toBe(text);
  });

  test("snapshot variant with empty fixtures array round-trips", () => {
    const text = '{"patch":{"kind":"snapshot","fixtures":[]}}';
    const doc = parseBhs(text);
    expect(serializeBhs(doc)).toBe(text);
  });

  test("snapshot variant with full columnar payload round-trips", () => {
    const text =
      '{"patch":{"kind":"snapshot","fixtures":[[-1,0,"default",[[1,1,69]],[0,500,0],[0,0,0]]],"definitions":[["p",0,1000,1000,1000]],"views":{"Front":[0,3,8,0,1,0]},"takenAt":1756730620000}}';
    const doc = parseBhs(text);
    expect(serializeBhs(doc)).toBe(text);
  });
});

// ── Validation: named errors for malformed documents ──

describe("bhs document validation", () => {
  test("rejects unknown top-level keys with named BhsUnknownKeyError", () => {
    expect(() => parseBhs('{"patch":{"kind":"mizer","path":"x"},"foo":"bar"}')).toThrow(
      BhsUnknownKeyError,
    );
    expect(() => parseBhs('{"patch":{"kind":"mizer","path":"x"},"definitions":{}}')).toThrow(
      BhsUnknownKeyError,
    );
  });

  test("rejects missing patch key", () => {
    expect(() => parseBhs("{}")).toThrow(BhsError);
  });

  test("rejects unknown patch kind", () => {
    expect(() => parseBhs('{"patch":{"kind":"unknown"}}')).toThrow(BhsError);
  });

  test("rejects mizer variant without path", () => {
    expect(() => parseBhs('{"patch":{"kind":"mizer"}}')).toThrow(BhsError);
  });

  test("rejects mvr variant without path", () => {
    expect(() => parseBhs('{"patch":{"kind":"mvr"}}')).toThrow(BhsError);
  });

  test("rejects path variant with empty path", () => {
    expect(() => parseBhs('{"patch":{"kind":"mizer","path":""}}')).toThrow(BhsError);
    expect(() => parseBhs('{"patch":{"kind":"mvr","path":""}}')).toThrow(BhsError);
  });

  test("rejects snapshot variant without fixtures key", () => {
    expect(() => parseBhs('{"patch":{"kind":"snapshot"}}')).toThrow(/fixtures/);
  });

  test("rejects invalid JSON", () => {
    expect(() => parseBhs("{invalid")).toThrow(BhsError);
  });

  test("rejects non-object root", () => {
    expect(() => parseBhs("[]")).toThrow(BhsError);
    expect(() => parseBhs('""')).toThrow(BhsError);
  });

  test("rejects non-object patch", () => {
    expect(() => parseBhs('{"patch":"string"}')).toThrow(BhsError);
    expect(() => parseBhs('{"patch":[]}')).toThrow(BhsError);
  });

  test("rejects missing kind field", () => {
    expect(() => parseBhs('{"patch":{"path":"x"}}')).toThrow(BhsError);
  });
});

// ── Patch shareability: only snapshot is shareable ──

describe("patch shareability", () => {
  test("snapshot patch is shareable", () => {
    const doc = parseBhs('{"patch":{"kind":"snapshot","fixtures":[]}}');
    expect(isShareableBhsPatch(doc.patch)).toBe(true);
    expect(bhsPatchPath(doc.patch)).toBeNull();
  });

  test("mizer patch is not shareable — reason names the local path", () => {
    const path = "~/mizer/warehouse.yml";
    const doc = parseBhs(`{"patch":{"kind":"mizer","path":"${path}"}}`);
    expect(isShareableBhsPatch(doc.patch)).toBe(false);
    expect(bhsPatchPath(doc.patch)).toBe(path);
  });

  test("mvr patch is not shareable — reason names the local path", () => {
    const path = "shows/warehouse.mvr";
    const doc = parseBhs(`{"patch":{"kind":"mvr","path":"${path}"}}`);
    expect(isShareableBhsPatch(doc.patch)).toBe(false);
    expect(bhsPatchPath(doc.patch)).toBe(path);
  });
});
