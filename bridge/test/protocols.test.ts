import { describe, expect, test } from "bun:test";
import { Packet } from "sacn";
import { parseArtDmx, parseSacn } from "../src/protocols.ts";

describe("UDP protocol boundaries", () => {
  test("maps an Art-Net Port-Address once into the normalized universe space", () => {
    const packet = artDmx({ net: 1, subUni: 0x23, sequence: 9, values: [7, 8, 9] });

    const parsed = parseArtDmx(packet, "192.0.2.10", 100);

    expect(parsed).toMatchObject({
      transport: "artnet",
      universe: 0x123 + 1,
      id: "192.0.2.10",
      sequence: 9,
      priority: null,
      preview: null,
      receivedAt: 100,
    });
    expect(parsed?.slots.slice(0, 4)).toEqual(new Uint8Array([7, 8, 9, 0]));
  });

  test("ignores non-DMX and malformed Art-Net datagrams", () => {
    const poll = artDmx({ values: [1, 2] });
    poll[8] = 0x00;
    poll[9] = 0x20;

    expect(parseArtDmx(poll, "127.0.0.1", 0)).toBeNull();
    expect(parseArtDmx(new Uint8Array([1, 2, 3]), "127.0.0.1", 0)).toBeNull();
  });

  test("preserves sACN identity, priority, preview, and termination", () => {
    const cid = Buffer.from("00112233445566778899aabbccddeeff", "hex");
    const bytes = new Packet({
      universe: 17,
      sequence: 44,
      cid,
      sourceName: "Mizer",
      priority: 123,
      useRawDmxValues: true,
      payload: { 1: 99, 512: 12 },
    }).buffer;
    bytes[112] = 0xc0;

    const parsed = parseSacn(bytes, "198.51.100.4", 200);

    expect(parsed).toMatchObject({
      transport: "sacn",
      universe: 17,
      id: "00112233445566778899aabbccddeeff",
      name: "Mizer",
      sequence: 44,
      priority: 123,
      preview: true,
      terminated: true,
      receivedAt: 200,
    });
    expect(parsed?.slots[0]).toBe(99);
    expect(parsed?.slots[511]).toBe(12);
  });
});

function artDmx({
  net = 0,
  subUni = 0,
  sequence = 0,
  values,
}: {
  net?: number;
  subUni?: number;
  sequence?: number;
  values: number[];
}): Uint8Array {
  const packet = new Uint8Array(18 + values.length);
  packet.set(new TextEncoder().encode("Art-Net\0"));
  packet[8] = 0x00;
  packet[9] = 0x50;
  packet[10] = 0;
  packet[11] = 14;
  packet[12] = sequence;
  packet[14] = subUni;
  packet[15] = net;
  packet[16] = values.length >> 8;
  packet[17] = values.length & 0xff;
  packet.set(values, 18);
  return packet;
}
