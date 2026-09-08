import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
  deckFrameH,
  deckLegH,
  deckTopH,
  resolvedReferenceDefinition,
  stageDeckDefinitionId,
  type LinearRGB,
  type StripFixture,
} from "./reference-rig.ts";
import {
  BEAM_FRAG,
  BEAM_LENGTH_FALLOFF_K,
  BEAM_VERT,
  POOL_FRAG,
  POOL_VERT,
  beamThrowM,
  edgeWidthFraction,
  poolRadiusM,
  poolStretch,
} from "./beam-shader.ts";
import { staticsFor, type FixtureState, type FixtureStatics } from "./resolve.ts";
import { copyLinearPixelsIfChanged, copyRgbBytesIfChanged, MarkGate } from "./idle-gate.ts";
import {
  SCENE_BEAM_LENGTH_M,
  SCENE_DENSITY,
  samePlacement,
  type BhsDefinition,
  type LocalFixture,
  type Placement,
} from "./scene.ts";

export interface EditableFixture {
  id: number;
  setPlacement(placement: FixturePlacement): void;
  placement(): FixturePlacement;
}

export interface CubeFixture extends EditableFixture {
  address: number;
  setLevel(level: number): void;
}

export type FixturePlacement = Placement;

interface RenderedCube extends CubeFixture {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  marker: HTMLElement;
}

interface RenderedFixture extends EditableFixture {
  mesh: THREE.Object3D;
}

export interface TextureStrip extends EditableFixture {
  setPixels(pixels: LinearRGB): void;
  setTrust(stale: boolean, contended: boolean): void;
}

export interface StripProbeMarkers {
  start: HTMLElement;
  end: HTMLElement;
}

export interface CaptureResult {
  bytes: Uint8Array;
  width: number;
  height: number;
  downscaled: boolean;
}

export interface Viewport {
  cubes: CubeFixture[];
  strips: TextureStrip[];
  fixtures: EditableFixture[];
  /** Vendored stage mesh: swaps live fixtures now and templates every later sync. */
  defineStageMesh(definitionId: string, template: THREE.Object3D): void;
  selectFixtures(ids: readonly number[]): void;
  setEditable(editable: boolean): void;
  setRenderMode(mode: "live" | "intensity"): void;
  setGizmoMode(mode: "translate" | "rotate"): void;
  setSnap(step: number | null): void;
  setSceneFixtures(
    fixtures: readonly LocalFixture[],
    definitions: Readonly<Record<string, BhsDefinition>>,
  ): void;
  /** Third-party definition preview: referenced mesh when present, proxy primitive otherwise. */
  showGdtfFixture(definition: BhsDefinition, mesh: THREE.Object3D | null): void;
  setSceneFixtureLevels(levels: ReadonlyMap<number, number>): void;
  setSceneFixturePixels(pixels: ReadonlyMap<number, Uint8Array>): void;
  /** Total resolution through one seam: pan, tilt, zoom, colour, dimmer and shutter. */
  setSceneFixtureStates(states: ReadonlyMap<number, FixtureState>): void;
  /** Scene-wide atmosphere fixed points: density uniform + soft beam length. */
  setAtmosphere(density: number, beamLengthM: number): void;
  cameraView(): { position: [number, number, number]; target: [number, number, number] };
  setCameraView(view: {
    position: [number, number, number];
    target: [number, number, number];
  }): void;
  /** Frames the rig's content box at meet: the landscape viewer rule (ADR-0032 §4). */
  frameContentBox(points: readonly (readonly [number, number, number])[]): void;
  /** Command-driven readback inside one frame; the reply states what was captured. */
  capture(maxEdge?: number, quality?: number): Promise<CaptureResult>;
}

