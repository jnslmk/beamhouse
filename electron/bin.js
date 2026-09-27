#!/usr/bin/env node
/* global __dirname, console, process, require */
// npm-global launcher: start the desktop app and return the shell immediately.
const { spawn } = require("node:child_process");
const path = require("node:path");

// CLI arguments (e.g. a .bhs show file to open) ride along after the main entry.
const args = [path.join(__dirname, "dist", "main.cjs"), ...process.argv.slice(2)];

const child = spawn(require("electron"), args, {
  stdio: "ignore",
  detached: true,
  windowsHide: true,
});
child.on("error", (error) => {
  console.error(`Beamhouse could not start: ${error.message}`);
  process.exitCode = 1;
});
child.unref();
