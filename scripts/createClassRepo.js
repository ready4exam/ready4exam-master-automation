// scripts/createClassRepo.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import simpleGit from "simple-git";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cls = process.env.CLASS || "11";
const repoPath = path.join(__dirname, `../temp_repo/class${cls}`);
const staticFile = path.join(process.cwd(), "static_curriculum", `class${cls}`, "curriculum.js`);
const templatePath = path.join(process.cwd(), "template");

console.log(`⚙️ Running createClassRepo.js for class=${cls}`);
console.log(`📂 Repo Path: ${repoPath}`);
console.log(`📘 Static Curriculum File: ${staticFile}`);
console.log(`📁 Template Source: ${templatePath}`);

// Step 1: Validation
if (!fs.existsSync(staticFile)) {
  console.error(`❌ curriculum.js not found at: ${staticFile}`);
  process.exit(1);
}
if (!fs.existsSync(repoPath)) {
  console.error(`❌ Repo not found: ${repoPath}`);
  process.exit(1);
}
if (!fs.existsSync(templatePath)) {
  console.error(`❌ Template folder missing in master-automation.`);
  process.exit(1);
}

// Step 2: Copy the full template structure safely
function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  for (const file of fs.readdirSync(src)) {
    const srcPath = path.join(src, file);
    const destPath = path.join(dest, file);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log("📦 Copying frontend template...");
copyRecursive(templatePath, repoPath);

// Step 3: Overwrite curriculum.js with static version
const jsDir = path.join(repoPath, "js");
if (!fs.existsSync(jsDir)) fs.mkdirSync(jsDir, { recursive: true });

const targetFile = path.join(jsDir, "curriculum.js");
fs.copyFileSync(staticFile, targetFile);
console.log(`✅ curriculum.js successfully copied from static_curriculum/class${cls}/`);
console.log(`📘 curriculum.js created at: ${targetFile}`);

// Step 4: Update class name dynamically in index.html
const indexFile = path.join(repoPath, "index.html");
if (fs.existsSync(indexFile)) {
  let html = fs.readFileSync(indexFile, "utf8");
  html = html.replace(/Class\s+\d+/g, `Class ${cls}`);
  fs.writeFileSync(indexFile, html, "utf8");
  console.log(`📝 Updated index.html with Class ${cls}`);
}

// Step 5: Commit and Push
const git = simpleGit(repoPath);

(async () => {
  try {
    await git.add(".");
    await git.commit(`✨ Automated build for Class ${cls}`);
    await git.push("origin", "main");
    console.log(`🚀 Successfully deployed: ready4exam-${cls}`);
  } catch (err) {
    console.error("⚠️ Git push failed:", err.message);
    process.exit(1);
  }
})();
