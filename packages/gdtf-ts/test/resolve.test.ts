// Total mechanical resolution: select by DMXFrom, unsorted-endpoint lerp,
// { attribute, value, unit } on every channel. Committed files plus synthetic
// third-party shapes (X4 oracle numbers). Run under Node, like contract.test.ts.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
import {
  combineDmx,
  emitterBindings,
  emitterPositions,
  lerpFunction,
  modeMasterNotes,
  parseDmxBound,
  parseGdtf,
  parseOffset,
  resolveMode,
  selectFunction,
  type GdtfDefinition,
} from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const authored = (...parts: string[]) =>
  resolve(here, "..", "..", "..", "definitions", "authored", join(...parts));

function load(name: string): GdtfDefinition {
  return parseGdtf(new Uint8Array(readFileSync(authored(name))));
}

const GLP = "GLP@impression 90 RGB@v1.gdtf";
const SPOKE = "Beamhouse@WLED STAR-TENT Spoke 23px@v1.gdtf";
const PROFILE = "Beamhouse@generic profile@v1.gdtf";

function gdtfBytes(descriptionXml: string): Uint8Array {
  return zipSync({ "description.xml": strToU8(descriptionXml) });
}

function thirdPartyMover(channels: string): GdtfDefinition {
  return parseGdtf(
    gdtfBytes(`<?xml version="1.0" encoding="UTF-8"?>
<GDTF DataVersion="1.2">
  <FixtureType FixtureTypeID="third-party-mover" Manufacturer="X" Name="mover">
    <AttributeDefinitions>
      <Attributes>
        <Attribute Name="Pan" PhysicalUnit="Angle"/>
        <Attribute Name="Dimmer" PhysicalUnit="None"/>
        <Attribute Name="Control1" PhysicalUnit="None"/>
      </Attributes>
    </AttributeDefinitions>
    <Models>
      <Model Name="Body" PrimitiveType="Cube" Length="0.2" Width="0.2" Height="0.2" File=""/>
    </Models>
    <Geometries>
      <Geometry Model="Body" Name="Body" Position="{1,0,0,0}{0,1,0,0}{0,0,1,0}{0,0,0,1}"/>
    </Geometries>
    <DMXModes>
      <DMXMode Geometry="Body" Name="Mover">
        <DMXChannels>${channels}</DMXChannels>
      </DMXMode>
    </DMXModes>
    <Revisions/>
  </FixtureType>
</GDTF>`),
  );
}

void describe("dmx bounds and offsets", () => {
  void test("byte/bit fractions parse to absolute values", () => {
    assert.deepEqual(parseDmxBound("0/1"), { value: 0, width: 1 });
    assert.deepEqual(parseDmxBound("32768/2"), { value: 32768, width: 2 });
    assert.deepEqual(parseDmxBound("0/2"), { value: 0, width: 2 });
    assert.deepEqual(parseDmxBound(undefined), { value: 0, width: 1 });
  });

  void test("offsets split 1-based; empty marks a virtual channel", () => {
    assert.deepEqual(parseOffset("1,2"), [1, 2]);
    assert.deepEqual(parseOffset("1"), [1]);
    assert.deepEqual(parseOffset(""), []);
    assert.deepEqual(parseOffset(undefined), []);
  });

  void test("bytes combine coarse-first", () => {
    assert.equal(combineDmx([128, 0]), 32768);
    assert.equal(combineDmx([255, 255]), 65535);
    assert.equal(combineDmx([100]), 100);
  });
});

void describe("select and lerp", () => {
  const pan = thirdPartyMover(
    `<DMXChannel DMXBreak="1" Geometry="Body" Offset="1,2">
      <LogicalChannel Attribute="Pan">
        <ChannelFunction Attribute="Pan" Name="Pan" DMXFrom="0/2" PhysicalFrom="311" PhysicalTo="-311"/>
      </LogicalChannel>
    </DMXChannel>`,
  );
  const fn = pan.modes[0]?.channels[0]?.functions[0];
  if (!fn) throw new Error("synthetic mover lost its Pan function");
  void test("X4 oracle: DMX 0 resolves to +311, never -311", () => {
    const resolved = resolveMode(pan, "Mover", () => 0);
    assert.deepEqual(
      resolved?.map(({ attribute, value, unit }) => [attribute, value, unit]),
      [["Pan", 311, "Angle"]],
    );
  });

  void test("backwards endpoints lerp without sorting: full scale reaches -311", () => {
    assert.equal(fn.dmxToValue, 65535);
    assert.equal(lerpFunction(fn, 65535), -311);
    assert.equal(lerpFunction(fn, 32768), 311 + (32768 / 65535) * -622);
    assert.equal(selectFunction([fn], 0), fn);
  });

  void test("missing modes resolve to null: marked, never guessed", () => {
    assert.equal(
      resolveMode(pan, "Nope", () => 0),
      null,
    );
  });
});

