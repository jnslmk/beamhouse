import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export interface CubeFixture {
  address: number;
  setLevel(level: number): void;
}

interface RenderedCube extends CubeFixture {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  marker: HTMLElement;
}

export function createViewport(host: HTMLElement, markers: HTMLElement[]): CubeFixture[] {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x11100f);
  scene.fog = new THREE.FogExp2(0x11100f, 0.025);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(6.8, 5.2, 8.5);
  camera.lookAt(0, 0.8, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  host.append(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0.8, 0);
  controls.minDistance = 4;
  controls.maxDistance = 18;

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
      address: index + 1,
      mesh,
      marker: markers[index] ?? document.createElement("span"),
      setLevel(level: number) {
        const normalized = level / 255;
        material.emissiveIntensity = normalized * 2.8;
        material.color.set(color).multiplyScalar(0.17 + normalized * 0.42);
      },
    };
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
    renderer.render(scene, camera);
  });
  return fixtures;
}
