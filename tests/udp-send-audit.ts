import { appendFileSync } from "node:fs";
import { Socket } from "node:dgram";

const auditPath = process.env.BEAMHOUSE_UDP_AUDIT;
if (auditPath) {
  // The original method is reapplied with the live Socket receiver below.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalSend = Socket.prototype.send;
  Socket.prototype.send = function auditedSend(this: Socket, ...args: Parameters<Socket["send"]>) {
    appendFileSync(auditPath, `${Date.now()} send\n`);
    return originalSend.apply(this, args);
  } as Socket["send"];
}
