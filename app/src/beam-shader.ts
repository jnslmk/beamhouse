// Volumetric beam + ground-pool terms (ADR-0013, ADR-0036).
//
// One closed-form single-scattering term, isotropic phase, no extinction:
// scattering scales by resolved Dimmer x LinearRGB alone, never by declared
// LuminousFlux. Fixed cost per fragment: one atan, no loops, no samplers,
// no second sample of density(p) — volumetric shadows, occlusion and glare
// stay on the far side of that fence. Beams pass through objects unbroken;
// the y=0 pool is a separate additive term, not the cone's end.

/** Edge width as a fraction of the cone half-angle. 0 is a hard edge. */
export function edgeWidthFraction(
  beamDeg: number,
  fieldDeg: number | null,
  softEdge: boolean,
): number {
  // FieldAngle shapes the edge only where the two differ (ADR-0013.9).
  if (fieldDeg !== null && Math.abs(fieldDeg - beamDeg) > 0.5 && beamDeg > 0)
    return Math.min(0.9, Math.abs(fieldDeg - beamDeg) / beamDeg);
  // Degeneracy: the BeamType soft/hard edge where the angles agree.
  return softEdge ? 0.35 : 0;
}

/** Pool radius: BeamAngle (full) against throw, plus the lens radius. */
export function poolRadiusM(beamDeg: number, throwM: number, radiusM: number): number {
  return Math.max(0.01, Math.tan(((beamDeg / 2) * Math.PI) / 180) * throwM + radiusM);
}

/** Distance along the beam axis to y=0; null when aimed at/above horizon. */
export function beamThrowM(originY: number, dirY: number): number | null {
  if (!(dirY < -1e-6)) return null;
  return originY / -dirY;
}

/** Oblique-incidence stretch of the pool ellipse, bounded so grazing beams stay sane. */
export function poolStretch(dirY: number): number {
  return Math.min(2.5, 1 / Math.max(0.4, -dirY));
}

/** Soft length falloff: bright at the source, gone at the scene beam length. */
export const BEAM_LENGTH_FALLOFF_K = 1.2;

export const BEAM_VERT = /* glsl */ `
varying float vAxis;
varying vec3 vNormalW;
varying vec3 vViewW;
void main() {
  vAxis = position.z;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewW = cameraPosition - world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const BEAM_FRAG = /* glsl */ `
varying float vAxis;
varying vec3 vNormalW;
varying vec3 vViewW;
uniform vec3 uColor;
uniform float uLevel;
uniform float uDensity;
uniform float uEdge;
uniform float uLen;
uniform float uLenK;
// density(p): one sample, homogeneous medium. The deferred tier begins at
// the second sample (ADR-0013.10); this term never takes one.
float density(vec3 p) {
  return uDensity;
}
void main() {
  float t = clamp(vAxis / uLen, 0.0, 1.0);
  float axial = 1.0 - atan(t * t * t * uLenK) / atan(uLenK);
  float facing = abs(dot(normalize(vNormalW), normalize(vViewW)));
  float edge = pow(facing, mix(9.0, 0.6, clamp(uEdge, 0.0, 1.0)));
  float scatter = density(vec3(0.0)) * axial * edge;
  gl_FragColor = vec4(uColor * (scatter * uLevel), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const POOL_VERT = /* glsl */ `
varying float vR;
void main() {
  // Pool geometry is baked flat (XZ plane, unit radius), so the local
  // position already carries the ground-plane radius.
  vR = length(position.xz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const POOL_FRAG = /* glsl */ `
varying float vR;
uniform vec3 uColor;
uniform float uLevel;
uniform float uEdge;
void main() {
  float edge = 1.0 - smoothstep(1.0 - clamp(uEdge, 0.02, 1.0), 1.0, clamp(vR, 0.0, 1.0));
  gl_FragColor = vec4(uColor * (edge * uLevel), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
