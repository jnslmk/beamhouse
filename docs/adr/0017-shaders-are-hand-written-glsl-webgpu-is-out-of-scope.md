# ADR-0017: Shaders are hand-written GLSL, and WebGPU is out of scope

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decides:** [#29](https://github.com/jnslmk/beamhouse/issues/29)
- **Amends:** [ADR-0013](0013-atmosphere-is-one-closed-form-scattering-term.md)

## Context

WebGL2 is a standing decision on the map and this does not reopen it. What was open is **how the
shaders are authored**, because that — not the renderer choice — is what fixes the cost of ever
moving. `DESIGN.md` §03 listed hand-written `src/shaders/{beam.vert,beam.frag}.glsl`; §12 could
not pin `three` or `postprocessing` until the question was answered, since a node-material
renderer *replaces* `postprocessing` rather than versioning it.

The competitive review (2026-09-02) surfaced **DMXpressions** — the field's one browser-native
competitor, on a WebGPU renderer, spending it on raymarched volumetrics and a physics-simulated
haze engine. That is evidence about what the other API buys, not an argument to switch. #29 asked
what it would cost to keep GLSL and be wrong.

Measuring the ticket's premises moved four of them, and three of the four decided it.

1. **`WebGPURenderer` refuses `ShaderMaterial`, in the NodeBuilder rather than the backend.**
   `renderer.library` registers node materials for exactly thirteen core types — `MeshStandardMaterial`,
   `MeshBasicMaterial`, `LineBasicMaterial`, `PointsMaterial` and so on. `ShaderMaterial` and
   `RawShaderMaterial` are not among them, so `fromMaterial()` returns `null`, the builder logs
   `NodeBuilder: Material "ShaderMaterial" is not compatible.` and substitutes a blank
   `NodeMaterial`. Because the rejection happens in the node builder, **`WebGPURenderer` on its
   WebGL2 backend is not a halfway house**: it fails a raw shader for the same reason the WebGPU
   backend does. Raw GLSL and `WebGLRenderer` are one choice, not two. Read out of
   `three@0.185.1`'s `three.webgpu.js` build.

2. **TSL's `glslFn` is backend-pinned, so it cannot soften a later move.** `FunctionNode` takes
   `language: 'js' | 'wgsl' | 'glsl'`; `wgslFn` and `glslFn` are its two predefined wrappers.
   Native code inside a node graph is native to *one* backend. Wrapping §8.2's `density(p)` in
   `glslFn` buys nothing portable — it buys a node graph *and* a rewrite.

3. **The hand-written surface is one vertex/fragment pair, not two shaders.** §8.1's strip is a
   `DataTexture` with `LinearFilter` sampled along the run's axis — a **`map` on a stock
   material**, which is why that section describes no shader and §03 lists none. §01's
   architecture table said "beam **& strip** shaders" and was wrong; it is corrected in the same
   commit as this ADR. The strip path — the one with a measured conformance oracle behind it
   ([#26](https://github.com/jnslmk/beamhouse/issues/26)) — has no shader to rewrite, ever.

4. **The tier ADR-0013 fenced off does not need WebGPU.** ADR-0013 put the deferred boundary at
   the second sample of `density(p)` and listed what falls past it: volumetric shadows, soft
   shadows, gobo projection through the medium, heterogeneous or animated density, beam-on-beam
   absorption. Every one of those is fragment-shader raymarching, which WebGL2 does; heterogeneous
   density wants a 3D texture, which is core WebGL2. The item on DMXpressions' list that is
   genuinely across the API boundary is the **simulated** medium — advected haze, which wants
   compute. That is a different feature from a raymarched one, and it is not where Beamhouse is
   going: a previsualiser needs the beam to read correctly through haze, and a drifting medium
   fights the repeatability that is the point of previz.

So the ticket's own stated decider — "is the later tier reachable on WebGL2 at acceptable
quality?" — is answerable today, and the answer is yes.

## Decision

**The beam shader is hand-written GLSL in a `ShaderMaterial` on `WebGLRenderer`.** It is the only
hand-written shader; the strip is a `DataTexture` `map` on the geometry its definition declares.
Shaders load through Vite's built-in `?raw` suffix, so §03's `.glsl` file layout needs no plugin.

**WebGPU is out of scope for Beamhouse — not deferred.** The grounds are point 4 and nothing else:
the tier is reachable without it. This is recorded so it does not later read as an oversight by
someone who knows the API exists. **The one thing that reopens it is a *simulated* atmosphere** —
advection, not a second sample of `density(p)`. If that ever enters the destination, this ADR is
superseded rather than amended, and the shaders are written twice with the second time being the
real one.

**`postprocessing` leaves the dependency table.** `three/addons/postprocessing/` covers §8's
entire stated post need — one bloom pass, ACES, sRGB out — as
`RenderPass → UnrealBloomPass → OutputPass`. `OutputPass` "is responsible for including tone
mapping and color space conversion into your pass chain" and reads both off the renderer,
`ACESFilmicToneMapping` among the seven it imports by name; `EffectComposer` allocates its default
target as `{ type: HalfFloatType }`, which is §8.1's "same HDR target" for free.

**`three` is pinned exactly, at `0.185.1`.** Floor-only pins were wrong on two counts. They admit
resolutions a peer range forbids — `postprocessing@6.39.4` declares `three: ">= 0.168.0 < 0.186.0"`,
so §12's `three ≥0.170` permitted a resolution the post chain rejects, one minor above today's
release. And `three` ships breaking changes in every minor: r183 renamed `PostProcessing` to
`RenderPipeline`, r185 renamed TSL functions and changed how `WebGPURenderer` implements
premultiplied alpha. Under a floor pin an unrelated `npm install` can change how the rig renders —
the [ADR-0011](0011-a-fixture-is-addressed-per-break.md) failure shape again, wrong output with
nothing to compare it against.

## Considered options

- **Node material / TSL on `WebGPURenderer`.** Rejected. It runs on the WebGL2 backend today and
  on WebGPU unchanged, which is the whole case for it — but the case is insurance against a move
  points 3 and 4 say will not happen, and the premium is paid every day of authoring. Its API is
  also visibly moving: the top-level post-processing class was renamed inside the last seven
  months, with the old name kept as a subclass that `warnOnce`s.
- **Raw GLSL, with `glslFn` as the escape hatch.** Rejected on point 2 — the escape hatch does not
  escape anything.
- **Keep `postprocessing` for bloom quality.** Rejected. Its merged-effect-pass advantage is worth
  nothing at N = 1 effect, and the cost is a third party holding the ceiling on `three`. Its v7
  line has been in beta since 2026-02 with a *narrower and older* peer range than its stable
  branch, and does not target WebGPU either. If `UnrealBloomPass` looks worse once the ADR-0013
  haze is tuned, adding it back is confined to the composer setup and touches no shader.

## Consequences

- **§12's browser table is closed**, which was #29's charter. `three` at `0.185.1` exactly,
  `postprocessing` gone, and the pin is now unconstrained by any peer ceiling — the version is a
  decision Beamhouse makes rather than one a dependency makes for it.
- **The renderer class is now a decision, not a default.** `WebGLRenderer` is named because
  `WebGPURenderer` would reject the beam material, not because it happened to be the one in the
  examples.
- **§01's architecture table was overstating the shader count**, and had been since it was
  written. The two *rendering classes* are real; two *shaders* were not.
- **A future WebGPU question has a stated trigger.** It is on the map's **Out of scope**, where
  nothing graduates, with the simulated-atmosphere condition named — so reopening it is a
  redrawing of the destination, which is a fresh effort, not a resumption.
- **The ADR-0013 tier is now costed as well as fenced.** Its items are reachable; what they cost
  is frame time, and the fence stays where it is for the reason it was put there.
