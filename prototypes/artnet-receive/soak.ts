import { parseArtDmx, buildArtDmx } from "./artnet.ts";
let rx = 0, bad = 0, lastSeq = -1, gaps = 0;
const recv = await Bun.udpSocket({
  port: 6454, reuseAddr: true,
  socket: { data(_s, buf) {
    const p = parseArtDmx(new Uint8Array(buf));
    if (!p) { bad++; return; }
    if (lastSeq >= 0) { const d = (p.sequence - lastSeq + 256) % 256; if (d !== 1) gaps += d - 1; }
    lastSeq = p.sequence; rx++;
    if (rx === 1) console.log("first frame: portAddress", p.portAddress, "slots", p.slots.length, "slot[0]", p.slots[0]);
  }},
});
console.log("Bun.udpSocket bound to 6454, reuseAddr ok");
const send = await Bun.udpSocket({ socket: { data(){} } });
const slots = new Uint8Array(512); slots[0] = 42;
let n = 0;
const iv = setInterval(() => {
  send.send(buildArtDmx(1, n % 256, slots), 6454, "127.0.0.1"); n++;
}, 1000 / 30);
setTimeout(() => { clearInterval(iv);
  console.log(JSON.stringify({ sent: n, received: rx, rejected: bad, sequenceGaps: gaps }));
  recv.close(); send.close(); process.exit(0); }, 10000);
