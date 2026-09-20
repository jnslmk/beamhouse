import { pathToFileURL } from "node:url";
import { configFromEnvironment } from "./config.ts";
import { startBridge } from "./server.ts";

export { configFromEnvironment } from "./config.ts";

// Runtime-agnostic entry check: `import.meta.main` is a Bun-ism, this comparison
// holds under bun and plain node alike (`node bridge/src/main.ts` is the node entry).
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const bridge = await startBridge(configFromEnvironment(process.env, process.argv.slice(2)));
  console.log(`Beamhouse listening on ${bridge.url}`);

  const stop = async () => {
    await bridge.stop();
    process.exit(0);
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
}
