import { createRequire } from "node:module";
import type { BrowserWindow as BrowserWindowType } from "electron";
import type * as Electron from "electron";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { configFromEnvironment } from "../bridge/src/config.ts";
import { startBridge, type BridgeConfig, type RunningBridge } from "../bridge/src/server.ts";
import { sceneFromArgv } from "./scene-arg.ts";

const electron = createRequire(import.meta.url)("electron") as typeof Electron;
const { app, BrowserWindow, shell } = electron;
const hasLock = app.requestSingleInstanceLock();
let bridge: RunningBridge | null = null;
let window: BrowserWindowType | null = null;

// env → packaged userData → repo-relative shows directory. Shared by the first
// window and by second-instance launches handing over a scene file.
function watchDirectoryFrom(config: BridgeConfig): string {
  return (
    process.env.BEAMHOUSE_WATCH_DIR ??
    (app.isPackaged ? resolve(app.getPath("userData"), "shows") : config.watchDirectory)
  );
}

function windowUrl(running: RunningBridge, scene: string | null): string {
  const url = new URL(running.url);
  // 0.0.0.0 is the LAN listen address, not an address to navigate.
  if (url.hostname === "0.0.0.0") url.hostname = "127.0.0.1";
  if (scene) url.searchParams.set("scene", scene);
  return url.href;
}

async function createWindow(): Promise<void> {
  const config = configFromEnvironment(process.env, [], app.getAppPath());
  const appRoot = app.isPackaged ? app.getAppPath() : resolve(app.getAppPath(), "../..");
  const appDirectory = resolve(appRoot, "app/dist");
  const watchDirectory = watchDirectoryFrom(config);
  await mkdir(watchDirectory, { recursive: true });
  // A missing or unreadable .bhs argument must not abort the launch — the app
  // still opens, just without the scene (mirrors the second-instance path).
  let scene: string | null = null;
  try {
    scene = await sceneFromArgv(process.argv, watchDirectory);
  } catch (error) {
    console.error("Beamhouse could not open the passed scene:", error);
  }
  bridge = await startBridge({ ...config, appDirectory, watchDirectory });

  window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: "Beamhouse",
    backgroundColor: "#11100f",
    show: false,
    icon: resolve(appDirectory, "icon-512.png"),
  });
  window.once("ready-to-show", () => window?.show());
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    void shell.openExternal(target);
    return { action: "deny" };
  });
  await window.loadURL(windowUrl(bridge, scene));
}

async function stopBridge(): Promise<void> {
  const running = bridge;
  bridge = null;
  if (running) await running.stop();
}

if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv, workingDirectory) => {
    void openHandedOffScene(argv, workingDirectory);
  });

  void app
    .whenReady()
    .then(async () => {
      await createWindow();
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) void createWindow();
      });
    })
    .catch((error: unknown) => {
      console.error("Beamhouse failed to start:", error);
      app.quit();
    });

  app.on("window-all-closed", () => app.quit());
}

// A second launch (e.g. xdg-open on a .bhs file) hands its argv here. The page
// only reads ?scene= at load, so hand-off is a full navigation to the new URL.
// Restore/focus happens either way; a dropped or failed scene must not stop it.
async function openHandedOffScene(
  argv: readonly string[],
  workingDirectory: string,
): Promise<void> {
  try {
    if (bridge && window) {
      const config = configFromEnvironment(process.env, [], app.getAppPath());
      const scene = await sceneFromArgv(argv, watchDirectoryFrom(config), {
        resolveBase: workingDirectory,
      });
      if (scene) await window.loadURL(windowUrl(bridge, scene));
    }
  } catch (error) {
    console.error("Beamhouse could not open the passed scene:", error);
  } finally {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  }
}

app.on("will-quit", (event) => {
  if (!bridge) return;
  event.preventDefault();
  void stopBridge()
    .catch((error: unknown) => console.error("Beamhouse failed to stop:", error))
    .finally(() => app.quit());
});