export function createViewport(
  host: HTMLElement,
  markers: HTMLElement[],
  stripFixtures: readonly StripFixture[],
  stripMarkers: HTMLElement[] = [],
  stripProbeMarkers: StripProbeMarkers[] = [],
  onTransform?: (id: number, placement: FixturePlacement) => void,
  onSelect?: (id: number, additive: boolean) => void,
  builtInReference = true,
): Viewport {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x11100f);
  scene.fog = new THREE.FogExp2(0x11100f, 0.025);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(7.8, 7.4, 8.5);
  camera.lookAt(0, 0.35, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  host.append(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0.35, 0);
  controls.minDistance = 4;
  controls.maxDistance = 18;
  // Idle-frame mark gate: every input to the mark projection owns a signal —
  // orbit-controls change, placements, gizmo drags, mesh swaps, resizes.
  // No pixel-epsilon tuning. Trust labels write directly at their own call
  // sites and never pass through this gate.
  const markGate = new MarkGate();
  controls.addEventListener("change", () => {
    markGate.cameraChanged();
  });
  const gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.setSpace("world");
  let snapStep: number | null = 0.25;
  gizmo.translationSnap = snapStep;
  gizmo.rotationSnap = THREE.MathUtils.degToRad(15);
  scene.add(gizmo.getHelper());
  let editable = false;
  let selectedFixture: RenderedFixture | null = null;
  let dragStart: FixturePlacement | null = null;
  gizmo.addEventListener("dragging-changed", (event) => {
    if (!editable) {
      gizmo.detach();
      dragStart = null;
      controls.enabled = true;
      return;
    }
    controls.enabled = !event.value;
    if (event.value && gizmo.object) {
      dragStart = placementFor(gizmo.object);
    }
  });
  gizmo.addEventListener("mouseDown", () => {
    if (!editable) return;
    dragStart = gizmo.object ? placementFor(gizmo.object) : null;
  });
  gizmo.addEventListener("mouseUp", () => {
    if (!editable) return;
    const selected = gizmo.object;
    if (!selected) return;
    const fixture = editableFixtures.find((candidate) => candidate.mesh === selected);
    const next = placementFor(selected);
    if (fixture && dragStart && !samePlacement(dragStart, next)) onTransform?.(fixture.id, next);
    dragStart = null;
  });
  // Gizmo drags move meshes with no camera change: every movement re-opens the gate.
  gizmo.addEventListener("objectChange", () => {
    markGate.positionsChanged();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Alt") return;
    gizmo.translationSnap = null;
    gizmo.rotationSnap = null;
  });
  window.addEventListener("keyup", (event) => {
    if (event.key !== "Alt") return;
    gizmo.translationSnap = snapStep;
    gizmo.rotationSnap = snapStep === null ? null : THREE.MathUtils.degToRad(15);
  });

  scene.add(new THREE.HemisphereLight(0xd8e1ee, 0x3a332b, 1.7));
  const key = new THREE.DirectionalLight(0xffd6a3, 3.2);
  key.position.set(-3, 7, 4);
  scene.add(key);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshStandardMaterial({ color: 0x181716, roughness: 0.92 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const grid = new THREE.GridHelper(30, 30, 0x4a4743, 0x292724);
  grid.position.y = 0.003;
  scene.add(grid);

  const colors = builtInReference ? [0xffa52f, 0x49a4ff, 0xf05baa] : [];
  const activeStripFixtures = builtInReference ? stripFixtures : [];
  let renderMode: "live" | "intensity" = "live";
  const fixtures = colors.map((color, index): RenderedCube => {
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.17),
      emissive: color,
      emissiveIntensity: 0,
      metalness: 0.08,
      roughness: 0.32,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.35, 1.35), material);
    mesh.position.set((index - 1) * 2.25, 0.7, 0);
    mesh.rotation.y = Math.PI / 4;
    mesh.rotation.x = -0.08;
    scene.add(mesh);
    return {
      id: index + 1,
      address: index + 1,
      mesh,
      marker: markers[index] ?? document.createElement("span"),
      setLevel(level: number) {
        const normalized = level / 255;
        if (renderMode === "intensity") {
          material.emissive.set(0xffb340);
          material.emissiveIntensity = normalized * 2.8;
          material.color.set(0x1a1a1a);
          return;
        }
        material.emissive.set(color);
        material.emissiveIntensity = normalized * 2.8;
        material.color.set(color).multiplyScalar(0.17 + normalized * 0.42);
      },
      setPlacement(placement) {
        mesh.position.fromArray(placement.position);
        mesh.rotation.set(
          THREE.MathUtils.degToRad(placement.rotation[0]),
          THREE.MathUtils.degToRad(placement.rotation[1]),
          THREE.MathUtils.degToRad(placement.rotation[2]),
        );
        this.marker.dataset.renderedPlacementX = String(placement.position[0]);
        this.marker.dataset.renderedPlacementZ = String(placement.position[2]);
        this.marker.dataset.renderedPlacementRy = String(placement.rotation[1]);
        // Meshes moved without the camera: the gate must rewrite marks.
        markGate.positionsChanged();
      },
      placement() {
        return {
          position: mesh.position.toArray(),
          rotation: [
            THREE.MathUtils.radToDeg(mesh.rotation.x),
            THREE.MathUtils.radToDeg(mesh.rotation.y),
            THREE.MathUtils.radToDeg(mesh.rotation.z),
          ],
        };
      },
    };
  });

  const stripMeshes: THREE.Mesh[] = [];
  const strips = activeStripFixtures.map((fixture, index): TextureStrip => {
    const pixels = new Float32Array(fixture.pixels * 4);
    const texture = new THREE.DataTexture(
      pixels,
      fixture.pixels,
      1,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    texture.colorSpace = THREE.LinearSRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      emissiveMap: texture,
      emissive: 0xffffff,
      side: THREE.DoubleSide,
      roughness: 0.35,
    });
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        fixture.definition.length,
        fixture.definition.height,
        fixture.definition.width,
      ),
      material,
    );
    mesh.position.fromArray(fixture.placement.position);
    const heading = fixture.placement.radialAngle + (fixture.placement.reversed ? Math.PI : 0);
    mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -heading);
    scene.add(mesh);
    stripMeshes.push(mesh);

    return {
      id: fixture.id,
      setPixels(nextPixels) {
        // Texel-gated: static looks never re-upload; placement never dirties.
        if (copyLinearPixelsIfChanged(pixels, fixture.pixels, nextPixels))
          texture.needsUpdate = true;
      },
      setTrust(stale, contended) {
        const marker = stripMarkers[index];
        if (!marker) return;
        const label = [contended ? "disputed" : "", stale ? "old" : ""].filter(Boolean).join(" · ");
        marker.textContent = label;
        marker.dataset.visible = String(label.length > 0);
      },
      setPlacement(placement) {
        mesh.position.fromArray(placement.position);
        mesh.rotation.set(
          THREE.MathUtils.degToRad(placement.rotation[0]),
          THREE.MathUtils.degToRad(placement.rotation[1]),
          THREE.MathUtils.degToRad(placement.rotation[2]),
        );
        const marker = stripMarkers[index];
        if (marker) {
          marker.dataset.renderedPlacementX = String(placement.position[0]);
          marker.dataset.renderedPlacementZ = String(placement.position[2]);
          marker.dataset.renderedPlacementRy = String(placement.rotation[1]);
        }
        markGate.positionsChanged();
      },
      placement() {
        return placementFor(mesh);
      },
    };
  });
  const editableFixtures: RenderedFixture[] = [
    ...fixtures,
    ...strips.flatMap((fixture, index) => {
      const mesh = stripMeshes[index];
      return mesh ? [{ ...fixture, mesh }] : [];
    }),
  ];
  const localFixtures = new Map<number, RenderedFixture>();
  // Vendored GLB templates by definition id: clones share geometry, and every
  // later setSceneFixtures re-clones, so async loads survive re-ingest.
  const stageMeshTemplates = new Map<string, THREE.Object3D>();
  const localDefinitions = new Map<number, string>();
  const localMaterials = new Map<number, THREE.MeshStandardMaterial>();
  interface LocalBeam {
    cone: THREE.Mesh<THREE.ConeGeometry, THREE.ShaderMaterial>;
    pool: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>;
    angle: number;
    radius: number;
    lit: boolean;
  }
  const localBeams = new Map<number, LocalBeam>();
  // Declared optics per fixture: FieldAngle/BeamRadius/edge from staticsFor,
  // read at setSceneFixtures time so the per-tick seam stays total.
  const localOptics = new Map<
    number,
    { fieldDeg: number | null; radiusM: number; soft: boolean }
  >();
  // Scene-wide atmosphere fixed points (.bhs stored); main.ts owns the refresh.
  let beamDensity = SCENE_DENSITY;
  let beamLengthM = SCENE_BEAM_LENGTH_M;
  const beamAxis = new THREE.Vector3();
  interface LocalTexels {
    texture: THREE.DataTexture;
    pixels: Float32Array;
    count: number;
  }
  const localTexels = new Map<number, LocalTexels>();
  const localStripLengths = new Map<number, number>();
  const localMarkers = new Map<number, HTMLElement>();
  const buildStaticsMesh = (id: number, statics: FixtureStatics): THREE.Object3D => {
    const size = statics.size;
    const count =
      statics.layout.kind === "discrete"
        ? statics.layout.positions.length
        : statics.layout.kind === "tiled"
          ? statics.layout.count
          : 0;
    if (count > 1) {
      const pixels = new Float32Array(count * 4);
      const texture = new THREE.DataTexture(pixels, count, 1, THREE.RGBAFormat, THREE.FloatType);
      texture.colorSpace = THREE.LinearSRGBColorSpace;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        emissiveMap: texture,
        emissive: 0xffffff,
        roughness: 0.35,
      });
      localTexels.set(id, { texture, pixels, count });
      return new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
    }
    return new THREE.Mesh(
      new THREE.BoxGeometry(size[0], size[1], size[2]),
      new THREE.MeshStandardMaterial({ color: 0x86817c, metalness: 0.08, roughness: 0.7 }),
    );
  };
  const buildSceneMesh = (
    id: number,
    definition: BhsDefinition | undefined,
    definitionId: string,
  ): THREE.Object3D => {
    const mesh = localFixtureMesh(definition, definitionId);
    if (definition?.kind !== "strip" || !(mesh instanceof THREE.Mesh)) return mesh;
    const pixels = new Float32Array(definition.pixels * 4);
    const texture = new THREE.DataTexture(
      pixels,
      definition.pixels,
      1,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    texture.colorSpace = THREE.LinearSRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    (mesh.material as THREE.Material).dispose();
    mesh.material = new THREE.MeshStandardMaterial({
      map: texture,
      emissiveMap: texture,
      emissive: 0xffffff,
      roughness: 0.35,
    });
    localTexels.set(id, { texture, pixels, count: definition.pixels });
    localStripLengths.set(id, (definition.pixels * definition.pitchMm) / 1000);
    return mesh;
  };
  let gdtfPreview: THREE.Object3D | null = null;
  let gdtfPreviewOwned = false;
  const showGdtfFixture = (definition: BhsDefinition, mesh: THREE.Object3D | null) => {
    if (gdtfPreview) {
      scene.remove(gdtfPreview);
      if (gdtfPreviewOwned) disposeObject(gdtfPreview);
      gdtfPreview = null;
    }
    // ponytail: cached meshes are borrowed, proxy meshes are owned and disposed on replace.
    gdtfPreview = mesh ?? localFixtureMesh(definition, "gdtf:preview");
    gdtfPreviewOwned = mesh === null;
    gdtfPreview.position.set(0, 0.5, 0);
    scene.add(gdtfPreview);
    host.dataset.gdtfSource = mesh ? "mesh" : "proxy";
  };
  const setSceneFixtures = (
    nextFixtures: readonly LocalFixture[],
    definitions: Readonly<Record<string, BhsDefinition>>,
  ) => {
    // The mark set itself changed: force one position rewrite through the gate.
    markGate.positionsChanged();
    for (const fixture of localFixtures.values()) {
      scene.remove(fixture.mesh);
      disposeObject(fixture.mesh);
      localMaterials.delete(fixture.id);
      const beam = localBeams.get(fixture.id);
      if (beam) {
        scene.remove(beam.cone);
        scene.remove(beam.pool);
        beam.cone.geometry.dispose();
        beam.cone.material.dispose();
        beam.pool.material.dispose();
        localBeams.delete(fixture.id);
      }
      localOptics.delete(fixture.id);
      localTexels.get(fixture.id)?.texture.dispose();
      localTexels.delete(fixture.id);
      const index = editableFixtures.indexOf(fixture);
      if (index >= 0) editableFixtures.splice(index, 1);
    }
    localFixtures.clear();
    localStripLengths.clear();
    localMarkers.clear();
    localDefinitions.clear();
    for (const fixture of nextFixtures) {
      const template = stageMeshTemplates.get(fixture.definition);
      const statics = template ? null : staticsFor(fixture.definition, fixture.mode);
      // ponytail: template clones share geometry; only unaddressed stage objects use them.
      const mesh =
        template?.clone() ??
        (statics
          ? buildStaticsMesh(fixture.id, statics)
          : buildSceneMesh(fixture.id, definitions[fixture.definition], fixture.definition));
      mesh.position.set(0, 0.5, 0);
      mesh.userData.baseRotation = [0, 0, 0];
      scene.add(mesh);
      const rendered: RenderedFixture = {
        id: fixture.id,
        mesh,
        setPlacement(placement) {
          mesh.position.fromArray(placement.position);
          mesh.rotation.set(
            THREE.MathUtils.degToRad(placement.rotation[0]),
            THREE.MathUtils.degToRad(placement.rotation[1]),
            THREE.MathUtils.degToRad(placement.rotation[2]),
          );
          const marker = localMarkers.get(fixture.id);
          if (marker) {
            marker.dataset.renderedPlacementX = String(placement.position[0]);
            marker.dataset.renderedPlacementZ = String(placement.position[2]);
            marker.dataset.renderedPlacementRy = String(placement.rotation[1]);
          }
          const stripIndex = stripFixtures.findIndex((candidate) => candidate.id === fixture.id);
          const stripMarker = stripMarkers[stripIndex];
          if (stripMarker) {
            stripMarker.dataset.renderedPlacementX = String(placement.position[0]);
            stripMarker.dataset.renderedPlacementZ = String(placement.position[2]);
            stripMarker.dataset.renderedPlacementRy = String(placement.rotation[1]);
          }
          mesh.userData.baseRotation = [...placement.rotation];
          // Covers placement edits, defineStageMesh swaps (via setPlacement),
          // and every out-of-band caller: the mesh moved, marks must follow.
          markGate.positionsChanged();
        },
        placement() {
          return placementFor(mesh);
        },
      };
      localDefinitions.set(fixture.id, fixture.definition);
      if (editableFixtures.length < markers.length)
        localMarkers.set(fixture.id, markers[editableFixtures.length]!);
      localFixtures.set(fixture.id, rendered);
      if (statics)
        localOptics.set(fixture.id, {
          fieldDeg: statics.fieldDeg,
          radiusM: statics.radiusM ?? 0,
          soft: statics.softEdge,
        });
      if (mesh instanceof THREE.Mesh && mesh.material instanceof THREE.MeshStandardMaterial)
        localMaterials.set(fixture.id, mesh.material);
      editableFixtures.push(rendered);
    }
  };
  const defineStageMesh = (definitionId: string, template: THREE.Object3D): void => {
    stageMeshTemplates.set(definitionId, template);
    for (const [id, rendered] of localFixtures) {
      if (localDefinitions.get(id) !== definitionId) continue;
      const current = rendered.mesh;
      const placement = placementFor(current);
      const next = template.clone();
      scene.remove(current);
      disposeObject(current);
      scene.add(next);
      rendered.mesh = next;
      rendered.setPlacement(placement);
    }
  };

  const setSceneFixtureStates = (states: ReadonlyMap<number, FixtureState>) => {
    let cones = 0;
    let pools = 0;
    for (const [id, rendered] of localFixtures) {
      const state = states.get(id);
      if (!state) continue;
      const mesh = rendered.mesh;
      const base = (mesh.userData.baseRotation ?? [0, 0, 0]) as [number, number, number];
      mesh.rotation.set(
        THREE.MathUtils.degToRad(base[0] + state.tiltDeg),
        THREE.MathUtils.degToRad(base[1] + state.panDeg),
        THREE.MathUtils.degToRad(base[2]),
      );
      const material = localMaterials.get(id);
      const textured = localTexels.has(id);
      if (material && !textured) {
        material.wireframe = state.unbound || state.beam.kind === "marker";
        if (state.unbound) {
          material.emissive.set(0xd537f2);
          material.emissiveIntensity = 0.7;
        } else if (state.beam.kind === "marker") {
          material.emissive.set(0xffb340);
          material.emissiveIntensity = 0.7;
        } else {
          material.emissive.setRGB(state.color[0] ?? 0, state.color[1] ?? 0, state.color[2] ?? 0);
          material.emissiveIntensity = state.level * 2.8;
        }
      } else if (material) {
        material.wireframe = state.unbound || state.beam.kind === "marker";
        if (state.unbound) material.emissive.set(0xd537f2);
        else if (state.beam.kind === "marker") material.emissive.set(0xffb340);
        else material.emissive.set(0xffffff);
        material.emissiveIntensity = state.unbound || state.beam.kind === "marker" ? 0.7 : 1;
      }
      const texels = localTexels.get(id);
      if (texels) {
        // Unbound and marker states carry no pixels: upload black so no stale
        // frame survives behind the wireframe cue — but only when texel bytes
        // actually differed, so static looks never churn GPU bandwidth.
        if (copyLinearPixelsIfChanged(texels.pixels, texels.count, state.pixels))
          texels.texture.needsUpdate = true;
      }
      const beam = localBeams.get(id);
      const optics = localOptics.get(id) ?? { fieldDeg: null, radiusM: 0, soft: true };
      if (state.beam.kind === "cone" && state.level > 0.001) {
        const angle = state.beam.angleDeg;
        const edge = edgeWidthFraction(angle, optics.fieldDeg, optics.soft);
        let entry = beam;
        if (!entry) {
          const cone = new THREE.Mesh(
            coneGeometry(angle, optics.radiusM, beamLengthM),
            beamMaterial(),
          );
          const pool = new THREE.Mesh(poolGeometry, poolMaterial());
          scene.add(cone);
          entry = { cone, pool, angle, radius: optics.radiusM, lit: true };
          localBeams.set(id, entry);
        } else if (
          Math.abs(entry.angle - angle) > 0.25 ||
          Math.abs(entry.radius - optics.radiusM) > 0.005
        ) {
          entry.cone.geometry.dispose();
          entry.cone.geometry = coneGeometry(angle, optics.radiusM, beamLengthM);
          entry.angle = angle;
          entry.radius = optics.radiusM;
        }
        // Cones stay out of the intensity map; pools render unchanged there.
        const live = renderMode === "live";
        entry.lit = true;
        entry.cone.visible = live;
        entry.cone.position.copy(mesh.position);
        entry.cone.quaternion.copy(mesh.quaternion);
        setBeamUniforms(entry.cone.material, state, edge, beamDensity, beamLengthM);
        if (live) cones += 1;
        // Analytic pool: the beam axis against y=0, sized by BeamAngle x
        // throw with FieldAngle softening. No occlusion, no interaction.
        beamAxis.set(0, 0, 1).applyQuaternion(mesh.quaternion);
        const throwM = beamThrowM(mesh.position.y, beamAxis.y);
        if (throwM === null) {
          entry.pool.visible = false;
        } else {
          const radius = poolRadiusM(angle, throwM, optics.radiusM);
          entry.pool.visible = true;
          entry.pool.position.copy(mesh.position).addScaledVector(beamAxis, throwM).setY(0.02);
          entry.pool.rotation.set(0, Math.atan2(beamAxis.x, beamAxis.z), 0);
          entry.pool.scale.set(radius * poolStretch(beamAxis.y), 1, radius);
          setPoolUniforms(entry.pool.material, state, edge);
          pools += 1;
        }
      } else if (beam) {
        beam.lit = false;
        beam.cone.visible = false;
        beam.pool.visible = false;
      }
    }
    host.dataset.fixtureCones = String(cones);
    host.dataset.beamPools = String(pools);
  };

  const picker = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downAt: { x: number; y: number } | null = null;
  renderer.domElement.addEventListener("pointerdown", (event) => {
    downAt = { x: event.clientX, y: event.clientY };
  });
  renderer.domElement.addEventListener("pointerup", (event) => {
    if (!downAt) return;
    const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
    downAt = null;
    if (moved > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    picker.setFromCamera(pointer, camera);
    const hit = picker.intersectObjects(
      editableFixtures.map((fixture) => fixture.mesh),
      false,
    )[0];
    if (!hit) return;
    const fixture = editableFixtures.find((candidate) => candidate.mesh === hit.object);
    if (fixture) onSelect?.(fixture.id, event.shiftKey);
  });
  const resize = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    // Projection and host pixels changed: projected mark positions are stale.
    markGate.positionsChanged();
  };
  new ResizeObserver(resize).observe(host);
  resize();

  // All additive screen-space mark projections in one callable: the animation
  // loop runs it only when the mark gate opens (camera moved or layout changed).
  const writeMarkPositions = (): void => {
    for (const fixture of fixtures) {
      const position = fixture.mesh.position.clone().project(camera);
      fixture.marker.style.left = `${(position.x * 0.5 + 0.5) * host.clientWidth}px`;
      fixture.marker.style.top = `${(-position.y * 0.5 + 0.5) * host.clientHeight}px`;
    }
    for (const [id, fixture] of localFixtures) {
      const marker = localMarkers.get(id);
      if (!marker) continue;
      const position = fixture.mesh.position.clone().project(camera);
      marker.style.left = `${(position.x * 0.5 + 0.5) * host.clientWidth}px`;
      marker.style.top = `${(-position.y * 0.5 + 0.5) * host.clientHeight}px`;
    }
    for (const [index] of strips.entries()) {
      const marker = stripMarkers[index];
      if (!marker) continue;
      const definition = stripFixtures[index];
      if (!definition) continue;
      const mesh = stripMeshes[index];
      if (!mesh) continue;
      const position = mesh.position.clone().project(camera);
      marker.style.left = `${(position.x * 0.5 + 0.5) * host.clientWidth}px`;
      marker.style.top = `${(-position.y * 0.5 + 0.5) * host.clientHeight}px`;
      const probe = stripProbeMarkers[index];
      if (!probe) continue;
      for (const [element, x] of [
        [probe.start, -definition.definition.length / 2],
        [probe.end, definition.definition.length / 2],
      ] as const) {
        const endpoint = new THREE.Vector3(x, 0, 0)
          .applyQuaternion(mesh.quaternion)
          .add(mesh.position)
          .project(camera);
        element.style.left = `${(endpoint.x * 0.5 + 0.5) * host.clientWidth}px`;
        element.style.top = `${(-endpoint.y * 0.5 + 0.5) * host.clientHeight}px`;
      }
    }
    for (const [id, length] of localStripLengths) {
      const mesh = localFixtures.get(id)?.mesh;
      if (!mesh) continue;
      const stripMarker = stripMarkers[stripFixtures.findIndex((candidate) => candidate.id === id)];
      if (stripMarker) {
        const position = mesh.position.clone().project(camera);
        stripMarker.style.left = `${(position.x * 0.5 + 0.5) * host.clientWidth}px`;
        stripMarker.style.top = `${(-position.y * 0.5 + 0.5) * host.clientHeight}px`;
      }
      for (const [element, x] of [
        [document.querySelector<HTMLElement>(`[data-strip-probe="${id}-start"]`), -length / 2],
        [document.querySelector<HTMLElement>(`[data-strip-probe="${id}-end"]`), length / 2],
      ] as const) {
        if (!element) continue;
        const endpoint = new THREE.Vector3(x, 0, 0)
          .applyQuaternion(mesh.quaternion)
          .add(mesh.position)
          .project(camera);
        element.style.left = `${(endpoint.x * 0.5 + 0.5) * host.clientWidth}px`;
        element.style.top = `${(-endpoint.y * 0.5 + 0.5) * host.clientHeight}px`;
      }
    }
  };
  renderer.setAnimationLoop(() => {
    controls.update();
    // One gate over every screen-space mark: zero DOM writes until a camera,
    // placement, drag, swap, resize, or layout signal re-opens it. Trust
    // labels bypass this gate.
    if (markGate.takeRewrite()) writeMarkPositions();
    renderer.render(scene, camera);
  });
  return {
    cubes: fixtures,
    strips,
    fixtures: editableFixtures,
    selectFixtures(ids) {
      selectedFixture =
        ids.length === 1
          ? (editableFixtures.find((candidate) => candidate.id === ids[0]) ?? null)
          : null;
      if (editable && selectedFixture) gizmo.attach(selectedFixture.mesh);
      else gizmo.detach();
    },
    setRenderMode(mode) {
      renderMode = mode;
      // Cones leave the intensity map at once; pools render unchanged there.
      let cones = 0;
      for (const entry of localBeams.values()) {
        entry.cone.visible = entry.lit && mode === "live";
        if (entry.cone.visible) cones += 1;
      }
      host.dataset.fixtureCones = String(cones);
    },
    setEditable(nextEditable) {
      editable = nextEditable;
      dragStart = null;
      controls.enabled = true;
      if (editable && selectedFixture) gizmo.attach(selectedFixture.mesh);
      else gizmo.detach();
    },
    setGizmoMode(mode) {
      if (editable) gizmo.setMode(mode);
    },
    setSnap(step) {
      if (!editable) return;
      snapStep = step;
      gizmo.translationSnap = step;
      gizmo.rotationSnap = step === null ? null : THREE.MathUtils.degToRad(15);
    },
    cameraView() {
      return {
        position: camera.position.toArray(),
        target: controls.target.toArray(),
      };
    },
    setCameraView(view) {
      camera.position.fromArray(view.position);
      controls.target.fromArray(view.target);
      controls.update();
    },
    frameContentBox(points) {
      if (points.length === 0) return;
      const min = [...points[0]!] as [number, number, number];
      const max = [...points[0]!] as [number, number, number];
      for (const point of points)
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis]!, point[axis]!);
          max[axis] = Math.max(max[axis]!, point[axis]!);
        }
      const center = new THREE.Vector3(
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      );
      const span = new THREE.Vector3(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
      const fitHeight = Math.max(span.y, span.x / camera.aspect, span.z / camera.aspect, 1);
      const distance = Math.min(
        20,
        Math.max(5, (fitHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.25),
      );
      const direction = camera.position.clone().sub(controls.target);
      if (direction.lengthSq() === 0) direction.set(1, 0.8, 1);
      direction.normalize();
      controls.target.copy(center);
      camera.position.copy(center).addScaledVector(direction, distance);
      controls.update();
    },
    setSceneFixtureLevels(levels) {
      for (const [id, material] of localMaterials) {
        if (!levels.has(id)) continue;
        const level = (levels.get(id) ?? 0) / 255;
        material.emissive.setRGB(level, level, level);
        material.emissiveIntensity = level;
      }
    },
    setSceneFixturePixels(pixels) {
      for (const [id, texels] of localTexels) {
        const source = pixels.get(id);
        if (!source) continue;
        if (copyRgbBytesIfChanged(texels.pixels, texels.count, source))
          texels.texture.needsUpdate = true;
      }
    },
    setSceneFixtureStates,
    setSceneFixtures,
    defineStageMesh,
    showGdtfFixture,
    setAtmosphere(density, lengthM) {
      beamDensity = density;
      if (lengthM !== beamLengthM) {
        beamLengthM = lengthM;
        // Geometry carries the length; rebuild cached cones at the new extent.
        for (const entry of localBeams.values()) {
          entry.cone.geometry.dispose();
          entry.cone.geometry = coneGeometry(entry.angle, entry.radius, beamLengthM);
        }
      }
    },
    capture(maxEdge = 1280, quality = 0.8) {
      return new Promise<CaptureResult>((resolve, reject) => {
        // No preserveDrawingBuffer tax: render and read back in the same frame.
        requestAnimationFrame(() => {
          renderer.render(scene, camera);
          const source = renderer.domElement;
          const scale =
            Math.max(source.width, source.height) > maxEdge
              ? maxEdge / Math.max(source.width, source.height)
              : 1;
          const width = Math.max(1, Math.round(source.width * scale));
          const height = Math.max(1, Math.round(source.height * scale));
          const done = (blob: Blob | null) => {
            if (!blob) {
              reject(new Error("capture produced no bytes"));
              return;
            }
            blob.arrayBuffer().then(
              (buffer) =>
                resolve({ bytes: new Uint8Array(buffer), width, height, downscaled: scale < 1 }),
              () => reject(new Error("capture could not be read")),
            );
          };
          if (scale >= 1) {
            source.toBlob(done, "image/jpeg", quality);
            return;
          }
          const copy = document.createElement("canvas");
          copy.width = width;
          copy.height = height;
          const context = copy.getContext("2d");
          if (!context) {
            reject(new Error("capture could not downscale"));
            return;
          }
          context.drawImage(source, 0, 0, width, height);
          copy.toBlob(done, "image/jpeg", quality);
        });
      });
    },
  };
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((entry) => {
    if (!("geometry" in entry) || !(entry.geometry instanceof THREE.BufferGeometry)) return;
    entry.geometry.dispose();
    if (!("material" in entry)) return;
    const materials = entry.material;
    for (const material of Array.isArray(materials) ? materials : [materials])
      if (material instanceof THREE.Material) material.dispose();
  });
}
/** Volumetric cone: apex at the fixture origin, opening along local +Z. */
function coneGeometry(angleDeg: number, radiusM = 0, height = 4): THREE.ConeGeometry {
  const half = THREE.MathUtils.degToRad(angleDeg) / 2;
  const slope = Math.tan(half);
  const radius = Math.max(0.01, radiusM + slope * height);
  const geometry = new THREE.ConeGeometry(radius, height, 24, 1, true);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, height / 2);
  if (radiusM > 0 && slope > 1e-4) {
    // BeamRadius: the cone surface passes through the lens radius at the
    // fixture origin instead of starting at a point.
    geometry.translate(0, 0, -radiusM / slope);
  }
  return geometry;
}

