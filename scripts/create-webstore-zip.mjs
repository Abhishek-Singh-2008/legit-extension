import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const root = process.cwd();
const zipName = "leetcode-github-sync-webstore-v1.0.0.zip";
const zipPath = path.join(root, zipName);
const distDir = path.join(root, "dist");

console.log("Creating Chrome Web Store distribution ZIP...");

// Ensure dist exists
if (!fs.existsSync(distDir)) {
  console.log("Building project first...");
  execSync("npm run build", { stdio: "inherit" });
}

// Remove old zip if exists
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

// Run PowerShell Compress-Archive directly on dist contents so manifest.json is at the ZIP root
const psCommand = `powershell -Command "Compress-Archive -Path '${distDir}\\*' -DestinationPath '${zipPath}' -Force"`;
execSync(psCommand, { stdio: "inherit" });

const stats = fs.statSync(zipPath);
console.log(`✓ Chrome Web Store ZIP created successfully: ${zipName} (${(stats.size / 1024).toFixed(1)} KB)`);
