import { describe, expect, test } from "bun:test";
import type { PersistedScene } from "../app/src/scene.ts";
import { apply, applyPatchIngest, undoEntry } from "../app/src/scene.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseBhs,
  serializeBhs,
  BhsError,
  BhsUnknownKeyError,
  BhsClassesBlockError,
  BhsEmittersBlockError,
  BhsDefinitionError,
  BhsFixtureError,
  BhsOverrideError,
  BhsMissingPropertyError,
  isShareableBhsPatch,
  bhsPatchPath,
  sceneToDocument,
} from "../app/src/bhs.ts";

// ── Round-trip: load text → model → save text → byte-identical ──

describe("bhs document round-trip", () => {
  test("mizer path variant round-trips byte-identical", () => {
    const text =
      '{"patch":{"kind":"mizer","path":"~/mizer/warehouse.yml"},"density":0.32,"beamLength":10}';
    const doc = parseBhs(text);
    expect(serializeBhs(doc)).toBe(text);
  });

  test("mvr path variant round-trips byte-identical", () => {
    const text =
      '{"patch":{"kind":"mvr","path":"shows/warehouse.mvr"},"density":0.32,"beamLength":10}';
    const doc = parseBhs(text);
    expect(serializeBhs(doc)).toBe(text);
  });

  test("snapshot variant round-trips byte-identical with fixture data", () => {
    const text =
      '{"patch":{"kind":"snapshot","fixtures":[{"id":1,"position":[0,0,0]}]},"density":0.32,"beamLength":10}';
    const doc = parseBhs(text);
    expect(serializeBhs(doc)).toBe(text);
  });

  test("snapshot variant with empty fixtures array round-trips", () => {
    const text = '{"patch":{"kind":"snapshot","fixtures":[]},"density":0.32,"beamLength":10}';
    const doc = parseBhs(text);
    expect(serializeBhs(doc)).toBe(text);
  });

  test("snapshot variant with full columnar payload round-trips", () => {
    const text =
      '{"patch":{"kind":"snapshot","fixtures":[[-1,0,"default",[[1,1,69]],[0,500,0],[0,0,0]]],"definitions":[["p",0,1000,1000,1000]],"views":{"Front":[0,3,8,0,1,0]},"takenAt":1756730620000},"density":0.32,"beamLength":10}';
    const doc = parseBhs(text);
    expect(serializeBhs(doc)).toBe(text);
  });

  // ── Issue #82: definitions and fixtures blocks ──

  test("with strip definition and local fixture round-trips byte-identical", () => {
    const text =
      '{"patch":{"kind":"snapshot","fixtures":[]},"definitions":{"bhs:spoke":{"kind":"strip","pixels":23,"pitchMm":33.33,"channelsPerPixel":3,"primitive":"Cube"}},"fixtures":[{"id":-1,"definition":"bhs:spoke","mode":"default","addresses":[{"universe":100,"address":1,"footprint":69}]}],"density":0.32,"beamLength":10}';
    const doc = parseBhs(text);
    expect(serializeBhs(doc)).toBe(text);
  });

  test("with primitive definition round-trips byte-identical", () => {
    const text =
      '{"patch":{"kind":"snapshot","fixtures":[]},"definitions":{"bhs:scenery":{"kind":"primitive","primitive":"Cube","width":1,"depth":2,"height":0.5}},"density":0.32,"beamLength":10}';
    const doc = parseBhs(text);
    expect(serializeBhs(doc)).toBe(text);
  });

  test("with gdtf fixture id round-trips byte-identical", () => {
    const text =
      '{"patch":{"kind":"snapshot","fixtures":[]},"fixtures":[{"id":-1,"definition":"gdtf:9C7854E1-32D5-4DE9-BB8E-6D121F27CF48","mode":"Normal","addresses":[{"universe":1,"address":1,"footprint":1}]}],"density":0.32,"beamLength":10}';
    const doc = parseBhs(text);
    expect(serializeBhs(doc)).toBe(text);
  });

  test("with ofl fixture id round-trips byte-identical", () => {
    const text =
      '{"patch":{"kind":"snapshot","fixtures":[]},"fixtures":[{"id":-2,"definition":"ofl:generic:dimmer","mode":"Dimmer","addresses":[{"universe":1,"address":85,"footprint":1}]}],"density":0.32,"beamLength":10}';
    const doc = parseBhs(text);
    expect(serializeBhs(doc)).toBe(text);
  });

  test("scene object fixture round-trips byte-identical", () => {
    const text =
      '{"patch":{"kind":"snapshot","fixtures":[]},"fixtures":[{"id":-3,"definition":"bhs:scenery","mode":"","addresses":[]}],"density":0.32,"beamLength":10}';
    const doc = parseBhs(text);
    expect(serializeBhs(doc)).toBe(text);
  });

  // ── Issue #83: density, beamLength, and views ──

  test("with density and beamLength round-trips byte-identical", () => {
    const text = '{"patch":{"kind":"snapshot","fixtures":[]},"density":0.42,"beamLength":8}';
    const doc = parseBhs(text);
    expect(serializeBhs(doc)).toBe(text);
  });

  test("with density, beamLength, and views round-trips byte-identical", () => {
    const text =
      '{"patch":{"kind":"snapshot","fixtures":[]},"density":0.42,"beamLength":8,"views":{"Front":{"position":[0,3,8],"target":[0,1,0]}}}';
    const doc = parseBhs(text);
    expect(serializeBhs(doc)).toBe(text);
  });

  test("with density, beamLength, views, definitions, and fixtures round-trips byte-identical", () => {
    const text =
      '{"patch":{"kind":"snapshot","fixtures":[]},"density":0.32,"beamLength":10,"views":{"Front":{"position":[0,3,8],"target":[0,1,0]},"Side":{"position":[8,3,0],"target":[0,1,0]}},"definitions":{"bhs:spoke":{"kind":"strip","pixels":23,"pitchMm":33.33,"channelsPerPixel":3,"primitive":"Cube"}},"fixtures":[{"id":-1,"definition":"bhs:spoke","mode":"default","addresses":[{"universe":100,"address":1,"footprint":69}]}]}';
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

// ── Issue #83: scene property validation ──

test("rejects missing density with named BhsMissingPropertyError", () => {
  expect(() => parseBhs('{"patch":{"kind":"snapshot","fixtures":[]},"beamLength":10}')).toThrow(
    BhsMissingPropertyError,
  );
});

test("rejects missing beamLength with named BhsMissingPropertyError", () => {
  expect(() => parseBhs('{"patch":{"kind":"snapshot","fixtures":[]},"density":0.32}')).toThrow(
    BhsMissingPropertyError,
  );
});

test("rejects missing both density and beamLength with named BhsMissingPropertyError", () => {
  expect(() => parseBhs('{"patch":{"kind":"snapshot","fixtures":[]}}')).toThrow(
    BhsMissingPropertyError,
  );
});

test("rejects density out of 0-1 range", () => {
  expect(() =>
    parseBhs('{"patch":{"kind":"snapshot","fixtures":[]},"density":1.5,"beamLength":10}'),
  ).toThrow(BhsError);
  expect(() =>
    parseBhs('{"patch":{"kind":"snapshot","fixtures":[]},"density":-0.1,"beamLength":10}'),
  ).toThrow(BhsError);
});

test("rejects density with non-finite value", () => {
  expect(() =>
    parseBhs('{"patch":{"kind":"snapshot","fixtures":[]},"density":NaN,"beamLength":10}'),
  ).toThrow(BhsError);
});

test("rejects beamLength out of 1-40 range", () => {
  expect(() =>
    parseBhs('{"patch":{"kind":"snapshot","fixtures":[]},"density":0.32,"beamLength":0}'),
  ).toThrow(BhsError);
  expect(() =>
    parseBhs('{"patch":{"kind":"snapshot","fixtures":[]},"density":0.32,"beamLength":50}'),
  ).toThrow(BhsError);
});

test("rejects beamLength with non-finite value", () => {
  expect(() =>
    parseBhs('{"patch":{"kind":"snapshot","fixtures":[]},"density":0.32,"beamLength":Infinity}'),
  ).toThrow(BhsError);
});

test("density and beamLength are validated even when other keys present", () => {
  expect(() =>
    parseBhs(
      '{"patch":{"kind":"snapshot","fixtures":[]},"definitions":{},"fixtures":[],"views":{}}',
    ),
  ).toThrow(BhsMissingPropertyError);
});

test("rejects views with non-object value", () => {
  expect(() =>
    parseBhs(
      '{"patch":{"kind":"snapshot","fixtures":[]},"density":0.32,"beamLength":10,"views":"string"}',
    ),
  ).toThrow(BhsError);
  expect(() =>
    parseBhs(
      '{"patch":{"kind":"snapshot","fixtures":[]},"density":0.32,"beamLength":10,"views":[]}',
    ),
  ).toThrow(BhsError);
});

test("rejects view entry with missing position", () => {
  expect(() =>
    parseBhs(
      '{"patch":{"kind":"snapshot","fixtures":[]},"density":0.32,"beamLength":10,"views":{"Front":{"target":[0,1,0]}}}',
    ),
  ).toThrow(BhsError);
});

test("rejects view entry with non-array position", () => {
  expect(() =>
    parseBhs(
      '{"patch":{"kind":"snapshot","fixtures":[]},"density":0.32,"beamLength":10,"views":{"Front":{"position":"invalid","target":[0,1,0]}}}',
    ),
  ).toThrow(BhsError);
});

test("rejects view entry with position of wrong length", () => {
  expect(() =>
    parseBhs(
      '{"patch":{"kind":"snapshot","fixtures":[]},"density":0.32,"beamLength":10,"views":{"Front":{"position":[0,3],"target":[0,1,0]}}}',
    ),
  ).toThrow(BhsError);
});

test("rejects view entry with missing target", () => {
  expect(() =>
    parseBhs(
      '{"patch":{"kind":"snapshot","fixtures":[]},"density":0.32,"beamLength":10,"views":{"Front":{"position":[0,3,8]}}}',
    ),
  ).toThrow(BhsError);
});

test("rejects view entry with non-finite values in position", () => {
  expect(() =>
    parseBhs(
      '{"patch":{"kind":"snapshot","fixtures":[]},"density":0.32,"beamLength":10,"views":{"Front":{"position":[0,NaN,8],"target":[0,1,0]}}}',
    ),
  ).toThrow(BhsError);
});

// ── Patch shareability: only snapshot is shareable ──

describe("patch shareability", () => {
  test("mizer patch is not shareable", () => {
    const doc = parseBhs('{"patch":{"kind":"mizer","path":"x"},"density":0.32,"beamLength":10}');
    expect(isShareableBhsPatch(doc.patch)).toBe(false);
  });

  test("mvr patch is not shareable", () => {
    const doc = parseBhs('{"patch":{"kind":"mvr","path":"x"},"density":0.32,"beamLength":10}');
    expect(isShareableBhsPatch(doc.patch)).toBe(false);
  });

  test("snapshot patch is shareable", () => {
    const doc = parseBhs(
      '{"patch":{"kind":"snapshot","fixtures":[]},"density":0.32,"beamLength":10}',
    );
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

// ── Issue #85: ten-spoke star fixture ──
// The landed .bhs schema stores fixture metadata (id, definition, mode,
// addresses) but has no "placements" block — Placement lives in the scene's
// overrides (PersistedScene.overrides) or in share snapshot fixture entries.
// The fixture file therefore defines the ten spokes' metadata only; rotation
// and origin-pivot semantics are verified in the share round-trip and
// eulerMatrix/applyMatrix tests in beam.test.ts.

describe("star tent fixture", () => {
  const fixtureDir = resolve(import.meta.dir, "fixtures");
  const starFixtureText = readFileSync(resolve(fixtureDir, "star-tent.bhs"), "utf-8");

  test("star file loads with ten spokes and the definition", () => {
    const doc = parseBhs(starFixtureText);
    expect(doc.definitions).toBeDefined();
    const definition = doc.definitions!["bhs:star-spoke"];
    expect(definition).toBeDefined();
    expect(definition!.kind).toBe("strip");
    if (definition!.kind === "strip") {
      expect(definition!.pixels).toBe(23);
    }

    expect(doc.fixtures).toBeDefined();
    expect(doc.fixtures!.length).toBe(10);
    for (const fixture of doc.fixtures!) {
      expect(fixture.id).toBeLessThan(0); // local fixtures are negative ids
      expect(fixture.definition).toBe("bhs:star-spoke");
      expect(fixture.mode).toBe("23px RGB");
      expect(fixture.addresses.length).toBe(1);
    }
    expect(doc.density).toBe(0.32);
    expect(doc.beamLength).toBe(10);
  });

  test("star fixture round-trips byte-identical", () => {
    const doc = parseBhs(starFixtureText);
    const serialized = JSON.stringify(doc);
    expect(serialized).toBe(starFixtureText);
  });

  test("star fixture with modified density round-trips", () => {
    const text =
      '{"patch":{"kind":"snapshot","fixtures":[]},"definitions":{"bhs:star-spoke":{"kind":"strip","pixels":23,"pitchMm":65,"channelsPerPixel":3,"primitive":"Cube"}},"fixtures":[{"id":-1,"definition":"bhs:star-spoke","mode":"23px RGB","addresses":[{"universe":2,"address":1,"footprint":69}]},{"id":-2,"definition":"bhs:star-spoke","mode":"23px RGB","addresses":[{"universe":2,"address":70,"footprint":69}]},{"id":-3,"definition":"bhs:star-spoke","mode":"23px RGB","addresses":[{"universe":2,"address":139,"footprint":69}]},{"id":-4,"definition":"bhs:star-spoke","mode":"23px RGB","addresses":[{"universe":2,"address":208,"footprint":69}]},{"id":-5,"definition":"bhs:star-spoke","mode":"23px RGB","addresses":[{"universe":2,"address":277,"footprint":69}]},{"id":-6,"definition":"bhs:star-spoke","mode":"23px RGB","addresses":[{"universe":2,"address":346,"footprint":69}]},{"id":-7,"definition":"bhs:star-spoke","mode":"23px RGB","addresses":[{"universe":2,"address":415,"footprint":69}]},{"id":-8,"definition":"bhs:star-spoke","mode":"23px RGB","addresses":[{"universe":3,"address":1,"footprint":69}]},{"id":-9,"definition":"bhs:star-spoke","mode":"23px RGB","addresses":[{"universe":3,"address":70,"footprint":69}]},{"id":-10,"definition":"bhs:star-spoke","mode":"23px RGB","addresses":[{"universe":3,"address":139,"footprint":69}]}],"density":0.42,"beamLength":8}';
    const doc = parseBhs(text);
    expect(doc.density).toBe(0.42);
    expect(doc.beamLength).toBe(8);
    expect(serializeBhs(doc)).toBe(text);
  });
});

// ── Issue #85: overrides block ──

describe("overrides block", () => {
  test("overrides with pos and rot round-trips byte-identical", () => {
    const text =
      '{"patch":{"kind":"snapshot","fixtures":[]},"overrides":{"-1":{"pos":[0,3,0],"rot":[0,0,0]}},"density":0.32,"beamLength":10}';
    const doc = parseBhs(text);
    expect(doc.overrides).toBeDefined();
    expect(doc.overrides!["-1"]!.pos).toEqual([0, 3, 0]);
    expect(doc.overrides!["-1"]!.rot).toEqual([0, 0, 0]);
    expect(serializeBhs(doc)).toBe(text);
  });

  test("multiple overrides round-trip byte-identical", () => {
    const text =
      '{"patch":{"kind":"snapshot","fixtures":[]},"overrides":{"-1":{"pos":[0,3,0],"rot":[0,0,0]},"-2":{"pos":[2,1.5,-3],"rot":[45,0,0]}},"density":0.32,"beamLength":10}';
    const doc = parseBhs(text);
    expect(Object.keys(doc.overrides!)).toEqual(["-1", "-2"]);
    expect(serializeBhs(doc)).toBe(text);
  });

  test("mixed integer-string override keys parse correctly", () => {
    const doc = parseBhs(
      '{"patch":{"kind":"snapshot","fixtures":[]},"overrides":{"-1":{"pos":[0,3,0],"rot":[0,0,0]},"12":{"pos":[2,1.5,-3],"rot":[45,0,0]}},"density":0.32,"beamLength":10}',
    );
    expect(doc.overrides!["-1"]!.pos).toEqual([0, 3, 0]);
    expect(doc.overrides!["12"]!.rot).toEqual([45, 0, 0]);
  });

  test("overrides with definitions and fixtures round-trips byte-identical", () => {
    const text =
      '{"patch":{"kind":"snapshot","fixtures":[]},"definitions":{"bhs:spoke":{"kind":"strip","pixels":23,"pitchMm":65,"channelsPerPixel":3,"primitive":"Cube"}},"fixtures":[{"id":-1,"definition":"bhs:spoke","mode":"23px RGB","addresses":[{"universe":2,"address":1,"footprint":69}]}],"overrides":{"-1":{"pos":[0,3,0],"rot":[0,0,0]}},"density":0.32,"beamLength":10}';
    const doc = parseBhs(text);
    expect(doc.overrides!["-1"]!.pos).toEqual([0, 3, 0]);
    expect(serializeBhs(doc)).toBe(text);
  });

  test("rejects overrides with non-object value", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"snapshot","fixtures":[]},"overrides":"string","density":0.32,"beamLength":10}',
      ),
    ).toThrow(BhsOverrideError);
  });

  test("rejects overrides with array value", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"snapshot","fixtures":[]},"overrides":[],"density":0.32,"beamLength":10}',
      ),
    ).toThrow(BhsOverrideError);
  });

  test("rejects override entry with non-object value", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"snapshot","fixtures":[]},"overrides":{"-1":"string"},"density":0.32,"beamLength":10}',
      ),
    ).toThrow(BhsOverrideError);
  });

  test("rejects override entry with unknown key", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"snapshot","fixtures":[]},"overrides":{"-1":{"pos":[0,0,0],"rot":[0,0,0],"uuid":"abc"}},"density":0.32,"beamLength":10}',
      ),
    ).toThrow(BhsOverrideError);
  });

  test("rejects override entry missing pos", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"snapshot","fixtures":[]},"overrides":{"-1":{"rot":[0,0,0]}},"density":0.32,"beamLength":10}',
      ),
    ).toThrow(BhsOverrideError);
  });

  test("rejects override entry missing rot", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"snapshot","fixtures":[]},"overrides":{"-1":{"pos":[0,0,0]}},"density":0.32,"beamLength":10}',
      ),
    ).toThrow(BhsOverrideError);
  });

  test("rejects override pos with non-array", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"snapshot","fixtures":[]},"overrides":{"-1":{"pos":"string","rot":[0,0,0]}},"density":0.32,"beamLength":10}',
      ),
    ).toThrow(BhsOverrideError);
  });

  test("rejects override pos with wrong length", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"snapshot","fixtures":[]},"overrides":{"-1":{"pos":[0,0],"rot":[0,0,0]}},"density":0.32,"beamLength":10}',
      ),
    ).toThrow(BhsOverrideError);
  });

  test("rejects override pos with non-finite value", () => {
    // 1e999 overflows to Infinity in JavaScript's JSON parser
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"snapshot","fixtures":[]},"overrides":{"-1":{"pos":[0,1e999,0],"rot":[0,0,0]}},"density":0.32,"beamLength":10}',
      ),
    ).toThrow(BhsOverrideError);
  });

  test("rejects override rot with non-array", () => {
    expect(() =>
      parseBhs(
        '{"patch":{"kind":"snapshot","fixtures":[]},"overrides":{"-1":{"pos":[0,0,0],"rot":45}},"density":0.32,"beamLength":10}',
      ),
    ).toThrow(BhsOverrideError);
  });
});