/** Shared unit pool disc, baked flat on y=0: per-mesh scale carries the ellipse. */
const poolGeometry: THREE.CircleGeometry = (() => {
  const disc = new THREE.CircleGeometry(1, 40);
  disc.rotateX(-Math.PI / 2);
  return disc;
})();

function beamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(0, 0, 0) },
      uLevel: { value: 0 },
      uDensity: { value: SCENE_DENSITY },
      uEdge: { value: 0.35 },
      uLen: { value: SCENE_BEAM_LENGTH_M },
      uLenK: { value: BEAM_LENGTH_FALLOFF_K },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function poolMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: POOL_VERT,
    fragmentShader: POOL_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(0, 0, 0) },
      uLevel: { value: 0 },
      uEdge: { value: 0.35 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function setBeamUniforms(
  material: THREE.ShaderMaterial,
  state: FixtureState,
  edge: number,
  density: number,
  lengthM: number,
): void {
  (material.uniforms["uColor"] as THREE.IUniform<THREE.Color>).value.setRGB(
    state.color[0] ?? 0,
    state.color[1] ?? 0,
    state.color[2] ?? 0,
  );
  (material.uniforms["uLevel"] as THREE.IUniform<number>).value = state.level;
  (material.uniforms["uDensity"] as THREE.IUniform<number>).value = density;
  (material.uniforms["uEdge"] as THREE.IUniform<number>).value = edge;
  (material.uniforms["uLen"] as THREE.IUniform<number>).value = lengthM;
}

function setPoolUniforms(material: THREE.ShaderMaterial, state: FixtureState, edge: number): void {
  (material.uniforms["uColor"] as THREE.IUniform<THREE.Color>).value.setRGB(
    state.color[0] ?? 0,
    state.color[1] ?? 0,
    state.color[2] ?? 0,
  );
  (material.uniforms["uLevel"] as THREE.IUniform<number>).value = state.level;
  (material.uniforms["uEdge"] as THREE.IUniform<number>).value = edge;
}

/** BÜTEC 2x1 m deck: alu frame + wood top on four legs, origin at the floor. */
function buildDeckMesh(): THREE.Group {
  const group = new THREE.Group();
  const alu = new THREE.MeshStandardMaterial({ color: 0x8a8f94, metalness: 0.6, roughness: 0.45 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a7b4f, roughness: 0.85 });
  const legGeometry = new THREE.BoxGeometry(0.05, deckLegH, 0.05);
  for (const [x, z] of [
    [-0.4, -0.9],
    [0.4, -0.9],
    [-0.4, 0.9],
    [0.4, 0.9],
  ] as const) {
    const leg = new THREE.Mesh(legGeometry, alu);
    leg.position.set(x, deckLegH / 2, z);
    group.add(leg);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1, deckFrameH, 2), alu);
  frame.position.y = deckLegH + deckFrameH / 2;
  group.add(frame);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1, deckTopH, 2), wood);
  top.position.y = deckLegH + deckFrameH + deckTopH / 2;
  group.add(top);
  return group;
}

