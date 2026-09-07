// Contract tests: committed fixtures plus external-format oracles.
// Run under Node: node --test packages/gdtf-ts/test/contract.test.ts
// (kept to erasable syntax so Node type-stripping runs them directly).

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyToPoint,
  expandReferences,
  parseGdtf,
  parsePosition,
  proxyPrimitive,
  translationOf,
  worldTransform,
  type GdtfDefinition,
} from "../src/index.ts";
import { GDTF_QUIRKS } from "../src/quirks.ts";
import { deflateSync, strToU8, zipSync } from "fflate";

const here = dirname(fileURLToPath(import.meta.url));
const authored = (...parts: string[]) =>
  resolve(here, "..", "..", "..", "definitions", "authored", join(...parts));

function load(name: string): { bytes: Uint8Array; definition: GdtfDefinition } {
  const bytes = new Uint8Array(readFileSync(authored(name)));
  return { bytes, definition: parseGdtf(bytes) };
}

const GLP = "GLP@impression 90 RGB@v1.gdtf";
const SPOKE = "Beamhouse@WLED STAR-TENT Spoke 23px@v1.gdtf";

void describe("archive and identity", () => {
  void test("rejects non-archives and archives without a description", () => {
    assert.throws(() => parseGdtf(new Uint8Array([1, 2, 3])), /not a zip/);
    assert.throws(() => parseGdtf(deflateSync(strToU8("no"))), /not a zip/);
    assert.throws(() => parseGdtf(zipSync({ "other.txt": strToU8("x") })), /no description\.xml/);
  });

  void test("FixtureTypeID names the type; the GLP id matches its committed file", () => {
    const { definition } = load(GLP);
    assert.equal(definition.fixtureTypeId, "9C7854E1-32D5-4DE9-BB8E-6D121F27CF48");
    assert.equal(definition.manufacturer, "GLP");
    assert.equal(definition.modes[0]?.name, "Normal");
  });

  void test("revision hint is the last Revision Text in document order", () => {
    const spoke = load(SPOKE).definition;
    assert.match(spoke.revisionHint, /live WLED node/);
    assert.equal(spoke.revisionTexts.at(-1), spoke.revisionHint);
    // Empty <Revisions/> records nothing: hint stays empty, never guessed.
    const par = load("Beamhouse@generic PAR38@v1.gdtf").definition;
    assert.equal(par.revisionHint, "");
    assert.deepEqual(par.revisionTexts, []);
  });
});

void describe("rotation convention (external oracle: prototypes/gdtf-rotation-convention)", () => {
  void test("every committed Position is affine only when brace-groups are rows", () => {
    for (const name of [GLP, SPOKE]) {
      const { definition } = load(name);
      const visit = (position: readonly number[]) => {
        // Bottom row (0,0,0,1): the non-circular anchor from the oracle's part 1.
        assert.deepEqual([position[12], position[13], position[14], position[15]], [0, 0, 0, 1]);
      };
      const walk = (nodes: GdtfDefinition["geometries"]) => {
        for (const node of nodes) {
          visit(node.position);
          walk(node.children);
        }
      };
      walk(definition.geometries);
    }
  });

  void test("translation reads from the 4th column (spoke body at x 0.75)", () => {
    const { definition } = load(SPOKE);
    const body = definition.geometries.find((node) => node.name === "Body");
    assert.ok(body);
    assert.deepEqual(translationOf(body.position), [0.75, 0, 0.0084]);
  });

  void test("+90 deg about X carries +Z onto -Y: the head lands at y -0.211 (oracle part 4)", () => {
    const serialised =
      "{1.000000,0.000000,0.000000,0.000000}" +
      "{0.000000,0.000000,-1.000000,0.000000}" +
      "{0.000000,1.000000,0.000000,0.066000}{0,0,0,1}";
    const yoke = parsePosition(serialised);
    const head = applyToPoint(yoke, [0, 0, 0.211]);
    assert.ok(
      Math.abs(head[0]) < 1e-9 &&
        Math.abs(head[1] + 0.211) < 1e-9 &&
        Math.abs(head[2] - 0.066) < 1e-9,
    );
  });
});

void describe("transform composition", () => {
  void test("impression 90 pivots stack: head at 0.277 m, beam face at 0.3575 m", () => {
    const { definition } = load(GLP);
    const head = translationOf(worldTransform(definition.geometries, ["Base", "Yoke", "Head"]));
    assert.deepEqual(
      head.map((v) => Math.round(v * 1e6) / 1e6),
      [0, 0, 0.277],
    );
    const beam = translationOf(
      worldTransform(definition.geometries, ["Base", "Yoke", "Head", "Beam"]),
    );
    assert.deepEqual(
      beam.map((v) => Math.round(v * 1e6) / 1e6),
      [0, 0, 0.3575],
    );
  });
});

void describe("GeometryReference expansion and pixel stride", () => {
  void test("23 pixel references break at stride 3 from offset 1", () => {
    const { definition } = load(SPOKE);
    const grouping = definition.pixelGroupings.find((entry) => entry.geometry === "Pixel");
    assert.ok(grouping);
    assert.equal(grouping.members.length, 23);
    assert.deepEqual(
      grouping.members.map((member) => member.dmxOffset),
      Array.from({ length: 23 }, (_, index) => 1 + index * 3),
    );
  });

  void test("expansion keeps per-instance positions on a 65.217 mm pitch", () => {
    const { definition } = load(SPOKE);
    const expanded = expandReferences(definition.geometries);
    const diffuser = expanded
      .find((node) => node.name === "Body")
      ?.children.find((node) => node.name === "Diffuser");
    assert.ok(diffuser);
    assert.equal(diffuser.children.length, 23);
    const xs = diffuser.children.map((node) => translationOf(node.position)[0]);
    assert.ok(Math.abs(xs[0]! + 0.717391) < 1e-6);
    for (let index = 1; index < xs.length; index += 1) {
      assert.ok(Math.abs(xs[index]! - xs[index - 1]! - 0.065217) < 2e-6);
    }
  });
});

void describe("models, modes, and mesh bytes", () => {
  void test("spoke models carry their referenced GLBs; mesh-less models carry none", () => {
    const { definition } = load(SPOKE);
    for (const stem of ["led_profiles.previz_body", "led_profiles.previz_diffuser"]) {
      const model = definition.models.find((entry) => entry.file === stem);
      assert.ok(model?.glb && model.glb.length > 0);
      assert.equal(new TextDecoder().decode(model.glb.subarray(0, 4)), "glTF");
    }
    const pixel = definition.models.find((entry) => entry.name === "Pixel");
    assert.equal(pixel?.glb, null);
    const { definition: glp } = load(GLP);
    assert.ok(glp.models.every((model) => model.glb === null));
  });

  void test("mode channels bind geometry, offset, and first function", () => {
    const { definition } = load(GLP);
    const pan = definition.modes[0]?.channels[0];
    assert.equal(pan?.geometry, "Yoke");
    assert.equal(pan?.offset, "1,2");
    assert.equal(pan?.functions[0]?.attribute, "Pan");
  });

  void test("quirks stay exported data: proxy fallback maps Base1_1 to Cube", () => {
    assert.ok(GDTF_QUIRKS.length > 0);
    assert.equal(proxyPrimitive("Base1_1"), "Cube");
    assert.equal(proxyPrimitive("Cylinder"), "Cylinder");
  });
});
