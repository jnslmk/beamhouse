# Polished visualization tech: what "fable" and "gpt-6" demos actually run on

Researched 2026-09-08. Bottom line: both names are **models, not renderers**.
Every stunning demo is *model writes code or drives an app* + *an existing engine
renders*. There is no new rendering tech to adopt — only confirmation that the
spectacle lives in post chain and art direction, both reachable on Beamhouse's
current stack.

## Correction 2026-09-08 — the actual links (supersedes the guess below)

The user pasted two YouTube links; YouTube transcript/info APIs are bot-blocked from
this environment, so identification is via search + primary write-ups of the same demos.

- **BNjzXcEXmg4 (+640s, `gauntlet loop`) = RoboNuggets video on Matt Shumer's Gauntlet
  Loop / Claude of Duty.** One prompt in Claude Code (Opus 5), left alone for hours:
  ~55,000 lines, every texture/mesh/animation/sound generated in code from scratch,
  fleet of subagents. Stack: **Three.js, browser-native**. Method: goal + real bar
  (actual Call of Duty screenshots), lead agent splits work into judgeable pieces,
  per-piece builder + separate harsh visual critic with fresh context, blind A/B vs
  the bar, loop with no fixed round count (`/loop` + ultracode). Code open-sourced.
  Source: https://somethingbig.ai/gauntlet-loop (method + prompt.md link),
  https://github.com/mshumer/Claude-of-Duty, https://github.com/robonuggets/gauntlet-loop/blob/main/.claude/skills/gauntlet-loop/SKILL.md
- **XULMyAl5cts (`gpt 6 visual`) = GPT-6 Astra visual/game wave (2026-09-03+).**
  Flagship web-stack demo: **Void Explorer** (Thomas Ricouard, Codex + Astra) —
  **TypeScript / Vite / Three.js**, 2,048 star systems, 10,000+ planets,
  space→atmosphere→land→walk continuous. Started WebGL2, moved sim-kept to
  **Three.js WebGPU + TSL node materials** for atmosphere/water/lighting; terrain
  in Web Workers, Vitest + Playwright checks, `window.__VOID_EXPLORER__` inspect
  interface (draw calls, tris, terrain jobs) + named test scenes (orbit, descent,
  landing). Concept art via image gen frozen as the visual bar before building.
  Sibling demos: Unreal Manhattan (street-by-street, ~1 week), Blender house→UE5
  walkable (headless CLI Blender + Python, not GUI puppetry), Unity Playbot
  edit→run→play→fix (~50% fewer manual fixes, Unity-primary). The loop is
  `make → see → play → find issues → fix` with the model closing it.
  Source: https://developers.openai.com/blog/how-to-build-games-with-astra,
  https://aituts.com/gpt6-astra-game-dev/

## Frozen bar 2026-09-08 (user-approved; scratch-only, never committed)

Dir `.codex-tmp/polish/bar/` (gitignored): `vectorworks-0.jpg` (Vision hero previz),
`bar-capture-ma2-timecode.jpg` (vid1 ~t=120s, Capture+MA2 red stage in haze),
`bar-grandma3d-believer.jpg` (vid4 ~t=32s, MA3D green/blue rig),
`bar-grandma3d-redlattice.jpg` (vid4 ~t=0s, red/amber beam lattice),
`bar-grandma3d-bluerig.jpg` (vid4 ~t=40s, blue/purple spot rig). All genuine in-app
render output, >=800px, no chrome/logos — photography, sketches, UI screenshots and
watermarked UE frames explicitly rejected. Baseline: `.codex-tmp/polish/baseline-look.jpg`.
Stop rule amended: the gauntlet critic decides when a slice is done; the user is out
of the loop after this approval.

## Disambiguation (original guess — kept for provenance)


- **"fable" = Claude Fable 5 / 5.1** (Anthropic, coding/design model; 5.0 launched
  2026-06-09, 5.1 in Sept 2026). Not Fable the Xbox game (Playground Games,
  ForzaTech engine), not Fable the F#/JS compiler.
  Source: https://www.anthropic.com/news/claude-fable-5-mythos-5,
  https://www.anthropic.com/claude-fable-and-mythos-5-1
- **"gpt-6" = GPT-6 Astra** (OpenAI, released 2026-09-03). No model called GPT-6
  existed before that date.
  Source: https://openai.com/index/gpt-6-astra/,
  https://www.cnbc.com/2026/09/03/open-ai-astra-gpt-6-cyber.html

## Fable demos: model writes web code, the browser renders

- Official demos: solar-system simulation derived from physics first principles,
  Factorio/Pokémon/FireRed/Slay-the-Spire agents, a fluid simulation synced to
  model-composed music, and — the visual one — **a complete 3D-printable model
  in a browser-based CAD editor, where the editor itself was also created by
  Fable 5**. Partner demos: a rhythm game with real music in Canva Code.
  Source: https://www.anthropic.com/news/claude-fable-5-mythos-5 (demos list),
  https://www.anthropic.com/claude-fable-and-mythos-5-1 (Canva quote)
- Third-party "Fable demos" (GLSL-shader landing pages, 3D hero sections, working
  games from a spec) are the same shape: the model authors HTML/JS/GLSL, the
  browser's Canvas/WebGL pipeline draws it.
  Source: https://github.com/pulkitxm/claude-directory
- Rendering tech: none of Anthropic's own. No engine, renderer API, GI, or
  volumetric claim appears anywhere in either announcement — the pages benchmark
  coding/vision/agents, not pixels. **What the model writes vs what the engine
  owns: model writes source text; the browser owns every pixel.**

## GPT-6 Astra demos: model drives a DCC and an engine, then hosts web games

