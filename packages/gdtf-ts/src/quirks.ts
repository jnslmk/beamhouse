// Quirks live here as plain data, never as resolver branches (ADR-0004 §1).
// A consumer can inspect, extend, or disable them; the resolver stays mechanical.

export interface GdtfQuirk {
  id: string;
  applies: string;
  symptom: string;
  handling: string;
}

export const GDTF_QUIRKS: readonly GdtfQuirk[] = [
  {
    id: "model-file-extensionless",
    applies: "any Model with a non-empty File attribute",
    symptom: "File carries a stem (led_profiles.previz_body), not a path.",
    handling: "Only models/gltf/<stem>.glb is read; .3ds entries are ignored.",
  },
  {
    id: "primitive-proxy-fallback",
    applies: "PrimitiveType outside Cube/Cylinder/Sphere (Base1_1, Yoke, Head, Conventional, …)",
    symptom: "No mesh-less viewer primitive matches the named part.",
    handling: "Render the PROXY_PRIMITIVE entry; the mesh path is unaffected.",
  },
  {
    id: "revision-hint-not-identity",
    applies: "every definition (ADR-0030 §1)",
    symptom: "One FixtureTypeID spans many revisions; the id alone mis-addresses.",
    handling: "revisionHint carries the last Revision Text for reconciliation only.",
  },
  {
    id: "reference-template-position",
    applies: "every GeometryReference expansion",
    symptom: "The referenced template carries its own Position alongside the reference.",
    handling: "The reference Position places the instance; the template Position is ignored.",
  },
  {
    id: "dmx-fraction-format",
    applies: "ChannelFunction DMXFrom/DMXTo/Default/DMXBreak values",
    symptom: "Values serialize as byte/bit fractions (0/1, 32768/2).",
    handling: "Parsed as written; no normalization is applied.",
  },
];

/** Mesh-less viewer primitive per GDTF PrimitiveType; unknown entries fall back to Cube. */
export const PROXY_PRIMITIVE: Record<string, "Cube" | "Cylinder" | "Sphere"> = {
  Cube: "Cube",
  Cylinder: "Cylinder",
  Sphere: "Sphere",
};

export function proxyPrimitive(primitiveType: string): "Cube" | "Cylinder" | "Sphere" {
  return PROXY_PRIMITIVE[primitiveType] ?? "Cube";
}
