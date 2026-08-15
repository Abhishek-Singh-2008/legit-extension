import { defineConfig, build } from "vite";
import { resolve } from "path";

const root = import.meta.dirname;
const alias = { "@": resolve(root, "src") };

// ── Build 1: Content Script (IIFE) ──────────────────────────────────────────
// Content scripts MUST be an IIFE because MV3 does not support ES module
// content scripts.
async function runContentScriptBuild() {
  await build({
    configFile: false,
    build: {
      outDir: resolve(root, "dist"),
      emptyOutDir: false, // don't wipe what main build created
      lib: {
        entry: resolve(root, "src/content/leetcode.ts"),
        name: "LCSyncContent",
        formats: ["iife"],
        fileName: () => "content/leetcode.js",
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
      modulePreload: false,
      target: "es2022",
    },
    resolve: { alias },
  });
}

// ── Build 2: Main extension assets (ESM) ────────────────────────────────────
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        "background/service-worker": resolve(root, "src/background/service-worker.ts"),
        "popup/popup": resolve(root, "src/popup/popup.ts"),
        "options/options": resolve(root, "src/options/options.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name ?? "";
          if (name.endsWith(".css")) {
            if (name.includes("popup")) return "popup/[name][extname]";
            if (name.includes("options")) return "options/[name][extname]";
          }
          return "assets/[name][extname]";
        },
      },
    },
    modulePreload: false,
    target: "es2022",
  },
  resolve: { alias },
  publicDir: "public",
  plugins: [
    {
      name: "content-script-iife",
      closeBundle: async () => {
        console.log("\nBuilding content script as IIFE...");
        await runContentScriptBuild();
        console.log("Content script built.\n");
      },
    },
  ],
});