- Official visual demos: **"GPT-6 Astra models a house in Blender and turns it
  into a walkable scene in Unreal Engine 5"**; with Sites in ChatGPT it
  "create[s], host[s], and share[s] websites, web apps, and games directly from
  a prompt"; computer use scores 72.6% on OSWorld 2.0 at ~40 min/task, and the
  Codex harness update gives 1.9x faster completion on Mind2Web.
  Source: https://openai.com/index/gpt-6-astra/ (all three claims, one page)
- Rendering tech, Blender side: Blender is a 3D suite whose rendering is
  **Cycles, a production path tracer**, scriptable through its Python API —
  the seam the model drives through.
  Source: https://www.blender.org/features/,
  https://www.blender.org/features/rendering/
- Rendering tech, UE5 side: **Lumen, the default dynamic GI + reflections
  system** — infinite diffuse bounces, final-gather sky lighting, surface cache,
  software ray tracing against mesh distance fields with optional hardware RT;
  indirect lighting computed well below shading resolution; lower-quality GI on
  translucency and **volumetric fog**.
  Source: https://dev.epicgames.com/documentation/unreal-engine/lumen-global-illumination-and-reflections-in-unreal-engine
- **Model vs engine split is identical to Fable's:** Astra operates software via
  computer use (screenshots, inputs, Blender/Python, UE editor); Cycles and
  Lumen are unmodified. The demo flex is agency horizon, not a shader.

## Cheap polish that fits Beamhouse's stack (do these)

Stack: `three@0.185.1` `WebGLRenderer`, one hand-written GLSL beam pair,
`three/addons` post chain (`RenderPass → UnrealBloomPass → OutputPass`),
ADR-0013 closed-form density, ground-plane-only light.
The standard web post chain is exactly what three.js documents —
`OutputPass` "performs color space conversion to sRGB and optional tone
mapping" as the last pass:
Source: https://threejs.org/manual/en/post-processing.html

1. **Bloom threshold tune, once, after the haze default is set** — already
   required by ADR-0013 item 7 + ADR-0036 rule 9; the pool renders into the
   same HDR target so it joins the same tuning, not a second one.
2. **ACES + sRGB via `OutputPass`, HDR target free** — `EffectComposer`
   allocates `{ type: HalfFloatType }` by default; `OutputPass` reads tone
   mapping / color space off the renderer (ADR-0017 consequences).
3. **Ground-plane material + pool edge** — analytic ellipse sized by
   `BeamAngle` vs throw distance, edge-softened by `FieldAngle` only where
   they differ (ADR-0036 decision 5). No samples, no fence touched.
4. **AA + color-management hygiene** — MSAA render target or SMAA pass,
   `renderer.outputColorSpace` default, `LinearRGB` shading into the HDR
   target per ADR-0008 ordering.
5. **Haze on by default at the low fixed `.bhs` value** (ADR-0013 decision 4) —
   the single highest legibility-per-cost item; a beam in clean air is invisible.

## Expensive tiers that hit an ADR fence (do not do these)

Each names its fence and why it costs frame time:

- **Raymarched volumetrics / heterogeneous or animated density / beam
  absorption** — needs >1 sample of `density(p)`: the ADR-0013 decision-10
  fence, one rule. Cost scales as steps × fixtures per pixel, every frame.
- **Volumetric (beam-on-beam) shadows, soft shadows, gobo-through-medium** —
  same fence; ADR-0036 rule 3 states it plainly (shadows need the second
  sample). ADR-0017 point 4: all of it runs on WebGL2 (3D texture is core),
  so this is frame-time budget, not an API gap.
- **Simulated/advected haze** — wants compute; this is ADR-0017's *only*
  WebGPU trigger, and reopening means superseding the ADR, not amending it.
  A drifting medium also fights previz repeatability (ADR-0017 point 4).
- **GI / bounce / lit truss, stage, musician** — ADR-0036 rule 2 (objects never
  emit, occlude, or receive). Lumen shows the price of the alternative:
  surface caches, update-speed knobs, per-setting GPU-cost warnings on
  essentially every row.
  Source: Lumen docs, "Post Process Settings" + "Lumen Lighting Update Speed".
- **Forward-scatter glare into the camera** — Henyey–Greenstein phase varies
  along the ray and breaks the closed form; ADR-0013 decision 2 records the
  absence as a known cosmetic gap, not a defect.

## Recommendation

Take nothing from the model layer (no Codex/computer-use shaped hole in the
renderer) and everything from the engine lesson: both demo families get their
look from post + art direction on top of commodity renderers. For Beamhouse
that means the cheap list above, in order — haze default, bloom tune,
ACES/OutputPass, pool edge, AA hygiene — and the expensive tier stays fenced.
If a side-by-side still hurts after that, the gap is taste (density default,
bloom curve, ground albedo), not raymarching.

## Sources (primary only)

- Fable 5 launch + demos: https://www.anthropic.com/news/claude-fable-5-mythos-5
- Fable 5.1 + partner demos: https://www.anthropic.com/claude-fable-and-mythos-5-1
- GPT-6 Astra launch + Blender/UE5/Sites demos + benchmarks: https://openai.com/index/gpt-6-astra/
- UE5 Lumen GI/reflections/volumetrics: https://dev.epicgames.com/documentation/unreal-engine/lumen-global-illumination-and-reflections-in-unreal-engine
- Blender features (Cycles path tracer, Python API): https://www.blender.org/features/
- three.js post-processing chain + OutputPass: https://threejs.org/manual/en/post-processing.html
- Beamhouse fences: docs/adr/0013-*, docs/adr/0017-*, docs/adr/0036-* (this repo)
