import { createRequire } from "node:module";
import type { BrowserWindow as BrowserWindowType } from "electron";
import type * as Electron from "electron";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { configFromEnvironment } from "../bridge/src/config.ts";
import { startBridge, type RunningBridge } from "../bridge/src/server.ts";

const electron = createRequire(import.meta.url)("electron") as typeof Electron;
const { app, BrowserWindow, shell } = electron;
const hasLock = app.requestSingleInstanceLock();
let bridge: RunningBridge | null = null;
let window: BrowserWindowType | null = null;

async function createWindow(): Promise<void> {
  const config = configFromEnvironment(process.env, [], app.getAppPath());
  const appRoot = app.isPackaged ? app.getAppPath() : resolve(app.getAppPath(), "../..");
  const appDirectory = resolve(appRoot, "app/dist");
  const watchDirectory =
    process.env.BEAMHOUSE_WATCH_DIR ??
    (app.isPackaged ? resolve(app.getPath("userData"), "shows") : config.watchDirectory);
  await mkdir(watchDirectory, { recursive: true });
  bridge = await startBridge({ ...config, appDirectory, watchDirectory });

  // 0.0.0.0 is the LAN listen address, not an address to navigate.
  const url = new URL(bridge.url);
  if (url.hostname === "0.0.0.0") url.hostname = "127.0.0.1";

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
  await window.loadURL(url.href);
}

async function stopBridge(): Promise<void> {
  const running = bridge;
  bridge = null;
  if (running) await running.stop();
}

if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
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

app.on("will-quit", (event) => {
  if (!bridge) return;
  event.preventDefault();
  void stopBridge()
    .catch((error: unknown) => console.error("Beamhouse failed to stop:", error))
    .finally(() => app.quit());
});