void describe("committed authored profiles", () => {
  void test("GLP shutter selects by DMXFrom with declared units", () => {
    const glp = load(GLP);
    const at = (dmx: number) =>
      resolveMode(glp, "Normal", () => dmx)?.find(
        (entry) => entry.attribute === "Shutter1" || entry.attribute === "Shutter1Strobe",
      );
    assert.deepEqual(at(0), { attribute: "Shutter1", value: 0, unit: "None" });
    assert.equal(at(100)?.attribute, "Shutter1Strobe");
    assert.equal(at(100)?.unit, "Frequency");
    assert.deepEqual(at(255), { attribute: "Shutter1", value: 1, unit: "None" });
  });

  void test("GLP 16-bit Pan combines coarse and fine", () => {
    const glp = load(GLP);
    const pan = (coarse: number, fine: number) =>
      resolveMode(glp, "Normal", (_dmxBreak, offset) => (offset === 1 ? coarse : fine))?.[0];
    assert.equal(pan(0, 0)?.value, -330);
    assert.equal(pan(255, 255)?.value, 330);
    assert.equal(pan(128, 0)?.value, -330 + (32768 / 65535) * 660);
    assert.equal(pan(0, 0)?.unit, "Angle");
  });

  void test("attribute units ride the function, not the channel", () => {
    const glp = load(GLP);
    assert.equal(glp.attributeUnits["Pan"], "Angle");
    assert.equal(glp.attributeUnits["ColorAdd_R"], "ColorComponent");
    assert.equal(glp.attributeUnits["Dimmer"], "LuminousIntensity");
    assert.equal(glp.attributeUnits["Shutter1"], "None");
    assert.equal(glp.attributeUnits["Shutter1Strobe"], "Frequency");
  });

  void test("profile Zoom is virtual: Default resolves, the hang override wins", () => {
    const profile = load(PROFILE);
    const zoom = profile.modes[0]?.channels.find((channel) => channel.attribute === "Zoom");
    assert.deepEqual(zoom?.offsets, []);
    assert.equal(
      resolveMode(profile, "Dimmer", () => 0)?.find((entry) => entry.attribute === "Zoom")?.value,
      25,
    );
    assert.equal(
      resolveMode(profile, "Dimmer", () => 0, { Zoom: 30 })?.find(
        (entry) => entry.attribute === "Zoom",
      )?.value,
      30,
    );
  });

  void test("spoke expands to 23 emitters striding 3 slots from offset 1", () => {
    const spoke = load(SPOKE);
    const bindings = emitterBindings(spoke, "23px RGB 69-channel");
    assert.equal(bindings?.length, 69);
    const bases = [...new Set(bindings?.map((binding) => binding.base))].sort((a, b) => a - b);
    assert.deepEqual(
      bases,
      Array.from({ length: 23 }, (_, index) => 1 + index * 3),
    );
    assert.ok(bindings?.every((binding) => binding.dmxBreak === 1));
  });

  void test("spoke emitter origins tile the 1.5 m body on a 65.217 mm pitch", () => {
    const spoke = load(SPOKE);
    const placed = emitterPositions(spoke).find((entry) => entry.geometry === "Pixel");
    if (!placed) throw new Error("spoke lost its Pixel grouping");
    assert.equal(placed.positions.length, 23);
    const xs = placed.positions.map(([x]) => x);
    for (let index = 1; index < xs.length; index += 1) {
      assert.ok(Math.abs(xs[index]! - xs[index - 1]! - 0.065217) < 2e-6);
    }
  });
});
void describe("parsed but never resolved", () => {
  void test("ChannelSets ride along and change nothing", () => {
    const definition = thirdPartyMover(
      `<DMXChannel DMXBreak="1" Geometry="Body" Offset="1">
        <LogicalChannel Attribute="Dimmer">
          <ChannelFunction Attribute="Dimmer" Name="Dimmer" DMXFrom="0/1" DMXTo="255/1" PhysicalFrom="0" PhysicalTo="1">
            <ChannelSet Name="Closed" DMXFrom="0/1" DMXTo="0/1"/>
            <ChannelSet Name="Open" DMXFrom="1/1" DMXTo="255/1"/>
          </ChannelFunction>
        </LogicalChannel>
      </DMXChannel>`,
    );
    const fn = definition.modes[0]?.channels[0]?.functions[0];
    assert.equal(fn?.sets.length, 2);
    assert.equal(fn?.sets[0]?.name, "Closed");
    assert.equal(resolveMode(definition, "Mover", () => 255)?.[0]?.value, 1);
  });

  void test("ModeMaster is detected for the diagnostic and ignored by select", () => {
    const definition = parseGdtf(
      gdtfBytes(`<?xml version="1.0" encoding="UTF-8"?>
<GDTF DataVersion="1.2">
  <FixtureType FixtureTypeID="mastering" Manufacturer="X" Name="m">
    <AttributeDefinitions><Attributes><Attribute Name="Dimmer" PhysicalUnit="None"/></Attributes></AttributeDefinitions>
    <Models><Model Name="Body" PrimitiveType="Cube" Length="0.2" Width="0.2" Height="0.2" File=""/></Models>
    <Geometries><Geometry Model="Body" Name="Body" Position="{1,0,0,0}{0,1,0,0}{0,0,1,0}{0,0,0,1}"/></Geometries>
    <DMXModes><DMXMode Geometry="Body" Name="M">
      <DMXChannels><DMXChannel DMXBreak="1" Geometry="Body" Offset="1">
        <LogicalChannel Attribute="Dimmer">
          <ChannelFunction Attribute="Dimmer" Name="A" DMXFrom="0/1" DMXTo="127/1" PhysicalFrom="0" PhysicalTo="0.5" ModeMaster="Grand"/>
          <ChannelFunction Attribute="Dimmer" Name="B" DMXFrom="128/1" DMXTo="255/1" PhysicalFrom="0.5" PhysicalTo="1" ModeMaster="Grand"/>
        </LogicalChannel>
      </DMXChannel></DMXChannels>
    </DMXMode></DMXModes>
    <Revisions/>
  </FixtureType>
</GDTF>`),
    );
    const notes = modeMasterNotes(definition);
    assert.equal(notes.length, 2);
    assert.ok(notes[0]?.includes("DMXFrom"));
    assert.equal(resolveMode(definition, "M", () => 200)?.[0]?.value, 0.5 + (72 / 127) * 0.5);
  });

  void test("no committed authored profile carries a ModeMaster", () => {
    for (const name of [GLP, SPOKE, PROFILE]) assert.deepEqual(modeMasterNotes(load(name)), []);
  });
});
