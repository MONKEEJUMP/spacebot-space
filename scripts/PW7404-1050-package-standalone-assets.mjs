import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const standaloneRoot = path.join(repoRoot, ".next", "standalone");

function copyDirectory(source, destination) {
  if (!fs.existsSync(source)) {
    throw new Error(`Standalone asset source is missing: ${source}`);
  }

  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
}

if (!fs.existsSync(path.join(standaloneRoot, "server.js"))) {
  throw new Error("Next standalone server is missing; run next build first");
}

copyDirectory(
  path.join(repoRoot, ".next", "static"),
  path.join(standaloneRoot, ".next", "static"),
);
copyDirectory(
  path.join(repoRoot, "public"),
  path.join(standaloneRoot, "public"),
);

console.log("PW7404-1050 standalone static and public assets packaged");