function localFixtureMesh(
  definition: BhsDefinition | undefined,
  definitionId: string,
): THREE.Object3D {
  if (definitionId === stageDeckDefinitionId) return buildDeckMesh();
  const material = new THREE.MeshStandardMaterial({
    color: 0x86817c,
    metalness: 0.08,
    roughness: 0.7,
  });
  if (definition?.kind === "strip") {
    const length = (definition.pixels * definition.pitchMm) / 1000;
    if (definition.primitive === "Cylinder") {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 20), material);
      mesh.geometry.rotateZ(Math.PI / 2);
      mesh.scale.set(length, 0.05, 0.05);
      return mesh;
    }
    if (definition.primitive === "Sphere") {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1), material);
      mesh.scale.set(length / 2, 0.025, 0.025);
      return mesh;
    }
    return new THREE.Mesh(new THREE.BoxGeometry(length, 0.05, 0.05), material);
  }
  if (definition?.kind === "primitive") {
    if (definition.primitive === "Cylinder") {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 20), material);
      mesh.scale.set(definition.width / 2, definition.height, definition.depth / 2);
      return mesh;
    }
    if (definition.primitive === "Sphere") {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1), material);
      mesh.scale.set(definition.width / 2, definition.height / 2, definition.depth / 2);
      return mesh;
    }
    return new THREE.Mesh(
      new THREE.BoxGeometry(definition.width, definition.height, definition.depth),
      material,
    );
  }
  const resolved = resolvedReferenceDefinition(definitionId);
  if (resolved)
    return new THREE.Mesh(
      new THREE.BoxGeometry(resolved.length, resolved.height, resolved.width),
      material,
    );
  return new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1), material);
}

function placementFor(object: THREE.Object3D): FixturePlacement {
  return {
    position: object.position.toArray(),
    rotation: [
      THREE.MathUtils.radToDeg(object.rotation.x),
      THREE.MathUtils.radToDeg(object.rotation.y),
      THREE.MathUtils.radToDeg(object.rotation.z),
    ],
  };
}
