#!/usr/bin/env node
/* global __dirname, console, process, require */
// npm-global launcher: start the desktop app and return the shell immediately.
const { spawn } = require("node:child_process");
const { closeSync, openSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// The app detaches and outlives this shell, so its output cannot come back here:
// it goes to a log in the OS temp directory instead of being discarded. A bridge
// bind failure is the one line this file exists to preserve. main.cjs is handed
// the same path so the error dialog can name it.
const logPath = process.env.BEAMHOUSE_LOG ?? path.join(os.tmpdir(), "beamhouse.log");
const log = openSync(logPath, "a");

// CLI arguments (e.g. a .bhs show file to open) ride along after the main entry.
const args = [path.join(__dirname, "dist", "main.cjs"), ...process.argv.slice(2)];

const child = spawn(require("electron"), args, {
  stdio: ["ignore", log, log],
  detached: true,
  windowsHide: true,
  env: { ...process.env, BEAMHOUSE_LOG: logPath },
});
child.on("error", (error) => {
  console.error(`Beamhouse could not start: ${error.message} (details: ${logPath})`);
  process.exitCode = 1;
});
closeSync(log);
child.unref();
