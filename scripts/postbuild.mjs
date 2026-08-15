// Post-build script: copies HTML, CSS, and manifest into dist/
// Vite's rollup config handles JS; this handles the static assets.

import { copyFile, mkdir, readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dist = join(root, "dist");

async function cp(src, dest) {
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
  console.log(`  copied: ${dest.replace(root, "")}`);
}

async function main() {
  console.log("\nPost-build: copying static assets...");

  // manifest.json (update paths for dist layout)
  const manifestSrc = join(root, "manifest.json");
  await cp(manifestSrc, join(dist, "manifest.json"));

  // Popup HTML + CSS
  await cp(join(root, "src/popup/popup.html"), join(dist, "popup/popup.html"));
  await cp(join(root, "src/popup/popup.css"), join(dist, "popup/popup.css"));

  // Options HTML + CSS
  await cp(
    join(root, "src/options/options.html"),
    join(dist, "options/options.html")
  );
  await cp(
    join(root, "src/options/options.css"),
    join(dist, "options/options.css")
  );

  console.log("Post-build complete.\n");
}

main().catch((err) => {
  console.error("Post-build failed:", err);
  process.exit(1);
});
