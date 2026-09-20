import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const version = manifest.version || "1.0.2";

// 1. Web Store Ready ZIP (dist/* files directly at root of ZIP)
const webstoreZipName = `legit-chrome-webstore-v${version}.zip`;
const webstoreZipPath = path.join(root, webstoreZipName);

// 2. Standard distribution ZIP
const distZipName = `leetcode-github-sync-v${version}.zip`;
const distZipPath = path.join(root, distZipName);

console.log("Packaging Chrome Extension for Web Store & Distribution...");

// Ensure fresh build
if (!fs.existsSync(path.join(root, "dist")) || !fs.existsSync(path.join(root, "dist", "manifest.json"))) {
  console.log("Building project first...");
  execSync("npm run build", { stdio: "inherit" });
}

// Remove old zips if exist
if (fs.existsSync(webstoreZipPath)) fs.unlinkSync(webstoreZipPath);
if (fs.existsSync(distZipPath)) fs.unlinkSync(distZipPath);

// Create Chrome Web Store ZIP (Compress-Archive directly on dist/*)
const psWebstoreCommand = `powershell -Command "Compress-Archive -Path '${path.join(root, "dist")}\\*' -DestinationPath '${webstoreZipPath}' -Force"`;
execSync(psWebstoreCommand, { stdio: "inherit" });

// Create General Distribution ZIP
const psDistCommand = `powershell -Command "Compress-Archive -Path '${path.join(root, "dist")}\\*' -DestinationPath '${distZipPath}' -Force"`;
execSync(psDistCommand, { stdio: "inherit" });

const webstoreStats = fs.statSync(webstoreZipPath);
console.log(`✓ Chrome Web Store ZIP created: ${webstoreZipName} (${(webstoreStats.size / 1024).toFixed(1)} KB)`);
console.log(`  -> Ready to upload directly at: https://chrome.google.com/webstore/devconsole`);

