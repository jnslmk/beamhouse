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

  interface AuditedBunUdpPrototype {
    send(this: object, ...args: unknown[]): boolean;
    sendMany(this: object, packets: readonly unknown[]): number;
  }

  const auditSocket = await Bun.udpSocket({});
  const udpPrototype = Object.getPrototypeOf(auditSocket) as AuditedBunUdpPrototype;
  // Both methods are reapplied with the live native UDP socket receiver.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalNativeSend = udpPrototype.send;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalNativeSendMany = udpPrototype.sendMany;
  udpPrototype.send = function auditedNativeSend(this: object, ...args: unknown[]) {
    appendFileSync(auditPath, `${Date.now()} send\n`);
    return originalNativeSend.apply(this, args);
  };
  udpPrototype.sendMany = function auditedNativeSendMany(
    this: object,
    packets: readonly unknown[],
  ) {
    appendFileSync(auditPath, `${Date.now()} sendMany\n`);
    return originalNativeSendMany.apply(this, [packets]);
  };
  auditSocket.close();
}
