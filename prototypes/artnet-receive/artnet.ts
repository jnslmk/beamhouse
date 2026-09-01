// Hand-rolled ArtDmx receive — the whole thing, to see what Q3 actually costs.
const ID = Buffer.from("Art-Net\0", "ascii");
export type ArtDmx = { portAddress: number; sequence: number; physical: number; slots: Uint8Array };

export function parseArtDmx(b: Uint8Array): ArtDmx | null {
  if (b.length < 18) return null;
  for (let i = 0; i < 8; i++) if (b[i] !== ID[i]) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint16(8, true) !== 0x5000) return null;      // OpDmx, little-endian
  if (dv.getUint16(10, false) < 14) return null;          // ProtVer, big-endian
  const sequence = b[12], physical = b[13];
  const subUni = b[14], net = b[15];                      // SubUni then Net
  const length = dv.getUint16(16, false);                 // big-endian
  if (length < 2 || length > 512 || b.length < 18 + length) return null;
  return { portAddress: (net << 8) | subUni, sequence, physical, slots: b.subarray(18, 18 + length) };
}

export function buildArtDmx(portAddress: number, sequence: number, slots: Uint8Array): Uint8Array {
  const out = new Uint8Array(18 + slots.length);
  out.set(ID, 0);
  const dv = new DataView(out.buffer);
  dv.setUint16(8, 0x5000, true); dv.setUint16(10, 14, false);
  out[12] = sequence; out[13] = 0;
  out[14] = portAddress & 0xff; out[15] = (portAddress >> 8) & 0x7f;
  dv.setUint16(16, slots.length, false);
  out.set(slots, 18);
  return out;
}