// ── Issue #84: command/ingest write separation ──

function sceneWithData(): PersistedScene {
  return {
    overrides: { "1": { position: [1, 2, 3], rotation: [10, 0, 0] } },
    views: { Front: { position: [0, 3, 8], target: [0, 1, 0] } },
    arrays: {},
    definitions: {
      "bhs:test": {
        kind: "strip",
        pixels: 10,
        pitchMm: 33.33,
        channelsPerPixel: 3,
        primitive: "Cube" as const,
      },
    },
    fixtures: {
      "-1": {
        id: -1,
        definition: "bhs:test",
        mode: "default",
        addresses: [{ universe: 1, address: 1, footprint: 30 }],
      },
    },
    patchPath: "/test/project.mizer",
    patch: {
      "1": {
        id: 1,
        definition: "gdtf:foo",
        mode: "Normal",
        addresses: [{ universe: 1, address: 1, footprint: 1 }],
      },
    },
    patchKind: null,
    atmosphere: { density: 0.32, beamLengthM: 10 },
  };
}

describe("write separation", () => {
  test("N placement.set commands produce zero patch writes", () => {
    const scene = sceneWithData();
    const docBefore = sceneToDocument(scene);
    // Apply two placement commands
    const after1 = apply(
      {
        kind: "placement.set",
        fixtureIds: [1],
        placements: { "1": { position: [0, 0, 5], rotation: [0, 0, 0] } },
      },
      scene,
    );
    const after2 = apply(
      {
        kind: "placement.set",
        fixtureIds: [2],
        placements: { "2": { position: [4, 0, 0], rotation: [90, 0, 0] } },
      },
      after1,
    );
    const docAfter = sceneToDocument(after2);
    // Patch block is untouched
    expect(docAfter.patch).toEqual(docBefore.patch);
    // Override did change — verify the invariant isn't vacuous
    expect(docAfter.overrides!["1"]!.pos).toEqual([0, 0, 5]);
  });

  test("placement.clear command produces zero patch writes", () => {
    const scene = sceneWithData();
    const docBefore = sceneToDocument(scene);
    const after = apply({ kind: "placement.clear", fixtureIds: [1] }, scene);
    const docAfter = sceneToDocument(after);
    expect(docAfter.patch).toEqual(docBefore.patch);
    // Override was removed — overrides block absent when empty
    expect(docAfter.overrides).toBeUndefined();
  });

  test("camera.saveView command produces zero patch writes", () => {
    const scene = sceneWithData();
    const docBefore = sceneToDocument(scene);
    const after = apply(
      { kind: "camera.saveView", name: "Side", view: { position: [8, 3, 0], target: [0, 1, 0] } },
      scene,
    );
    const docAfter = sceneToDocument(after);
    expect(docAfter.patch).toEqual(docBefore.patch);
    // A new view appeared
    expect(docAfter.views!["Side"]).toBeDefined();
  });

  test("array.set command produces zero patch writes", () => {
    const scene = sceneWithData();
    const docBefore = sceneToDocument(scene);
    const after = apply(
      {
        kind: "array.set",
        id: "line1",
        array: {
          kind: "line",
          id: "line1",
          memberIds: [1, 2],
          origin: [0, 0, 0] as [number, number, number],
          spacing: [1, 0, 0] as [number, number, number],
        },
      },
      scene,
    );
    const docAfter = sceneToDocument(after);
    expect(docAfter.patch).toEqual(docBefore.patch);
  });

  test("definition.set command produces zero patch writes", () => {
    const scene = sceneWithData();
    const docBefore = sceneToDocument(scene);
    const after = apply(
      {
        kind: "definition.set",
        id: "bhs:test",
        value: {
          kind: "strip",
          pixels: 20,
          pitchMm: 50,
          channelsPerPixel: 3,
          primitive: "Cube" as const,
        },
      },
      scene,
    );
    const docAfter = sceneToDocument(after);
    expect(docAfter.patch).toEqual(docBefore.patch);
    // Definition changed — narrow the union
    const def = docAfter.definitions!["bhs:test"]!;
    expect(def.kind === "strip" ? def.pixels : 0).toBe(20);
  });

  test("patch ingest produces zero non-patch writes", () => {
    const scene = sceneWithData();
    const docBefore = sceneToDocument(scene);
    const after = applyPatchIngest(
      scene,
      {
        fixtures: [
          {
            id: 2,
            definition: "gdtf:bar",
            mode: "Normal",
            addresses: [{ universe: 1, address: 5, footprint: 1 }],
          },
        ],
      },
      "/new/path.mizer",
    );
    const docAfter = sceneToDocument(after);
    // Patch changed — verify every non-patch block individually unchanged
    expect(docAfter.patch).not.toEqual(docBefore.patch);
    expect(docAfter.definitions).toEqual(docBefore.definitions);
    expect(docAfter.fixtures).toEqual(docBefore.fixtures);
    expect(docAfter.density).toEqual(docBefore.density);
    expect(docAfter.beamLength).toEqual(docBefore.beamLength);
    expect(docAfter.overrides).toEqual(docBefore.overrides);
    expect(docAfter.views).toEqual(docBefore.views);
  });

  test("fixture.add command produces zero patch writes", () => {
    const scene = sceneWithData();
    const docBefore = sceneToDocument(scene);
    const after = apply(
      {
        kind: "fixture.add",
        fixture: {
          id: -2,
          definition: "bhs:test",
          mode: "default",
          addresses: [{ universe: 1, address: 31, footprint: 30 }],
        },
        placement: { position: [0, 0, 0], rotation: [0, 0, 0] },
      },
      scene,
    );
    const docAfter = sceneToDocument(after);
    expect(docAfter.patch).toEqual(docBefore.patch);
    // Fixtures block gained a new entry — not vacuous
    expect(docAfter.fixtures!.length).toBe(2);
  });

  test("path-bearing patch kind survives command round-trip", () => {
    // Start from a scene loaded from a document with {"patch":{"kind":"mizer","path":"/original/project.mizer"}}
    const scene: PersistedScene = {
      ...sceneWithData(),
      patchKind: "mizer",
      patchPath: "/original/project.mizer",
    };
    const docBefore = sceneToDocument(scene);
    expect(docBefore.patch).toEqual({ kind: "mizer", path: "/original/project.mizer" });

    // Run every command kind that writes a non-patch block
    let s = apply(
      {
        kind: "placement.set",
        fixtureIds: [1],
        placements: { "1": { position: [0, 3, 0], rotation: [0, 0, 0] } },
      },
      scene,
    );
    s = apply({ kind: "placement.clear", fixtureIds: [2] }, s);
    s = apply(
      {
        kind: "fixture.add",
        fixture: {
          id: -2,
          definition: "bhs:test",
          mode: "default",
          addresses: [{ universe: 1, address: 31, footprint: 30 }],
        },
        placement: { position: [1, 2, 3], rotation: [0, 0, 0] },
      },
      s,
    );
    s = apply(
      {
        kind: "definition.set",
        id: "bhs:test",
        value: {
          kind: "strip",
          pixels: 20,
          pitchMm: 50,
          channelsPerPixel: 3,
          primitive: "Cube" as const,
        },
      },
      s,
    );
    s = apply(
      { kind: "camera.saveView", name: "Side", view: { position: [8, 3, 0], target: [0, 1, 0] } },
      s,
    );
    const docAfter = sceneToDocument(s);
    // The mizer path-bearing patch block must still be verbatim — NOT shape-shifted to snapshot
    expect(docAfter.patch).toEqual({ kind: "mizer", path: "/original/project.mizer" });
  });

  test("undo of a placement.set restores prior placement with patch untouched", () => {
    const scene = sceneWithData();
    const docBefore = sceneToDocument(scene);
    // Apply a command and push to a history stack
    const after = apply(
      {
        kind: "placement.set",
        fixtureIds: [1],
        placements: { "1": { position: [9, 9, 9], rotation: [0, 0, 0] } },
      },
      scene,
    );
    // Build a history entry like SceneCommands does (before=scene, after=result)
    const history = [
      {
        command: {} as never,
        before: structuredClone(scene),
        after: structuredClone(after),
        agent: false,
      },
    ];
    // Drive the real undoEntry pure function — the same logic SceneCommands.undo uses
    const undone = undoEntry(history, 1)!;
    const docUndone = sceneToDocument(undone.scene);
    // Placement is back to original
    expect(undone.scene.overrides["1"]).toEqual(scene.overrides["1"]);
    // Patch is untouched before, after, and undone
    expect(docUndone.patch).toEqual(docBefore.patch);
  });
});
