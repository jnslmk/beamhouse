#!/usr/bin/env node
/* global __dirname, console, process, require */
// npm-global launcher: start the desktop app and return the shell immediately.
const { spawn } = require("node:child_process");
const path = require("node:path");

const child = spawn(require("electron"), [path.join(__dirname, "dist", "main.cjs")], {
  stdio: "ignore",
  detached: true,
  windowsHide: true,
});
child.on("error", (error) => {
  console.error(`Beamhouse could not start: ${error.message}`);
  process.exitCode = 1;
});
child.unref();
