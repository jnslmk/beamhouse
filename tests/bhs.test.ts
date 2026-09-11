import { describe, expect, test } from "bun:test";
import {
  parseBhs,
  serializeBhs,
  BhsError,
  BhsUnknownKeyError,
  BhsClassesBlockError,
  BhsEmittersBlockError,
  BhsDefinitionError,
  BhsFixtureError,
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

  // ── Issue #82: definitions and fixtures blocks ──

  test("with strip definition and local fixture round-trips byte-identical", () => {
    const text =
      '{"patch":{"kind":"snapshot","fixtures":[]},"definitions":{"bhs:spoke":{"kind":"strip","pixels":23,"pitchMm":33.33,"channelsPerPixel":3,"primitive":"Cube"}},"fixtures":[{"id":-1,"definition":"bhs:spoke","mode":"default","addresses":[{"universe":100,"address":1,"footprint":69}]}]}';
    const doc = parseBhs(text);
    expect(serializeBhs(doc)).toBe(text);
  });

  test("with primitive definition round-trips byte-identical", () => {
    const text =
      '{"patch":{"kind":"snapshot","fixtures":[]},"definitions":{"bhs:scenery":{"kind":"primitive","primitive":"Cube","width":1,"depth":2,"height":0.5}}}';
    const doc = parseBhs(text);
    expect(serializeBhs(doc)).toBe(text);
  });

  test("with gdtf fixture id round-trips byte-identical", () => {
    const text =
      '{"patch":{"kind":"snapshot","fixtures":[]},"fixtures":[{"id":-1,"definition":"gdtf:9C7854E1-32D5-4DE9-BB8E-6D121F27CF48","mode":"Normal","addresses":[{"universe":1,"address":1,"footprint":1}]}]}';
    const doc = parseBhs(text);
    expect(serializeBhs(doc)).toBe(text);
  });

  test("with ofl fixture id round-trips byte-identical", () => {
    const text =
      '{"patch":{"kind":"snapshot","fixtures":[]},"fixtures":[{"id":-2,"definition":"ofl:generic:dimmer","mode":"Dimmer","addresses":[{"universe":1,"address":85,"footprint":1}]}]}';
    const doc = parseBhs(text);
    expect(serializeBhs(doc)).toBe(text);
  });

  test("scene object fixture round-trips byte-identical", () => {
    const text =
      '{"patch":{"kind":"snapshot","fixtures":[]},"fixtures":[{"id":-3,"definition":"bhs:scenery","mode":"","addresses":[]}]}';
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
    expect(() => parseBhs('{"patch":{"kind":"mizer","path":"x"},"scene":{}}')).toThrow(
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
    expect(() => parseBhs('"string"')).toThrow(BhsError);
    expect(() => parseBhs("null")).toThrow(BhsError);
  });

  test("rejects non-object patch", () => {
    expect(() => parseBhs('{"patch":"string"}')).toThrow(BhsError);
    expect(() => parseBhs('{"patch":[]}')).toThrow(BhsError);
    expect(() => parseBhs('{"patch":null}')).toThrow(BhsError);
  });

  test("rejects missing kind field", () => {
    expect(() => parseBhs('{"patch":{"path":"x"}}')).toThrow(BhsError);
  });

  // ── Issue #82: forbidden blocks ──

  test("rejects classes block with named BhsClassesBlockError", () => {
    expect(() => parseBhs('{"patch":{"kind":"mizer","path":"x"},"classes":{}}')).toThrow(
      BhsClassesBlockError,
    );
  });

  test("rejects emitters block with named BhsEmittersBlockError", () => {
    expect(() => parseBhs('{"patch":{"kind":"mizer","path":"x"},"emitters":{}}')).toThrow(
      BhsEmittersBlockError,
    );
  });

  // ── Issue #82: invalid definitions ──

  test("rejects non-object definitions", () => {
    expect(() => parseBhs('{"patch":{"kind":"mizer","path":"x"},"definitions":"string"}')).toThrow(
      BhsDefinitionError,
    );
    expect(() => parseBhs('{"patch":{"kind":"mizer","path":"x"},"definitions":[]}')).toThrow(
      BhsDefinitionError,
    );
  });

  test("rejects definition id without bhs: prefix", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"definitions":{"foo":{"kind":"strip","pixels":1,"pitchMm":1,"channelsPerPixel":1,"primitive":"Cube"}}}',
      ),
    ).toThrow(BhsDefinitionError);
  });

  test("rejects definition with forbidden optics key BeamType", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"definitions":{"bhs:spoke":{"kind":"strip","BeamType":"Wash","pixels":1,"pitchMm":1,"channelsPerPixel":1,"primitive":"Cube"}}}',
      ),
    ).toThrow(BhsDefinitionError);
  });

  test("rejects definition with forbidden optics key BeamAngle", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"definitions":{"bhs:spoke":{"kind":"strip","BeamAngle":15,"pixels":1,"pitchMm":1,"channelsPerPixel":1,"primitive":"Cube"}}}',
      ),
    ).toThrow(BhsDefinitionError);
  });

  test("rejects definition with forbidden optics key BeamRadius", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"definitions":{"bhs:spoke":{"kind":"strip","BeamRadius":0.5,"pixels":1,"pitchMm":1,"channelsPerPixel":1,"primitive":"Cube"}}}',
      ),
    ).toThrow(BhsDefinitionError);
  });

  test("rejects definition with forbidden optics key ColorTemperature", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"definitions":{"bhs:spoke":{"kind":"strip","ColorTemperature":3200,"pixels":1,"pitchMm":1,"channelsPerPixel":1,"primitive":"Cube"}}}',
      ),
    ).toThrow(BhsDefinitionError);
  });

  test("rejects non-object definition entry", () => {
    expect(() =>
      parseBhs('{"patch":{"kind":"mizer","path":"x"},"definitions":{"bhs:spoke":"string"}}'),
    ).toThrow(BhsDefinitionError);
  });

  test("rejects strip definition without kind", () => {
    expect(() =>
      parseBhs('{"patch":{"kind":"mizer","path":"x"},"definitions":{"bhs:spoke":{"pixels":23}}}'),
    ).toThrow(BhsDefinitionError);
  });

  test("rejects strip definition with wrong kind value", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"definitions":{"bhs:spoke":{"kind":"unknown","pixels":1,"pitchMm":1,"channelsPerPixel":1,"primitive":"Cube"}}}',
      ),
    ).toThrow(BhsDefinitionError);
  });

  test("rejects strip definition missing pixels", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"definitions":{"bhs:spoke":{"kind":"strip","pitchMm":1,"channelsPerPixel":1,"primitive":"Cube"}}}',
      ),
    ).toThrow(BhsDefinitionError);
  });

  test("rejects strip definition with non-integer pixels", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"definitions":{"bhs:spoke":{"kind":"strip","pixels":1.5,"pitchMm":1,"channelsPerPixel":1,"primitive":"Cube"}}}',
      ),
    ).toThrow(BhsDefinitionError);
  });

  test("rejects strip definition with non-positive pixels", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"definitions":{"bhs:spoke":{"kind":"strip","pixels":0,"pitchMm":1,"channelsPerPixel":1,"primitive":"Cube"}}}',
      ),
    ).toThrow(BhsDefinitionError);
  });

  test("rejects strip definition with missing pitchMm", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"definitions":{"bhs:spoke":{"kind":"strip","pixels":23,"channelsPerPixel":1,"primitive":"Cube"}}}',
      ),
    ).toThrow(BhsDefinitionError);
  });

  test("rejects strip definition with non-positive pitchMm", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"definitions":{"bhs:spoke":{"kind":"strip","pixels":23,"pitchMm":0,"channelsPerPixel":1,"primitive":"Cube"}}}',
      ),
    ).toThrow(BhsDefinitionError);
  });

  test("rejects strip definition with missing primitive", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"definitions":{"bhs:spoke":{"kind":"strip","pixels":23,"pitchMm":33.33,"channelsPerPixel":1}}}',
      ),
    ).toThrow(BhsDefinitionError);
  });

  test("rejects strip definition with invalid primitive", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"definitions":{"bhs:spoke":{"kind":"strip","pixels":23,"pitchMm":33.33,"channelsPerPixel":1,"primitive":"Sphereoid"}}}',
      ),
    ).toThrow(BhsDefinitionError);
  });

  test("rejects primitive definition missing primitive field", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"definitions":{"bhs:box":{"kind":"primitive","width":1,"depth":2,"height":0.5}}}',
      ),
    ).toThrow(BhsDefinitionError);
  });

  test("rejects primitive definition invalid primitive value", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"definitions":{"bhs:box":{"kind":"primitive","primitive":"Pyramid","width":1,"depth":2,"height":0.5}}}',
      ),
    ).toThrow(BhsDefinitionError);
  });

  test("rejects primitive definition missing width", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"definitions":{"bhs:box":{"kind":"primitive","primitive":"Cube","depth":2,"height":0.5}}}',
      ),
    ).toThrow(BhsDefinitionError);
  });

  test("rejects primitive definition with zero width", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"definitions":{"bhs:box":{"kind":"primitive","primitive":"Cube","width":0,"depth":2,"height":0.5}}}',
      ),
    ).toThrow(BhsDefinitionError);
  });

  test("rejects primitive definition missing depth", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"definitions":{"bhs:box":{"kind":"primitive","primitive":"Cube","width":1,"height":0.5}}}',
      ),
    ).toThrow(BhsDefinitionError);
  });

  test("rejects primitive definition missing height", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"definitions":{"bhs:box":{"kind":"primitive","primitive":"Cube","width":1,"depth":2}}}',
      ),
    ).toThrow(BhsDefinitionError);
  });

  // ── Issue #82: invalid fixtures ──

  test("rejects non-array fixtures", () => {
    expect(() => parseBhs('{"patch":{"kind":"mizer","path":"x"},"fixtures":"string"}')).toThrow(
      BhsFixtureError,
    );
    expect(() => parseBhs('{"patch":{"kind":"mizer","path":"x"},"fixtures":{}}')).toThrow(
      BhsFixtureError,
    );
  });

  test("rejects fixture without id", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"fixtures":[{"definition":"bhs:spoke","mode":"default","addresses":[]}]}',
      ),
    ).toThrow(BhsFixtureError);
  });

  test("rejects fixture with non-integer id", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"fixtures":[{"id":"one","definition":"bhs:spoke","mode":"default","addresses":[]}]}',
      ),
    ).toThrow(BhsFixtureError);
  });

  test("rejects fixture without definition", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"fixtures":[{"id":-1,"mode":"default","addresses":[{"universe":1,"address":1,"footprint":1}]}]}',
      ),
    ).toThrow(BhsFixtureError);
  });

  test("rejects fixture with empty definition", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"fixtures":[{"id":-1,"definition":"","mode":"default","addresses":[{"universe":1,"address":1,"footprint":1}]}]}',
      ),
    ).toThrow(BhsFixtureError);
  });

  test("rejects fixture without mode", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"fixtures":[{"id":-1,"definition":"bhs:spoke","addresses":[{"universe":1,"address":1,"footprint":1}]}]}',
      ),
    ).toThrow(BhsFixtureError);
  });

  test("rejects fixture without addresses", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"fixtures":[{"id":-1,"definition":"bhs:spoke","mode":"default"}]}',
      ),
    ).toThrow(BhsFixtureError);
  });

  test("rejects fixture with address missing universe", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"fixtures":[{"id":-1,"definition":"bhs:spoke","mode":"default","addresses":[{"address":1,"footprint":1}]}]}',
      ),
    ).toThrow(BhsFixtureError);
  });

  test("rejects fixture with address having non-positive universe", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"fixtures":[{"id":-1,"definition":"bhs:spoke","mode":"default","addresses":[{"universe":0,"address":1,"footprint":1}]}]}',
      ),
    ).toThrow(BhsFixtureError);
  });

  test("rejects fixture with address missing address field", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"fixtures":[{"id":-1,"definition":"bhs:spoke","mode":"default","addresses":[{"universe":1,"footprint":1}]}]}',
      ),
    ).toThrow(BhsFixtureError);
  });

  test("rejects fixture with address missing footprint", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"fixtures":[{"id":-1,"definition":"bhs:spoke","mode":"default","addresses":[{"universe":1,"address":1}]}]}',
      ),
    ).toThrow(BhsFixtureError);
  });

  test("rejects fixture violating scene-object invariant: mode set but no addresses", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"fixtures":[{"id":-1,"definition":"bhs:spoke","mode":"default","addresses":[]}]}',
      ),
    ).toThrow(BhsFixtureError);
  });

  test("rejects fixture violating scene-object invariant: addresses but empty mode", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"mizer","path":"x"},"fixtures":[{"id":-1,"definition":"bhs:spoke","mode":"","addresses":[{"universe":1,"address":1,"footprint":1}]}]}',
      ),
    ).toThrow(BhsFixtureError);
  });
});

// ── Patch shareability: only snapshot is shareable ──

describe("patch shareability", () => {
  test("mizer patch is not shareable", () => {
    const doc = parseBhs('{"patch":{"kind":"mizer","path":"x"}}');
    expect(isShareableBhsPatch(doc.patch)).toBe(false);
  });

  test("mvr patch is not shareable", () => {
    const doc = parseBhs('{"patch":{"kind":"mvr","path":"x"}}');
    expect(isShareableBhsPatch(doc.patch)).toBe(false);
  });

  test("snapshot patch is shareable", () => {
    const doc = parseBhs('{"patch":{"kind":"snapshot","fixtures":[]}}');
    expect(isShareableBhsPatch(doc.patch)).toBe(true);
  });

  test("bhsPatchPath returns path for path-bearing variants", () => {
    expect(bhsPatchPath({ kind: "mizer", path: "x" })).toBe("x");
    expect(bhsPatchPath({ kind: "mvr", path: "y" })).toBe("y");
  });

  test("bhsPatchPath returns null for snapshot variant", () => {
    expect(bhsPatchPath({ kind: "snapshot", fixtures: [] })).toBeNull();
  });
});
