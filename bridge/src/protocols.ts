import { Packet } from "sacn";
import type { IncomingUniversePacket } from "./universe-store.ts";

const ARTNET_ID = new Uint8Array([65, 114, 116, 45, 78, 101, 116, 0]);
const ARTDMX_OPCODE = 0x5000;

export function parseArtDmx(
  bytes: Uint8Array,
  sourceAddress: string,
  receivedAt: number,
): IncomingUniversePacket | null {
  if (bytes.length < 20 || !startsWith(bytes, ARTNET_ID)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(8, true) !== ARTDMX_OPCODE || view.getUint16(10) < 14) return null;

  const payloadLength = view.getUint16(16);
  if (payloadLength < 2 || payloadLength > 512 || bytes.length < 18 + payloadLength) {
    return null;
  }

  const portAddress = (((bytes[15] ?? 0) & 0x7f) << 8) | (bytes[14] ?? 0);
  const slots = new Uint8Array(512);
  slots.set(bytes.subarray(18, 18 + payloadLength));

  return {
    transport: "artnet",
    universe: portAddress + 1,
    id: sourceAddress,
    name: null,
    priority: null,
    preview: null,
    sequence: bytes[12] ?? 0,
    slots,
    receivedAt,
    terminated: false,
  };
}

export function parseSacn(
  bytes: Uint8Array,
  sourceAddress: string,
  receivedAt: number,
): IncomingUniversePacket | null {
  try {
    if (bytes.length < 126) return null;
    const packet = new Packet(Buffer.from(bytes), sourceAddress);
    const slotCount = packet.propertyValueCount - 1;
    const payload = packet.payloadAsBuffer;
    if (
      !payload ||
      slotCount < 1 ||
      slotCount > 512 ||
      payload.length < slotCount ||
      packet.universe < 1 ||
      packet.universe > 63_999
    ) {
      return null;
    }

    const slots = new Uint8Array(512);
    slots.set(payload.subarray(0, slotCount));
    return {
      transport: "sacn",
      universe: packet.universe,
      id: packet.cid.toString("hex"),
      name: packet.sourceName,
      priority: packet.priority,
      preview: (packet.options & 0x80) !== 0,
      sequence: packet.sequence,
      slots,
      receivedAt,
      terminated: (packet.options & 0x40) !== 0,
    };
  } catch {
    return null;
  }
}

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}
