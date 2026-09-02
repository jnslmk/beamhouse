import { resolve } from "node:path";
import { startBridge, type BridgeConfig } from "./server.ts";

export function configFromEnvironment(environment: NodeJS.ProcessEnv): BridgeConfig {
  return {
    hostname: environment.BEAMHOUSE_HOST ?? "0.0.0.0",
    httpPort: numberFrom(environment.BEAMHOUSE_PORT, 7070),
    sacnPort: numberFrom(environment.BEAMHOUSE_SACN_PORT, 5568),
    artnetPort: numberFrom(environment.BEAMHOUSE_ARTNET_PORT, 6454),
    appDirectory: environment.BEAMHOUSE_APP_DIR ?? resolve(import.meta.dir, "../../app/dist"),
    sacnStaleMs: numberFrom(environment.BEAMHOUSE_SACN_STALE_MS, 2_500),
    artnetStaleMs: numberFrom(environment.BEAMHOUSE_ARTNET_STALE_MS, 6_000),
  };
}

if (import.meta.main) {
  const bridge = await startBridge(configFromEnvironment(process.env));
  console.log(`Beamhouse listening on ${bridge.url}`);

  const stop = async () => {
    await bridge.stop();
    process.exit(0);
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
}

function numberFrom(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid numeric environment value: ${value}`);
  }
  return parsed;
}
