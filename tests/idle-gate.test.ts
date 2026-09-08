import { describe, expect, test } from "bun:test";
import {
  copyLinearPixelsIfChanged,
  copyRgbBytesIfChanged,
  FixtureChangeGate,
  MarkGate,
  shouldRewriteMarks,
} from "../app/src/idle-gate.ts";

function slots(values: number[]): Uint8Array {
  return new Uint8Array(values);
}

const breaks = [{ universe: 1, address: 1, footprint: 3 }];

describe("changed-only fixture updates", () => {
  test("first frame resolves everything, idle frame resolves nothing", () => {
    const gate = new FixtureChangeGate();
    const fixtures = [
      { id: 1, addresses: breaks },
      { id: 2, addresses: [{ universe: 1, address: 4, footprint: 3 }] },
    ];
    const frames = new Map([[1, slots([10, 20, 30, 40, 50, 60])]]);
    expect([...gate.changed(fixtures, frames)].sort()).toEqual([1, 2]);
    // Identical bytes on the next frame: no fixture is re-resolved.
    expect([...gate.changed(fixtures, frames)].sort()).toEqual([]);
  });

  test("only fixtures whose break bytes changed are re-resolved", () => {
    const gate = new FixtureChangeGate();
    const fixtures = [
      { id: 1, addresses: breaks },
      { id: 2, addresses: [{ universe: 1, address: 4, footprint: 3 }] },
    ];
    gate.changed(fixtures, new Map([[1, slots([10, 20, 30, 40, 50, 60])]]));
    // Slot 1 moves: fixture 1 re-resolves, fixture 2 costs nothing.
    expect([...gate.changed(fixtures, new Map([[1, slots([11, 20, 30, 40, 50, 60])]]))]).toEqual([
      1,
    ]);
  });

  test("invalidated fixtures read as changed", () => {
    const gate = new FixtureChangeGate();
    const fixtures = [{ id: 1, addresses: breaks }];
    const frames = new Map([[1, slots([10, 20, 30])]]);
    expect([...gate.changed(fixtures, frames)]).toEqual([1]);
    expect([...gate.changed(fixtures, frames)]).toEqual([]);
    gate.invalidate(1);
    expect([...gate.changed(fixtures, frames)]).toEqual([1]);
    expect([...gate.changed(fixtures, frames)]).toEqual([]);
    gate.invalidate();
    expect([...gate.changed(fixtures, frames)]).toEqual([1]);
  });
});

describe("texel-gated uploads", () => {
  test("identical strip bytes copy nothing and report clean", () => {
    const source = new Uint8Array([26, 51, 77, 102, 128, 153]);
    const target = new Float32Array(8);
    expect(copyRgbBytesIfChanged(target, 2, source)).toBe(true); // first write applies
    expect(copyRgbBytesIfChanged(target, 2, source)).toBe(false); // static look: no upload
  });

  test("changed texel bytes apply and report dirty", () => {
    const target = new Float32Array(4);
    expect(copyRgbBytesIfChanged(target, 1, new Uint8Array([255, 0, 128]))).toBe(true);
    expect(target[0]).toBeCloseTo(1, 5);
    expect(target[2]).toBeCloseTo(128 / 255, 5);
    expect(target[3]).toBe(1);
  });

  test("resolved linear pixels gate the same way", () => {
    const target = new Float32Array([0, 0, 0, 1]);
    expect(copyLinearPixelsIfChanged(target, 1, [0.5, 0.25, 0.125])).toBe(true);
    expect(copyLinearPixelsIfChanged(target, 1, [0.5, 0.25, 0.125])).toBe(false);
    expect(copyLinearPixelsIfChanged(target, 1, null)).toBe(true); // cleared to black
    expect(target[0]).toBe(0);
  });
});

describe("mark gate signals", () => {
  test("placement, drag, swap, and resize inputs all open the gate", () => {
    const gate = new MarkGate();
    expect(gate.takeRewrite()).toBe(true); // initial layout paints once
    expect(gate.takeRewrite()).toBe(false); // then a static rig stays quiet
    gate.positionsChanged(); // setPlacement / gizmo drag / mesh swap / resize
    expect(gate.takeRewrite()).toBe(true);
    expect(gate.takeRewrite()).toBe(false);
    gate.cameraChanged(); // orbit controls signal
    expect(gate.takeRewrite()).toBe(true);
    expect(gate.takeRewrite()).toBe(false);
  });
});

describe("camera-gated mark writes", () => {
  test("static camera with an unchanged mark set writes nothing", () => {
    expect(shouldRewriteMarks({ cameraMoved: false, layoutDirty: false })).toBe(false);
  });

  test("a moving camera rewrites, and a changed mark set rewrites once", () => {
    expect(shouldRewriteMarks({ cameraMoved: true, layoutDirty: false })).toBe(true);
    expect(shouldRewriteMarks({ cameraMoved: false, layoutDirty: true })).toBe(true);
  });
});
