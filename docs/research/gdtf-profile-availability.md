# Do GDTF profiles exist for the fixtures in hand?

Research for [issue #2](https://github.com/jnslmk/beamhouse/issues/2) (part of the
[wayfinder map, #1](https://github.com/jnslmk/beamhouse/issues/1)). Context:
`docs/DESIGN.md` §5 (GDTF in the browser) and §9.2 (proxy geometry for the shared-link
viewer). The design's locked decision is "GDTF is the only definition format Beamhouse
resolves" (`docs/DESIGN.md:53`-54), and there are currently zero `.gdtf` files on this
machine (`docs/DESIGN.md:188`).

**Headline answer: partially, and worse than the design assumes.** Of the 13 fixtures in
the reference rig, at most 8 (62%) plausibly have a real GDTF profile, and that number is
itself unconfirmed for the fixture class that matters most (see §5). At least 5 (38%) —
the fogger and the entire pixel-tape class — have no confirmed profile and no automated
path to one. The pixel-strip rendering class, one of the two "done well" goals in
`docs/DESIGN.md`'s §01, is the one with the weakest evidence of an off-the-shelf profile.

## 1. GDTF Share (gdtf-share.com): access model

- **Public browsing works without an account**; download requires one. The site has a
  public "Find Device" search, but downloads are gated behind "Log in" / "Sign up for
  free" (https://gdtf-share.com).
- **There is a documented, official REST API** — not just a browser UI. Canonical source:
  `https://github.com/mvrdevelopment/tools/blob/main/GDTF_Share_API/GDTF%20Share%20API.md`
  (the official `mvrdevelopment` GitHub org), mirrored at
  `https://www.gdtf.eu/gdtf/share_api/share-api/`. Three endpoints under
  `https://gdtf-share.com/apis/public/`:
  - `POST login.php` — `{"user":..., "password":...}`, session cookie on success.
  - `GET getList.php` — session-cookie auth, returns JSON of all fixture revisions
    (`rid`, `fixture`, `manufacturer`, `revision`, `filesize`, `modes`, …).
  - `GET downloadFile.php?rid=<id>` — binary GDTF file for that revision.
  - The docs give literal `curl -c/-b` examples, i.e. this is designed for scripted use.
    The session cookie times out after **2 hours**. A ready-made request collection
    ("Bruno GDTF Share API") is linked from `https://www.gdtf.eu/gdtf/bruno/`.
- **A GDTF Share account is mandatory** for any of the above — "A GDTF Share account is
  required for users to access the functionality provided by the API" (gdtf.eu doc page,
  cited above). We do not have one; none of this was exercised end-to-end.
- **Bulk/zip download**: search results describe a browser-UI "download entire
  collection as one zip" feature, distinct from the per-file API. **Not independently
  verified** — no primary-source page confirming the mechanism or a `revisions.xml`
  index was found. Treat as unconfirmed.
- **gdtf-share.com vs gdtf.eu**: gdtf.eu ("GDTF Hub") is the specification/standard site
  (GDTF is jointly developed by Vectorworks, MA Lighting, Robe Lighting); gdtf-share.com
  is the separate fixture-exchange platform, reportedly VPLT-hosted. The VPLT-hosting
  claim is **secondary-source only** (search-summarized, not fetched directly) — flagged
  as unverified.
- **Rate limits / ToS on scripted access**: not found. Could not locate or fetch the
  site's terms-and-conditions page to check for a bulk-scraping clause.
- **Practical blocker for this research**: gdtf-share.com's search/listing pages
  (e.g. a manufacturer's device list) render client-side via JavaScript. A plain fetch
  returns literal `"Loading..."` placeholders instead of data. This means *discovering*
  which fixtures exist still requires either (a) the authenticated `getList.php` API, or
  (b) a JS-capable browser — a script cannot `curl` its way to "does GLP have a listing"
  without logging in first. Confirmed independently on two separate gdtf-share.com pages
  during this research.

**Bottom line**: the API is real, documented, and script-friendly — this is good news for
a future `gdtf:` sync tool — but it is gated by a mandatory free account, and we could not
use it here (no credentials), so no claim below about a *specific* profile's existence on
GDTF Share is fully confirmed; each is qualified accordingly.

## 2. Specific fixtures

Reference rig, from `~/git-projects/mizer-shows/OBF26_Bunte-Stube.yml`: 6× GLP impression
90 RGB (movers, ids 1–6), 2× Generic Dimmer (ids 7–8), 1× ADJ Fog Fury Jett (id 10), 4×
WLED Segment Effect at 18ch each (ids 9, 11–13) — 13 fixtures total, matching
`docs/DESIGN.md:186`–188.

| Fixture | GDTF profile? | Evidence |
| --- | --- | --- |
| GLP impression 90 RGB ×6 | **Unconfirmed, plausible** | GLP has a manufacturer page on GDTF Share (`gdtf-share.com/userPage.php?name=German Light Products&page=Fixtures`) and sibling GLP fixtures (impression S500 Wash, X4 Bar, X5 IP) are referenced as hosted there in search results. The page's device list is JS-rendered and could not be scraped without login (see §1) — so we could not confirm the *90 RGB specifically* is among them. GLP's own site (glp.de / germanlightproducts.com) surfaced only DMX charts and PDF manuals in search snippets, no direct GDTF download link found. |
| Generic pixel-strip / pixel-tape (GeometryReference) | **No off-the-shelf template found** | Neither the GDTF spec repo (`github.com/mvrdevelopment/spec`, `examples/` is markdown docs only) nor `python-gdtf`'s test fixtures (`github.com/open-stage/python-gdtf`, only bundled fixture is `BlenderDMX@LED_PAR_64_RGBW@v0.3.gdtf`, a PAR — not a strip) ship a generic pixel-bar sample. The closest real-world analog found is the Clay Paky Show Batten ("Pixel Engine RGB" mode) on GDTF Share, referenced from a GDTF Share forum thread on GeometryReference (`gdtf-share.com/forum/index.php?/topic/236-reference-geometry-and-dmx/`) — but the thread's own original poster reports it did not reliably work ("I have not managed to reliably make this happen"). This is the weakest link in the whole design: the fixture class the design calls out as "done well" (`docs/DESIGN.md` §01) and expects to serve generically has no confirmed ready-made profile; a working one would likely have to be hand-authored. |
| Generic Dimmer ×2 | **Unknown / unconfirmed** | No listing confirmed or ruled out; blocked by the same JS-rendering issue on GDTF Share search. |
| ADJ Fog Fury Jett ×1 | **Not found; no conversion path** | No GDTF Share or gdtf.eu hit. Open Fixture Library (OFL) has a **Fog Fury Jett Pro** (different model) at `open-fixture-library.org/american-dj/fog-fury-jett-pro`, but its export-format list (AGLight, Eurolite Color Chief 2.0, ColorSource, D::Light, DMXControl3, Dragonframe, e:cue, Millumin, OFL JSON, OP-Z, QLC+) does **not include GDTF** — OFL's GDTF plugin is import-only (GDTF→OFL), confirmed via `plugin.json` at `github.com/OpenLightingProject/open-fixture-library/tree/master/plugins/gdtf`. A GDTF-export plugin is a still-open OFL feature request (`github.com/OpenLightingProject/open-fixture-library/issues/476`). |

## 3. Mizer's bundled fixtures

Checked `~/git-projects/Mizer/crates/components/fixtures/gdtf/` directly.

- `.gitignore` for that crate contains exactly one line: `.fixtures`
  (`~/git-projects/Mizer/crates/components/fixtures/gdtf/.gitignore:1`). The `.fixtures`
  directory referenced by the tests **does not exist on disk** in this clone, and
  **`find ~/git-projects/Mizer -iname "*.gdtf"` returns zero results anywhere in the
  repo.** Mizer ships no bundled GDTF fixtures at all — the directory is populated by
  each developer locally and never committed.
- `tests/load_fixtures.rs` (`~/git-projects/Mizer/crates/components/fixtures/gdtf/tests/load_fixtures.rs:6`-`22`)
  instantiates `GdtfProvider::new(".fixtures".into())` and asserts `provider.load()`
  succeeds — this test depends on that gitignored, locally-populated directory and would
  need fixtures placed there manually to pass; it is not self-contained in CI/on a fresh
  clone as far as this repo's contents show.
- Mizer's own default settings reference three GDTF library search paths
  (`~/git-projects/Mizer/crates/runtime/settings/src/defaults/mod.rs:68,70,72`):
  `crates/components/fixtures/gdtf/.fixtures`, `../Resources/fixtures/gdtf`, and
  `fixtures/gdtf` — all empty/absent by default, all populated at the operator's
  discretion.

**Confirms `docs/DESIGN.md`'s framing exactly**: "referenced as a default library path"
(issue #2 body) is accurate — it's a *path*, not a *library*. Nothing ships.

## 4. Other sources of GDTF files

- **BlenderDMX** (`open-stage/blender-dmx`) does **not** bundle profiles. Its own docs
  state fixtures come only from local import or a GDTF Share download inside the addon
  (`https://blenderdmx.eu/docs/gdtffixture/`), the latter requiring the same GDTF Share
  account as above. No example-fixtures folder in the addon distribution.
- **Open Fixture Library** (`open-fixture-library.org`) is **import-only** for GDTF — see
  §2's ADJ Fog Fury Jett row. It cannot manufacture a GDTF profile from an OFL or QLC+
  definition, ruling it out as a conversion path. It also has no "GLP impression 90 RGB"
  entry (site search surfaced other GLP impression models — FR1, Spot One, Laser, X4 Bar
  10 — but not the 90 RGB).
- **No independent GitHub mirror of GDTF files** was found. `github.com/topics/gdtf`
  lists parsers and libraries (`open-stage/python-gdtf`, `mvrdevelopment/libMVRgdtf`), not
  fixture-file collections. GDTF Share itself is described elsewhere (gdtf.eu) as holding
  "11822 files in total" — the closest thing to a canonical repository, and the one we
  couldn't fully query (§1).
- **No QLC+ (.qxf) → GDTF converter exists.** Checked because the OBF26 rig's current
  `qlc:` definitions (`docs/DESIGN.md:186`-188) are the obvious thing to try converting.
  QLC+ forum threads discuss *importing* GDTF into QLC+, never exporting QLC+ definitions
  to GDTF (e.g. `qlcplus.org/forum/viewtopic.php?t=17017`). Given OFL is also import-only
  in the same direction, there is **no automated path** from the rig's existing fixture
  definitions to GDTF — any GDTF profile for these fixtures has to be sourced fresh
  (GDTF Share/manufacturer) or hand-authored from scratch.
- **Manufacturer direct downloads**: not conclusively checked across major manufacturers
  in this pass (GLP's site checked only via search snippets, not a direct crawl of every
  page). Treat "manufacturers now publish GDTF directly" as **unverified** either way.

## 5. The fallback: how much of the rig lands on `PrimitiveType` proxies

The GDTF spec (`github.com/mvrdevelopment/spec`, `gdtf-spec.md`, Table 32) defines
`PrimitiveType` as: `"Undefined", "Cube", "Cylinder", "Sphere", "Base", "Yoke", "Head",
"Scanner", "Conventional", "Pigtail", "Base1_1", "Scanner1_1", "Conventional1_1"`. A
geometry's mesh `File` attribute is optional; when absent, a renderer draws the
`PrimitiveType` shape instead. This matches `docs/DESIGN.md:295`'s description exactly.
Same source confirms the vertex-budget claim at `docs/DESIGN.md:300`: "All models of a
device combined should not exceed a maximum vertices count of 1200 for the default mesh
level of detail," with three LOD tiers (Low ≈30% of default, Default, High unlimited).

Quantifying against the 13-fixture reference rig, using the findings in §2:

| Outcome | Fixtures | Share of rig |
| --- | --- | --- |
| Confirmed no profile, no conversion path → proxy geometry | Fog Fury Jett (1) | 8% |
| No confirmed ready-made profile, class the design leans on hardest → likely proxy or hand-authored | WLED pixel tape (4) | 31% |
| Unconfirmed either way (blocked by GDTF Share's JS-rendered search) | GLP impression 90 RGB (6), Generic Dimmer (2) | 62% |

Even taking the most optimistic reading — every unconfirmed fixture turns out to have a
real profile — **5 of 13 fixtures (38%) are proxy geometry**, and that 38% includes the
entire pixel-tape rendering class, not just an edge case. Taking the more cautious
reading — a GDTF Share account is needed to even find out whether the GLP and Generic
Dimmer profiles exist — the honest current answer is "we don't know coverage for 62% of
the rig," which for a design whose stated goal is "generic, from GDTF" (`docs/DESIGN.md`
§01) is itself the finding: **the proxy-geometry path in §9.2 cannot be scoped as a
sharing-only nicety until someone actually logs into GDTF Share and runs `getList.php`.**

## What this means for the design's assumption

`docs/DESIGN.md` treats GDTF Share as effectively "the" fixture library and QLC+ as
explicitly out of scope (`docs/DESIGN.md:53`-54, "**QLC+ as a fixture-definition
source.** GDTF is the only definition format Beamhouse resolves"). Two things complicate
that:

1. **No migration path exists.** The plan to move the OBF26 rig "onto `gdtf:` profiles
   where profiles exist" (`docs/DESIGN.md` §4.2) cannot lean on any automated QLC+→GDTF
   conversion — there isn't one (§4 above). Every fixture either has a matching profile
   on GDTF Share (unconfirmed for 8/13 without an account) or needs a profile
   hand-authored from the GDTF spec — which for the pixel-tape class may be true even in
   the best case, since no working generic template was found.
2. **The rendering class the design is proudest of is its weakest evidence.** §01 names
   "continuous emissive strips for pixel tape" as one of two fixture classes to get right,
   and §5.3 assumes `GeometryReference` expansion off an existing profile. The one
   concrete example found of that pattern in the wild (Clay Paky Show Batten) was
   reported by its own discoverer as unreliable. If this holds up, the pixel-tape class
   ships in v1 only if someone hand-authors a working generic-strip GDTF profile —
   which is real, buildable work (the spec section is public and the mechanism is
   documented), but it is not "resolve GDTF and go," which is what the design currently
   assumes.

Neither point breaks the "GDTF only" decision — hand-authoring a handful of profiles from
a documented, open spec is a bounded, one-time cost, not a wall. But it does mean v1's
render path should be written GDTF-profile-optional from day one — which §5.1 and §9.2
already do by specifying the `PrimitiveType` fallback — rather than treating proxy
geometry as a shared-link-only edge case as §9.2 currently frames it. The bridge
ticket (#6, listed as blocked by this one) should assume it needs to render a rig that is
partly or mostly proxy geometry, not occasionally.

## What we could not determine

- Whether GLP impression 90 RGB and Generic Dimmer profiles actually exist on GDTF Share
  — blocked by the mandatory account and JS-rendered search pages. Needs someone with (or
  willing to create) a GDTF Share account to run `getList.php` and grep the result, or to
  browse manually in a real browser.
- The exact mechanism (if any) of GDTF Share's advertised bulk/zip download.
- GDTF Share's terms of service regarding scripted access (page not fetched).
- Whether manufacturers other than GLP now commonly publish `.gdtf` files directly on
  their own product pages — checked for none exhaustively.
- Whether the Clay Paky Show Batten profile, or any other real-world GeometryReference
  example, would actually work as a template if downloaded and inspected directly (this
  research went only as far as a forum thread's discussion of it).
