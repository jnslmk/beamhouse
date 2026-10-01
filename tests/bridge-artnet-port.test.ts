import { describe, expect, test } from "bun:test";
import { spawn, type ChildProcess } from "node:child_process";
import { createSocket } from "node:dgram";
import { once } from "node:events";
import { resolve } from "node:path";
import { configFromEnvironment } from "../bridge/src/config.ts";

const repository = resolve(import.meta.dir, "..");

describe("Art-Net port separation (ADR-0002)", () => {
  test("the default is 6455 with empty env, leaving gled2's 6454 alone", () => {
    // The packaged desktop app and `node bridge/src/main.ts` load no bridge/.env,
    // so only this default keeps them off gled2's hardcoded input port.
    expect(configFromEnvironment({}, [], repository).artnetPort).toBe(6455);
  });

  test("BEAMHOUSE_ARTNET_PORT still overrides it", () => {
    const config = configFromEnvironment({ BEAMHOUSE_ARTNET_PORT: "16454" }, [], repository);
    expect(config.artnetPort).toBe(16454);
  });
});

/** Bun.Subprocess exposed `.exited`; node children answer through the exit event. */
function childExit(child: ChildProcess): Promise<number | null> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(child.exitCode);
  return once(child, "exit").then(() => child.exitCode);
}

describe("bridge startup failure", () => {
  test("the terminal entry names the bind failure and exits non-zero", async () => {
    // Bound without reuseAddr, which is how gled2 holds 6454: Linux only shares a
    // UDP port when every socket asks for it, so this is the real collision.
    const holder = createSocket("udp4");
    await new Promise<void>((done) => holder.bind(0, "127.0.0.1", done));
    const { port } = holder.address();
    try {
      const child = spawn("node", ["bridge/src/main.ts"], {
        cwd: repository,
        env: {
          ...process.env,
          BEAMHOUSE_HOST: "127.0.0.1",
          BEAMHOUSE_PORT: "0",
          BEAMHOUSE_SACN_PORT: "0",
          BEAMHOUSE_ARTNET_PORT: String(port),
        },
        stdio: "pipe",
      });
      const stderr = child.stderr;
      stderr.setEncoding("utf8");
      let reported = "";
      stderr.on("data", (chunk: string) => (reported += chunk));
      expect(await childExit(child)).toBe(1);
      expect(reported).toContain("Beamhouse could not start");
      expect(reported).toContain("EADDRINUSE");
    } finally {
      await new Promise<void>((done) => holder.close(() => done()));
    }
  });
});
