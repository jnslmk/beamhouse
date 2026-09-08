// Idle-frame gating for the app render-loop seam (feed-frame → resolve → applier).
//
// The checks here are deliberately cheap (DMX slot byte-equality, texel
// byte-equality, two booleans); the expensive sinks they guard — fixture
// re-resolution, GPU texture uploads, marker DOM writes — live in main.ts and
// viewport.ts. Trust signals (stale/disputed/unresolved/override labels) are
// written directly at their own call sites and never pass through this gate.

export interface SlotBreak {
  universe: number;
  address: number;
  footprint: number;
}

export interface GatedFixture {
  id: number;
  addresses: readonly SlotBreak[];
}

/** Per-fixture DMX slot bytes since the last rendered frame. */
export class FixtureChangeGate {
  readonly #last = new Map<number, Uint8Array>();

  /**
   * Ids whose break bytes differ from the last call; first sight counts as
   * changed. Callers resolve and apply only the returned ids.
   */
  changed(fixtures: readonly GatedFixture[], frames: ReadonlyMap<number, Uint8Array>): Set<number> {
    const changed = new Set<number>();
    for (const fixture of fixtures) {
      const bytes = fixtureSlotBytes(frames, fixture.addresses);
      const previous = this.#last.get(fixture.id);
      if (bytes === null) continue;
      if (previous === undefined || !slotsEqual(previous, bytes)) {
        changed.add(fixture.id);
        this.#last.set(fixture.id, bytes);
      }
    }
    return changed;
  }

  /** Forget one fixture (zoom override, hold, re-address) or everything (new scene/patch). */
  invalidate(id?: number): void {
    if (id === undefined) this.#last.clear();
    else this.#last.delete(id);
  }
}

/** Changed 1-based slots from one raw DMX universe; generated frames never enter this gate. */
export class RawSlotChangeGate {
  readonly #last = new Map<number, number>();
  readonly #tracked: readonly number[];

  constructor(tracked: readonly number[]) {
    this.#tracked = tracked;
  }

  changed(slots: Uint8Array | undefined): Set<number> {
    const changed = new Set<number>();
    if (!slots) return changed;
    for (const slot of this.#tracked) {
      const value = slots[slot - 1] ?? 0;
      if (this.#last.get(slot) === value) continue;
      this.#last.set(slot, value);
      changed.add(slot);
    }
    return changed;
  }
}

/** Concatenated break bytes for one fixture; null when no addressed universe has a frame yet. */
export function fixtureSlotBytes(
  frames: ReadonlyMap<number, Uint8Array>,
  addresses: readonly SlotBreak[],
): Uint8Array | null {
  let length = 0;
  for (const address of addresses) {
    if (frames.has(address.universe)) length += address.footprint;
  }
  if (length === 0) return null;
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const address of addresses) {
    const slots = frames.get(address.universe);
    if (!slots) continue;
    bytes.set(slots.subarray(address.address - 1, address.address - 1 + address.footprint), offset);
    offset += address.footprint;
  }
  return bytes;
}
export function slotsEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/**
 * Copy one strip/matrix run's RGB bytes into RGBA float texels.
 * Returns true (upload: set needsUpdate) only when a texel byte differed,
 * so static looks never churn GPU bandwidth. Placement, cone-angle, and
 * transform changes never reach this function.
 */
export function copyRgbBytesIfChanged(
  target: Float32Array,
  count: number,
  source: Uint8Array,
): boolean {
  let dirty = false;
  for (let index = 0; index < count; index += 1) {
    // fround: texels store float32, so compare the stored rounding, not the float64 quotient.
    const red = Math.fround((source[index * 3] ?? 0) / 255);
    const green = Math.fround((source[index * 3 + 1] ?? 0) / 255);
    const blue = Math.fround((source[index * 3 + 2] ?? 0) / 255);
    if (
      target[index * 4] !== red ||
      target[index * 4 + 1] !== green ||
      target[index * 4 + 2] !== blue
    ) {
      target[index * 4] = red;
      target[index * 4 + 1] = green;
      target[index * 4 + 2] = blue;
      target[index * 4 + 3] = 1;
      dirty = true;
    } else if (target[index * 4 + 3] !== 1) {
      target[index * 4 + 3] = 1;
      dirty = true;
    }
  }
  return dirty;
}

/**
 * Copy resolved linear pixels (or clear to black for unbound/marker states)
 * into RGBA float texels. Same dirty contract as copyRgbBytesIfChanged.
 */
export function copyLinearPixelsIfChanged(
  target: Float32Array,
  count: number,
  source: ArrayLike<number> | null,
): boolean {
  let dirty = false;
  for (let index = 0; index < count; index += 1) {
    const red = Math.fround(source?.[index * 3] ?? 0);
    const green = Math.fround(source?.[index * 3 + 1] ?? 0);
    const blue = Math.fround(source?.[index * 3 + 2] ?? 0);
    if (
      target[index * 4] !== red ||
      target[index * 4 + 1] !== green ||
      target[index * 4 + 2] !== blue
    ) {
      target[index * 4] = red;
      target[index * 4 + 1] = green;
      target[index * 4 + 2] = blue;
      target[index * 4 + 3] = 1;
      dirty = true;
    } else if (target[index * 4 + 3] !== 1) {
      target[index * 4 + 3] = 1;
      dirty = true;
    }
  }
  return dirty;
}

/**
 * Pure one-shot decision core for the mark-write gate over all additive
 * screen-space marks. The full signal set lives on `MarkGate` (camera,
 * placements, gizmo drags, mesh swaps, resizes, re-ingests); this function
 * only folds the two accumulated inputs. No pixel-epsilon tuning.
 */
export function shouldRewriteMarks(options: {
  cameraMoved: boolean;
  layoutDirty: boolean;
}): boolean {
  return options.cameraMoved || options.layoutDirty;
}

/**
 * Every input to the mark projection owns a signal here: the orbit controls
 * (camera), plus everything else that moves a projection input — placements,
 * gizmo drags, mesh swaps, host resizes, scene re-ingests. The sinks stay
 * gated; the signal set stays complete so no domain's update is swallowed.
 */
export class MarkGate {
  #cameraMoved = false;
  #positionsDirty = true;

  cameraChanged(): void {
    this.#cameraMoved = true;
  }

  positionsChanged(): void {
    this.#positionsDirty = true;
  }

  /** One-shot rewrite decision for the animation loop; consuming resets both signals. */
  takeRewrite(): boolean {
    const rewrite = shouldRewriteMarks({
      cameraMoved: this.#cameraMoved,
      layoutDirty: this.#positionsDirty,
    });
    this.#cameraMoved = false;
    this.#positionsDirty = false;
    return rewrite;
  }
}
