# GLP impression 90 RGB: third-party 3D geometry — does it exist, and can we use it?

Research for [issue #17](https://github.com/jnslmk/beamhouse/issues/17) (part of the
[wayfinder map, #1](https://github.com/jnslmk/beamhouse/issues/1)). Complements
[issue #16](https://github.com/jnslmk/beamhouse/issues/16), which chases GLP's own DWG
drawings — **that is out of scope here**; this ticket stays on third-party sources only.
Builds on
[`docs/research/glp-impression-90-profile.md`](https://github.com/jnslmk/beamhouse/blob/main/docs/research/glp-impression-90-profile.md)
(issue #15), which established: no GDTF profile for the impression 90 exists anywhere
on GDTF Share; the impression X4's own profile ships **no meshes at all**
(`PrimitiveType` + `Axis` pivots only); and pivot location, not mesh detail, is the
blocking unknown for a correctly articulated model. Known physical spec, from
`~/.qlcplus/fixtures/GLP-Impression-90-RGB.qxf`: 341 × 375 × 338 mm envelope, 7.5 kg,
fixed 10° beam, pan 660°, tilt 300°, RGB LED, 5600 K, 300 W.

**Headline answer: yes, in one place — an MIT-licensed community GDTF library
(`heliostate/OpenGDTFLibrary`) contains real, redistributable 3D meshes and pivot-offset
data for both the impression 90 and the impression X4 (and X4 L, X4S, 120 RZ). It is not
authoritative — it's anonymous fan/Vectorworks-export data with no working Pan/Tilt DMX
channel — but it is the single cleanest legal find of this research and a genuinely
useful cross-check. Every commercially-marketed or marketplace-hosted model found
(GrabCAD, TurboSquid, SketchUp 3D Warehouse) carries licence terms that block copying
it into this public repo outright. No visualiser fixture library or public MVR sample
was found to carry impression 90/X4/120 geometry usably. Photogrammetry-grade reference
exists but is modest — no dimensioned drawing, no scaled photo — and a third,
mutually-inconsistent set of headline dimensions turned up, deepening rather than
resolving the discrepancy `glp-impression-90-profile.md` already flagged.**
Recommendation is at the end (§6).

This research was conducted by three parallel investigations (marketplaces; visualiser
libraries; MVR files + photogrammetry reference), each independently reporting dead
ends with the exact query used, and the highest-value find (OpenGDTFLibrary) was then
independently re-verified directly — its `description.xml` files were fetched and read
in full, its licence file decoded, and its model file sizes confirmed via the GitHub API
— rather than taken on the sub-investigation's word alone.

## 1 · 3D model marketplaces

### 1.1 GrabCAD — one hit, wrong product, restrictive default licence

**Query**: site search for "impression 90" (irrelevant: bottle inverter, motorcycle
triple clamp), "impression 120" (irrelevant: gearbox/motor parts), "GLP" (20 results,
all unrelated gas-cylinder/propane-tank CAD), "moving head" (generic track lighting, no
GLP). **Dead ends**, all four.

**One real hit**: [`grabcad.com/library/glp-impression-x4-bar-20-1`](https://grabcad.com/library/glp-impression-x4-bar-20-1) —
"GLP Impression X4 Bar 20," uploaded by Sylvain Guiblain, Oct 2018, 241 downloads. This
is the **X4 Bar 20**, a static linear LED batten, not the pan/tilt X4 spot fixture (GLP's
own tag confusingly says "Moving Head" but the real Bar 20 doesn't pan/tilt) — wrong
product for this ticket's purpose even setting licence aside. Geometry is two CATIA
parts (`Base`, `Head`) plus an assembly file, no yoke/linkage part — a crude two-body
shell, not something a pivot could be read off even if it were the right fixture.

**GrabCAD's licence — verified directly**, not just summarized, because the ticket
flags this as commonly misread. Per GrabCAD's own help documentation
(`help.grabcad.com/article/246-what-is-the-grabcad-license`, fetched directly): models
are **for private/non-commercial use by default**. Commercial use of any kind —
including redistributing the model itself, even inside a project like this public
repo — requires **explicitly asking the original uploader for permission** and then
crediting both GrabCAD and the uploader. If the uploader doesn't respond, commercial use
is *not* permitted by default; silence is not consent. GrabCAD additionally "strongly
urges" against commercial use of any model containing a real company's branding/IP —
which every fixture model on GrabCAD, including this one, does by definition. **Net: not
redistributable into this repo without contacting Sylvain Guiblain directly, and
irrelevant to the impression 90 even if it were.**

### 1.2 Sketchfab — nothing

**Queries**: "GLP impression 90", "GLP impression X4". Both dead ends — results were
unrelated (hobbyist "GLP" gas-tank models, "Audi A90," "X4foundations" game tag). No
stage-light fixture of any kind surfaced.

### 1.3 TurboSquid — one hit, real product, licence forbids redistributing the file

**Hit**: [`turbosquid.com/3d-models/moving-glp-impression-3d-c4d/675398`](https://www.turbosquid.com/3d-models/moving-glp-impression-3d-c4d/675398) —
a paid (~$20–25, cached price snippets were inconsistent, unconfirmed on-page) Cinema 4D
rig explicitly described as "based on a GLP Impression 90 with custom controls,"
exported to 3DS Max/OBJ/Maya/Lightwave/FBX/C4D. The product page itself returned
**HTTP 403 to both automated fetch and headless browsing** — its exact geometry (poly
count claims in cached snippets ranged inconsistently from ~8K to ~75K) and its specific
licence tier on this listing could not be directly verified and are not claimed here.

**TurboSquid's site-wide standard licence — verified directly**
(`resources.turbosquid.com`, `turbosquid.com/licensing`, and the TurboSquid Blog's
license explainer, cross-checked via search): purchases are royalty-free for use in a
"Creation," but the licence explicitly **prohibits redistributing the 3D model files
themselves** except embedded in a larger work where the model can't be extracted —
committing the raw model into a public source repository is exactly the case the licence
calls out as prohibited ("3D Model Clearinghouse" / stock-library redistribution). **Net:
even after paying for it, this model could not legally be committed into this repo** —
usable only as private reference by whoever purchases it, not as a repo asset.

### 1.4 CGTrader — nothing GLP-specific

**Queries**: "GLP impression 90", "GLP impression X4", "moving head light fixture GLP",
direct URL guess `/3d-models/glp-impression` (404). Generic movinghead-tagged models
exist (~50, e.g. "Moving Head LED Stage Light 02/03") but none attributed to GLP in any
title or description found. **Dead end.**

### 1.5 Printables / Thingiverse — confirmed dead end

**Queries**: "GLP impression 90", "GLP impression X4" on both platforms. Thingiverse's
in-site search returned 14 unrelated results (keychains, masks, drill parts).
Printables' own search was blocked by a Cloudflare challenge that persisted even under
headless browsing; Google-indexed coverage of the site for these terms returned nothing
relevant either (only false positives from keyword overlap, e.g. "GLP-1 medicine box").
As expected for 3D-printing sites, no scaled enclosure/mount project referencing this
fixture's dimensions was found. **Confirmed dead end, not just unchecked.**

### 1.6 SketchUp 3D Warehouse — not in the ticket's list, but the best marketplace find

Found organically while searching the above; a genuine third-party user-upload
repository (Trimble), distinct from GLP's own site.

- **[`3dwarehouse.sketchup.com/model/5e28bff212a6d919cd9a8ac44f6a3177/GLP-Impression-90`](https://3dwarehouse.sketchup.com/model/5e28bff212a6d919cd9a8ac44f6a3177/GLP-Impression-90)**
  — "GLP Impression 90," uploaded/modified by user "StefPotters," Mar 2014. Description
  text closely paraphrases GLP's own marketing copy. **7,160 polygons, real-world scale
  (units explicitly "millimeter"), bounds 153 × 289 × 370 mm.** That bounding box does
  **not** cleanly match the known 341×375×338mm envelope on any axis pairing —
  consistent with (not resolving) the dimension-discrepancy thread already open in
  `glp-impression-90-profile.md` §2, or simply an inaccurate fan model. 7,160 polys is
  moderate detail, plausibly a genuinely shaped body rather than a placeholder block —
  worth a closer inspection if this path is pursued — but this research could not
  confirm from the info panel alone whether the head/yoke are separate movable groups
  or one fused mesh; the page is JS-rendered and its detail content did not survive
  either automated fetch attempt made in this pass (see licence note below).
- Three lower-value sibling listings on the same platform: "GLP Impression Spot One"
  (Ryan D., 583 polys, bounds "0×0×1" — placeholder icon scale, not real), "GLP
  Impression Wash ONE" (Ryan D., 289 polys, same placeholder scale), "GLP Impression X4
  Bar 20" (Shaun M., 263 polys, bounds 231×100×1000mm — real-scale but very low-poly,
  no articulation, a crude block proxy). None of these three are useful.

**Licence — checked at both levels.** The specific model's own licence badge (3D
Warehouse supports per-model Creative Commons overrides) could not be read: the page is
entirely JS-rendered, and two independent automated fetch attempts (this pass, and the
originating sub-investigation) both returned only the site chrome, no model metadata —
this would need a live browser session (e.g. `claude-in-chrome`) to actually see. What
*is* confirmed directly, from 3D Warehouse's own Terms of Use FAQ
(`help.sketchup.com/en/3d-warehouse/3d-warehouse-terms-use-faq`, fetched and quoted
here): the **default** licence is fairly permissive for incorporating models into
derivative works and even commercial deliverables, but explicitly **"the commercial
sale of exact, physical reproductions of models is not permitted,"** and models
"downloaded from 3D Warehouse are not [to be] transferred or sold as stand-alone items."
**Net: plausibly usable as informing reference (the default licence's derivative-work
allowance is broad), but committing the model itself into a public repo as a
stand-alone redistributable asset is the specific case the ToS's "stand-alone items"
language is written to prevent — and the per-model badge that could override this
either way was never actually seen.** Treat as reference-only unless someone confirms
the per-model licence via a live browser session.

## 2 · Other visualiser fixture libraries

Checked: Capture, Depence, WYSIWYG, Vectorworks/Vision, Light Converse, BlenderDMX asset
packs (plus BlenderKit and Blender Market, which the BlenderDMX angle led to). **All
six are proprietary and none offers a public, independently browsable fixture
database** — this is a clean, decisive negative across the board, not six unresolved
gaps.

| Tool | Public/browsable library? | impression 90/X4/120 confirmed present? | Licence position |
|---|---|---|---|
| **Capture** | No — Capture's own staff confirmed on their forum ("There isn't an online list for the full library," `capture.se/Support/Forum/aft/10959`) | Not confirmed either way; no mention in the Capture manual, forum, or an archived 2005 supported-fixture list | Proprietary, licence-gated, library is a separate download requiring a paid Capture licence |
| **Depence** (Syncronorm) | No — cloud-synced to licensees only | Not directly confirmed for "impression 90"/plain "X4"/"120," but a real production case study (`ct-group.com/us/projects/ewc-opening-ceremony`) documents **111× "GLP Impression X4 Bar 20"** used in a Depence R4 previz — strong indirect evidence the X4 *family* is in the library, though the Bar 20 again isn't the pan/tilt spot | Proprietary. Syncronorm's own **Fixture Service Terms & Conditions** (PDF, fetched and read directly, dated 03.08.2025): **"All created fixture files remain the exclusive property of Syncronorm GmbH."** Fixtures are "published in the public Depence library" — meaning visible to all Depence *licensees*, not the open web. |
| **WYSIWYG** (CAST Software) | No | Not confirmed for 90/120. "Impression X5 IP" and "Impression X5 IP Bar 1000" are named in CAST's 2025 library-update notes; a CAST showcase page for a Swedish House Mafia tour separately names "GLP impression X4 Bar 20s" in a WYSIWYG-branded write-up | Proprietary, portal/software-delivered only, no public access terms found |
| **Vectorworks / Vision** | Partial mechanism (Package Manager) exists for manufacturer-supplied symbols in general | Not confirmed for 90/X4/120 specifically from third-party sources. GLP is a listed Vectorworks **Silver Partner**, but that partner page names GLP generically, not specific fixture symbols | Whatever GLP-specific Vectorworks content exists is distributed from **GLP's own site** — explicitly out of this ticket's scope (issue #16's territory) |
| **Light Converse** | No | Not found; their official download page (`lightconverse.eu/dwnld/`) lists software packages and library additions by other brands, no GLP mention anywhere | Proprietary, dongle/licence-gated |
| **BlenderDMX asset packs / BlenderKit / Blender Market** | BlenderKit and Blender Market are public/downloadable in general, but no GLP content found on either | No. (Core BlenderDMX repo already established by issue #15's research: 8 synthetic placeholder fixtures only, no GLP — not re-verified here.) One Blender Market listing ("MOVING HEADS GN") is a **procedural geometry-nodes generator for generic animated moving heads**, not a replica of any real fixture. | N/A — nothing found to license |

A clear "proprietary, no public access, no evidence either way" for Capture, WYSIWYG,
Light Converse, and Vectorworks; a clear "proprietary, and the vendor asserts outright
ownership of the fixture files" for Depence — this is itself the useful, decisive result
this category of the ticket asked for.

## 3 · MVR files in the wild

**Every public MVR sample collection checked was downloaded and unzipped to inspect the
actual embedded `.gdtf` filenames — not just descriptions —** and none contains an
impression 90, X4, or 120 GDTF:

- `mvrdevelopment/spec` (the official spec repo): `examples/` is markdown documentation
  only, no `.mvr` binaries.
- `open-stage/python-mvr`'s test fixtures (3 real `.mvr` files: `basic_fixture.mvr`,
  `capture_demo_show.mvr`, `scene_objects.mvr`) — embedded GDTFs are a generic PAR,
  Clay Paky/ADB/Robe movers, and custom pendant fixtures. No GLP.
- `open-stage/blender-dmx`'s `assets/mvrs/` directory is empty (`.gitkeep` only,
  fetched at runtime, nothing bundled).
- **GDTF Hub's official example collection** (`gdtf.eu/mvr/examples/`, 10 files, all
  downloaded and unzipped): the only GLP fixture found anywhere in the set is
  `GLP@JDC1 Strobe@r3034.gdtf` inside `Template_Stage1.mvr` — a strobe, unrelated to
  the impression family.
- GitHub code search for `extension:mvr` combined with "impression" or "GLP" returned
  zero hits; a bare `extension:mvr` search returned nothing at all (GitHub's code index
  doesn't appear to index this zip-based binary format well, so absence here is weaker
  evidence than the direct-download checks above).

**Dead-end queries, for the record**: `"Impression 90" extension:mvr`, `"GLP
impression" extension:mvr`, `extension:mvr` (GitHub code search); `"Impression X4"
extension:gdtf`; `MVR sample file download lighting demo show GDTF`; `GDTF MVR
conference demo file PLASA LDI prolight sound download show file`; `gdtf-share.com
"Impression 90" OR "Impression X4" GLP` (gdtf-share.com's own site returned nothing
indexed for these terms).

### 3.1 Not an MVR, but the actual find: `heliostate/OpenGDTFLibrary`

This surfaced adjacent to the MVR search and is the single most useful result of the
whole investigation, so it's verified here directly rather than taken on trust.

**What it is**: a community-maintained GitHub repo
([`github.com/heliostate/OpenGDTFLibrary`](https://github.com/heliostate/OpenGDTFLibrary))
of *unpacked* GDTF files (a GDTF is just a zip; this repo keeps them exploded so they're
diffable/PR-able), plus a script to repack them. Its own README states its purpose
plainly: **"There doesn't appear to exist an open library of GDTF fixtures at this
time... This repository contains a list of unpacked GDTF files... to allow the
community to contribute to an open GDTF library and collaborate on fixtures that are
not fully defined."** That last clause matters — see the caveat below.

**Licence — verified directly**: fetched `LICENSE` via the GitHub API and decoded it.
It is the **MIT License**, copyright "(c) 2021 heliostate." MIT permits use, copying,
modification, merging, publishing, distribution, and sublicensing without restriction
beyond retaining the copyright/licence notice. **This is the only source in this whole
research pass with an unambiguous, repo-safe licence** — everything else found is
either proprietary-and-inaccessible or accessible-but-not-redistributable.

**What's in it, verified directly**: fetched the GitHub API directory listing for
`unpackedGDTFs/GLP/`. It contains **46 GLP fixtures**, including:
`GLP@Impression 90`, `GLP@Impression X4`, `GLP@Impression X4 L`, `GLP@Impression X4S`,
`GLP@Impression X4 Bar 10`, `GLP@Impression X4 Bar 20`, `GLP@Impression 120 RZ`,
`GLP@Impression 240 XL`, and 39 others across GLP's full historical range.

**Impression 90's actual contents — fetched and read `description.xml` in full**:

- `Models`: three bodies, each with a real mesh file in `models/3ds/` — `Base`
  (170 × 173 × 40 mm), `Yoke` (340 × 80 × 221 mm), `Body` (266 × 266 × 145 mm). File
  sizes confirmed via the GitHub API (not a sub-investigation's estimate): `Base.3ds`
  10,238 bytes, `Yoke.3ds` 4,197 bytes, `Body.3ds` 18,717 bytes — small but non-trivial,
  consistent with real low-poly meshes rather than placeholders.
- `Geometries`: a `Base → Yoke → Body` `Axis` chain — exactly the pan/tilt hierarchy
  this ticket is chasing — with real, non-identity `Position` translation matrices on
  every node:
  - `Base` Axis: translation (0, +16.5 mm, −17.5 mm)
  - `Yoke` Axis (child of Base): translation (0, −16.5 mm, −130.3 mm)
  - `Body` Axis (child of Yoke): translation (0, 0, −60.3 mm)

  These are genuine pivot-offset numbers, not a bounding-box estimate — the kind of
  data issue #16 is trying to recover from GLP's own DWGs. **Composed relative to the
  root**, the Yoke's own origin sits at roughly (0, 0, −147.8 mm) and the Body's at
  roughly (0, 0, −208.1 mm) from wherever this export's reference origin is (not stated
  in the file, and this research did not independently confirm GDTF's axis-up
  convention against these numbers — flagged, not resolved).
- `Manufacturer="Custom"` — **not GLP**. `Revisions` records: *"Created from
  Vectorworks with customized user data,"* dated 2021-02-08, `UserID="0"` (anonymous).
  This is a fan reconstruction, almost certainly reverse-derived from a Vectorworks
  symbol, not manufacturer-sourced data.
- `DMXModes` defines exactly **one channel: Dimmer.** Despite having two `Axis` nodes,
  **there is no Pan or Tilt `ChannelFunction` anywhere in this file** — the geometry
  tree has pivots, but nothing drives them. This is the practical meaning of the
  README's "not fully defined": it's a real geometry+pivot skeleton with no working
  articulation wired up.
- `PhysicalDescriptions/Weight` and `LegHeight` are both `0.000000` — unfilled.

The **X4 entry was pulled and read the same way for comparison**: same structure
(`Custom` manufacturer, same 2021-02-08 revision note, Dimmer-only DMXMode), different
numbers — Base 263×299×55mm, Yoke 342×140×253mm (offset 32.7mm, −0.09mm, −157.0mm from
Base), Body 236×236×189mm (offset 0.2mm, 0.3mm, −84.8mm from Yoke). Both fixtures were
evidently authored by the same person, in the same pass, from Vectorworks exports — a
consistent (if unofficial) data source for cross-checking the 90 against its closest
relative, exactly as issue #15 already recommended doing structurally.

**Caveat, stated plainly**: this is not authoritative. It is anonymous, unofficial,
2021-vintage community data with no pan/tilt channel wiring, self-described by its own
maintainers as incomplete. Its pivot numbers should be treated as a **candidate
cross-check**, to be verified against issue #16's DWG-derived numbers if and when those
arrive — not substituted for them. But as a *legally clean, structurally real* starting
point — meshes plus plausible pivot offsets, MIT-licensed, actually redistributable —
it is a meaningfully better find than anything in §1 or §2.

## 4 · Photogrammetry-grade reference

No dimensioned drawing and no scaled photograph (person or ruler in frame) was found
anywhere in this pass. What exists is modest but real:

- **Best find**: `lichtboxx.com` (a lighting dealer) rehosts GLP's own **"Impression 90
  RGB Manual V1.26 EN"** (20pp PDF, fetched and read directly). It contains:
  - p.4: a labeled 3/4-view line drawing of the whole fixture (head, arm/yoke, LCD,
    base) with numbered callouts — useful for confirming assembly boundaries, not
    dimensioned.
  - p.7: a top-down technical drawing of the circular base showing its bolt pattern
    (1× M10 centre + 2× Camlock quick-release) and a marked "front" orientation.
  - p.8: side-profile silhouette line drawings in **three mounting orientations**
    (floor-stand upright, wall-side, hanging/head-down) plus a top-down base view for
    the hanging clamp — genuine orthogonal-ish silhouettes, schematic rather than
    precisely dimensioned.
  - p.19: a specifications table giving base width 340mm, base length 145mm,
    head-vertical height 370mm, net weight 8.0kg. **This is a third, mutually
    inconsistent dimension set** — distinct from both the `.qxf`'s 341×375×338mm/7.5kg
    *and* the 145×340×370mm brochure figure `glp-impression-90-profile.md` §2 already
    flagged as unresolved. Flagged here again, not resolved; whoever finalizes physical
    dimensions now has three data points that don't cleanly reconcile.
  - No stated copyright/reuse terms in the PDF itself; it's GLP's own manual content,
    third-party mirrored — treat the *content* as GLP's copyright regardless of host.
- `motion-rental.de` (a German rental company) hosts the same manual family's DMX chart
  PDF plus a clean 3/4-angle cover photo showing the head mid-tilt with the yoke arm
  visible — a genuinely useful *qualitative* view of the articulation, not a
  measurement.
- `light-control.de` hosts a manual for a different (static, non-moving) impression 90
  variant — an unopened lead, not pursued further in this pass.
- Rental/resale listings checked (10Kused.com, Solaris Network, `lightspares.com`'s
  spares catalog, `r90lighting.com`, `hirewl.com`): mostly single studio product shots
  on plain backgrounds, no scale reference, generally front-on or 3/4 only — low value
  for pivot inference specifically. `lightspares.com`'s spares catalog (LED boards,
  stepper motors, index wheel, timing belt, hall-sensor board, side covers, fan grids —
  15 components) confirms the *mechanism* exists as separate serviceable parts but only
  has small (~100px) ID thumbnails, no exploded diagrams. `hirewl.com`'s **X4** listing
  gives yet another dimension set for the X4 specifically (385×340×242mm) — a
  cross-check point for the X4's proportions only, not the 90's.
- `huss-licht-ton.de` and a `blue-room.org.uk` forum thread both returned **HTTP 403**
  to automated fetch — not investigated further; a live browser session could likely
  get past this and may be worth trying if reference material is still needed later.
- Three YouTube videos surfaced by title relevance (`hToAW2Ze-3Y`, `wUWDaBM1pjA`,
  `_cMj6orrxow`) could **not** be viewed — two blocked by bot-detection requiring
  cookie auth, one is now private. **Not claimed as evidence of anything**; listed only
  so they aren't re-searched blind later.
- Kleinanzeigen (used-gear classifieds) currently lists three active listings for used
  impression 90 units in Germany — real fixtures a photo could in principle be
  requested from a seller for, not independently useful reference material as found.

**Dead-end queries**: `"impression 90" GLP rental company product photo site:*.com OR
site:*.de spec sheet` (surfaced nothing beyond what's listed above).

## 5 · The pivot question, source by source

| Source | Can pivots be determined? | How well |
|---|---|---|
| GrabCAD X4 Bar 20 | No | Wrong fixture (static batten); even setting that aside, the model is a two-body shell with no yoke/linkage part |
| TurboSquid "moving GLP impression" (C4D) | Unknown | Rigged/articulated per its description, but the page couldn't be opened to inspect the rig, and its licence forbids committing the file into this repo regardless |
| SketchUp 3D Warehouse "GLP Impression 90" | Possibly, weakly | Real-world-scale, 7,160 polys — plausibly shaped — but its own bounding box doesn't match the known envelope on any axis, and whether head/yoke are separate movable groups is unconfirmed; licence for redistribution also unconfirmed |
| Visualiser libraries (Capture/Depence/WYSIWYG/Vectorworks/Light Converse) | No | None are independently browsable or extractable; nothing to inspect |
| MVR samples in the wild | N/A | None found carrying this fixture at all |
| **OpenGDTFLibrary's impression 90** | **Yes, numerically — but unverified** | Real `Base→Yoke→Body` `Axis` translation matrix chain, i.e. actual claimed pivot offsets (see §3.1) — the most specific pivot data found anywhere in this research. But it's anonymous 2021 fan/Vectorworks-export data with no working Pan/Tilt channel, not checked against any official source. Treat as a numeric hypothesis to cross-check against issue #16's DWG numbers, not as ground truth on its own. |
| GLP manual line drawings (lichtboxx.com) | Weakly, qualitatively | p.8's side-silhouette drawings in three mounting orientations show the yoke arm's general shape and where it meets the base/head, enough to sanity-check whether a modelled pivot's *height* is roughly plausible, but they are schematic, not dimensioned — no numeric confidence bound can honestly be stated beyond "same order of magnitude as the visible geometry" |
| Rental/resale product photos | No | Single-angle, no scale reference, no fixture shown mid-articulation with a visible pivot gap |

None of the sources found here reach the ticket's benchmark of "a front and side photo
with known overall height, bounding the tilt pivot well." The closest thing to that —
dimensioned, multi-angle, mid-articulation reference — simply was not found by any
third-party source in this pass. The OpenGDTFLibrary numbers are the best *numeric*
lead, precisely because they're the only ones that exist as numbers at all rather than
something to eyeball off a drawing.

## 6 · Recommendation

The ticket poses three options: use a found model, model from reference in build123d,
or estimate from the X4's proportions. This research's answer is a **hybrid of the
second and third, informed by a fourth thing this research turned up that the ticket
didn't anticipate**:

1. **Use a found model outright — no.** Every commercially-hosted candidate that is
   plausibly the right fixture (GrabCAD's is the wrong product; TurboSquid's and 3D
   Warehouse's are plausibly right) carries licence terms that block committing it into
   this public repo: GrabCAD defaults to non-commercial-only and requires the
   uploader's explicit permission; TurboSquid's standard licence explicitly forbids
   redistributing the raw model file; 3D Warehouse's per-model licence was never
   actually seen (JS-rendered, needs a live browser check) and its site-wide default
   specifically restricts "stand-alone" redistribution. None of these is a clean "no" —
   each is usable as **private, informal reference** by a human looking at it, just not
   as a redistributable repo asset.

2. **Model from reference in build123d, cross-checked against OpenGDTFLibrary's
   pivot numbers — yes, this is the recommendation.** OpenGDTFLibrary
   (`heliostate/OpenGDTFLibrary`, MIT licence, verified directly in §3.1) is the one
   source in this entire research pass that is simultaneously (a) actually about the
   right fixture, (b) legally unambiguous — MIT permits copying its meshes or its pivot
   numbers into this repo outright, and (c) structurally real — a genuine `Base → Yoke
   → Body` axis chain with real, non-placeholder translation offsets, for both the
   impression 90 *and* the X4, authored by the same person in the same pass. It is not
   authoritative (anonymous 2021 fan data, no working Pan/Tilt channel, self-described
   as incomplete), so it should not be treated as the final answer to the pivot
   question — but it is a genuinely useful **legally-clean numeric starting point** to
   model against and to cross-check once issue #16 recovers real numbers from GLP's own
   DWGs. Its low-poly 3ds meshes (Base 10.2KB / Yoke 4.2KB / Body 18.7KB) are also
   small enough to be worth opening directly (not done in this pass — no CAD/3ds
   tooling was exercised here) to see whether they're detailed enough to trace over or
   inform proportions in build123d, rather than starting purely from the X4's numbers
   alone.

3. **Estimate purely from the X4's proportions — fallback, not primary.** Still valid
   as issue #15 concluded, and now has a second, independent, consistent-with-itself
   data point in OpenGDTFLibrary's X4 entry alongside the X4's real (but mesh-less)
   GDTF Share profile — but it should now be the fallback if OpenGDTFLibrary's own
   impression 90 numbers turn out on inspection to be unusable, not the first move.

**Concretely, in priority order**: (1) open OpenGDTFLibrary's three `.3ds` files for
the impression 90 in whatever CAD tooling is available and see if they're usable as a
tracing/proportions reference directly, in parallel with (2) build123d modelling driven
by its `Axis` translation numbers as a first-pass pivot placement, both to be
**superseded by issue #16's DWG-derived numbers if and when those resolve** — this
research changes nothing about issue #16's priority, it just gives the build123d path a
concrete, legally clean number to start from instead of a pure X4-envelope estimate.
