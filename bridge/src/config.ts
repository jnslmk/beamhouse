import { resolve } from "node:path";
import type { BridgeConfig } from "./server.ts";

export function configFromEnvironment(
  environment: NodeJS.ProcessEnv,
  argv: readonly string[] = [],
  baseDirectory = import.meta.dirname,
): BridgeConfig {
  return {
    hostname: environment.BEAMHOUSE_HOST ?? "0.0.0.0",
    httpPort: numberFrom(environment.BEAMHOUSE_PORT, 7070),
    sacnPort: numberFrom(environment.BEAMHOUSE_SACN_PORT, 5568),
    artnetPort: numberFrom(environment.BEAMHOUSE_ARTNET_PORT, 6454),
    appDirectory: environment.BEAMHOUSE_APP_DIR ?? resolve(baseDirectory, "../../app/dist"),
    watchDirectory: environment.BEAMHOUSE_WATCH_DIR ?? resolve(baseDirectory, "../../shows"),
    sacnStaleMs: numberFrom(environment.BEAMHOUSE_SACN_STALE_MS, 2_500),
    artnetStaleMs: numberFrom(environment.BEAMHOUSE_ARTNET_STALE_MS, 6_000),
    // ponytail: one flag, no surface — recording is a tee, not a job (ADR-0040 §5).
    recordPath: recordPathFrom(argv) ?? environment.BEAMHOUSE_RECORD ?? null,
  };
}

function recordPathFrom(argv: readonly string[]): string | null {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--record") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--record needs a file path");
      return value;
    }
  }
  return null;
}

function numberFrom(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid numeric environment value: ${value}`);
  }
  return parsed;
}
