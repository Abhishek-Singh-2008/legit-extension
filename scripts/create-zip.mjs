import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const version = manifest.version || "1.0.1";
const zipName = `leetcode-github-sync-v${version}.zip`;
const zipPath = path.join(root, zipName);

console.log("Creating distribution ZIP for peer testing...");

// Ensure dist exists
if (!fs.existsSync(path.join(root, "dist"))) {
  console.log("Building project first...");
  execSync("npm run build", { stdio: "inherit" });
}

// Create ZIP using PowerShell Compress-Archive on Windows
const tempDir = path.join(root, ".temp-zip-build");
if (fs.existsSync(tempDir)) {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

fs.mkdirSync(tempDir, { recursive: true });

// Copy dist and README.md into temp structure
const targetFolder = path.join(tempDir, "leetcode-github-sync");
fs.mkdirSync(targetFolder, { recursive: true });

// Copy dist folder
fs.cpSync(path.join(root, "dist"), path.join(targetFolder, "dist"), { recursive: true });
// Copy README.md
fs.copyFileSync(path.join(root, "README.md"), path.join(targetFolder, "README.md"));
// Copy LICENSE if present
if (fs.existsSync(path.join(root, "LICENSE"))) {
  fs.copyFileSync(path.join(root, "LICENSE"), path.join(targetFolder, "LICENSE"));
}
// Copy manifest.json if present
if (fs.existsSync(path.join(root, "manifest.json"))) {
  fs.copyFileSync(path.join(root, "manifest.json"), path.join(targetFolder, "manifest.json"));
}

// Remove old zip if exists
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

// Run PowerShell Compress-Archive
const psCommand = `powershell -Command "Compress-Archive -Path '${targetFolder}\\*' -DestinationPath '${zipPath}' -Force"`;
execSync(psCommand, { stdio: "inherit" });

// Cleanup temp folder
fs.rmSync(tempDir, { recursive: true, force: true });

const stats = fs.statSync(zipPath);
console.log(`✓ Distribution ZIP created successfully: ${zipName} (${(stats.size / 1024).toFixed(1)} KB)`);
