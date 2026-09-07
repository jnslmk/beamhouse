import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { resolvedReferenceDefinition, type LinearRGB, type StripFixture } from "./reference-rig.ts";
import { samePlacement, type BhsDefinition, type LocalFixture, type Placement } from "./scene.ts";

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
  stripProbeMarkers: readonly StripProbeMarkers[] = [],
  onTransform?: (id: number, placement: FixturePlacement) => void,
  onSelect?: (id: number, additive: boolean) => void,
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

  const colors = [0xffa52f, 0x49a4ff, 0xf05baa];
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
  const strips = stripFixtures.map((fixture, index): TextureStrip => {
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
        for (let index = 0; index < fixture.pixels; index += 1) {
          pixels.set(nextPixels.subarray(index * 3, index * 3 + 3), index * 4);
          pixels[index * 4 + 3] = 1;
        }
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
  const localMaterials = new Map<number, THREE.MeshStandardMaterial>();
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
    for (const fixture of localFixtures.values()) {
      scene.remove(fixture.mesh);
      disposeObject(fixture.mesh);
      localMaterials.delete(fixture.id);
      const index = editableFixtures.indexOf(fixture);
      if (index >= 0) editableFixtures.splice(index, 1);
    }
    localFixtures.clear();
    for (const fixture of nextFixtures) {
      const mesh = localFixtureMesh(definitions[fixture.definition], fixture.definition);
      mesh.position.set(0, 0.5, 0);
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
        },
        placement() {
          return placementFor(mesh);
        },
      };
      localFixtures.set(fixture.id, rendered);
      if (mesh.material instanceof THREE.MeshStandardMaterial)
        localMaterials.set(fixture.id, mesh.material);
      editableFixtures.push(rendered);
    }
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
  };
  new ResizeObserver(resize).observe(host);
  resize();

  renderer.setAnimationLoop(() => {
    controls.update();
    for (const fixture of fixtures) {
      const position = fixture.mesh.position.clone().project(camera);
      fixture.marker.style.left = `${(position.x * 0.5 + 0.5) * host.clientWidth}px`;
      fixture.marker.style.top = `${(-position.y * 0.5 + 0.5) * host.clientHeight}px`;
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
        const level = (levels.get(id) ?? 0) / 255;
        material.emissive.setRGB(level, level, level);
        material.emissiveIntensity = level;
      }
    },
    setSceneFixtures,
    showGdtfFixture,
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

function localFixtureMesh(definition: BhsDefinition | undefined, definitionId: string): THREE.Mesh {
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
