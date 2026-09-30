import { Box3, BufferAttribute, BufferGeometry, Group, Mesh, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

function isBufferGeometry(value: unknown): value is BufferGeometry {
  return value instanceof BufferGeometry;
}

/** Z-up, metre-scale CAD exports with pixel zero at the diffuser's local -X end. */
export async function loadLedProfile(
  bodyUrl: string,
  diffuserUrl: string,
): Promise<{ body: Group; diffuser: Group } | null> {
  try {
    const [bodyRoot, diffuserRoot] = await Promise.all(
      [bodyUrl, diffuserUrl].map(async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await new GLTFLoader().parseAsync(await response.arrayBuffer(), "")).scene;
      }),
    );
    if (!bodyRoot || !diffuserRoot) return null;
    const body = new Group();
    body.add(bodyRoot);
    const diffuser = new Group();
    diffuser.add(diffuserRoot);
    // Keep the complete stack (including connectors) aligned on one centre.
    for (const half of [body, diffuser]) half.rotation.x = Math.PI / 2;
    const centre = new Box3().setFromObject(body).expandByObject(diffuser).getCenter(new Vector3());
    body.position.sub(centre);
    diffuser.position.sub(centre);
    body.updateMatrixWorld(true);
    diffuser.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(diffuser);
    const span = Math.max(bounds.max.x - bounds.min.x, 1e-6);
    const point = new Vector3();
    const seen = new Set<BufferGeometry>();
    // One U range for the assembled diffuser, not a fresh pixel ramp per CAD solid.
    diffuser.traverse((entry) => {
      if (!(entry instanceof Mesh)) return;
      const candidate: unknown = entry.geometry;
      if (!isBufferGeometry(candidate)) return;
      const original: BufferGeometry = candidate;
      const geometry = seen.has(original) ? original.clone() : original;
      entry.geometry = geometry;
      seen.add(original);
      const position = geometry.getAttribute("position");
      const uv = new Float32Array(position.count * 2);
      for (let index = 0; index < position.count; index += 1) {
        point.fromBufferAttribute(position, index).applyMatrix4(entry.matrixWorld);
        uv[index * 2] = (point.x - bounds.min.x) / span;
      }
      geometry.setAttribute("uv", new BufferAttribute(uv, 2));
    });
    return { body, diffuser };
  } catch {
    return null;
  }
}
