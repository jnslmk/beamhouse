#!/usr/bin/env bun
import { configFromEnvironment } from "./main.ts";
import { startBridge } from "./server.ts";

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const bridge = await startBridge(configFromEnvironment(process.env, argv));
  console.log(`Beamhouse listening on ${bridge.url}`);

  if (!argv.includes("--no-open") && !process.env.BEAMHOUSE_NO_OPEN) openAppWindow(bridge.url);

  const stop = async () => {
    await bridge.stop();
    process.exit(0);
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
}

function openAppWindow(url: string): void {
  // ponytail: first browser on PATH wins; app-mode flags are identical across the chromium family.
  const browserBin = [
    "chromium",
    "google-chrome-stable",
    "google-chrome",
    "chromium-browser",
    "brave",
    "brave-browser",
    "microsoft-edge",
  ].find((bin) => Bun.which(bin));
  if (browserBin) {
    spawnIgnoring([browserBin, `--app=${url}`]);
    return;
  }
  switch (process.platform) {
    case "darwin":
      spawnIgnoring(["open", url]);
      break;
    case "win32":
      spawnIgnoring(["cmd", "/c", "start", "", url]);
      break;
    default:
      spawnIgnoring(["xdg-open", url]);
  }
}

// A missing or failing opener must never take down a serving bridge.
function spawnIgnoring(argv: string[]): void {
  try {
    Bun.spawn(argv, { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
  } catch (error) {
    console.warn(`Beamhouse could not open the UI: ${String(error)}`);
  }
}
