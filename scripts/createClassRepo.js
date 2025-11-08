// scripts/createClassRepo.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import simpleGit from "simple-git";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Class number provided by workflow environment variable
const cls = process.env.CLASS || "11";

// Path where the repo is cloned temporarily
const repoPath = path.join(__dirname, `../temp_repo/class${cls}`);

// Path to static curriculum
const staticFile = path.join(process.cwd(), "static_curriculum", `class${cls}`, "curriculum.js");

console.log(`⚙️ Running createClassRepo.js for class=${cls}`);
console.log(`📂 Repo Path: ${repoPath}`);
console.log(`📘 Static Curriculum File: ${staticFile}`);

// Check curriculum file existence
if (!fs.existsSync(staticFile)) {
  console.error(`❌ curriculum.js not found at: ${staticFile}`);
  process.exit(1);
}

// Check repo path existence
if (!fs.existsSync(repoPath)) {
  console.error(`❌ Repo folder not found: ${repoPath}`);
  process.exit(1);
}

// Ensure js folder exists in the repo
const jsDir = path.join(repoPath, "js");
if (!fs.existsSync(jsDir)) {
  fs.mkdirSync(jsDir, { recursive: true });
  console.log(`📁 Created missing js folder in repo`);
}

// Copy only curriculum.js safely
const targetFile = path.join(jsDir, "curriculum.js");
fs.copyFileSync(staticFile, targetFile);
console.log(`✅ curriculum.js successfully copied from static_curriculum/class${cls}/`);
console.log(`📘 curriculum.js created at: ${targetFile}`);

// Git commit and push process
const git = simpleGit(repoPath);

(async () => {
  try {
    await git.add(".");
    await git.commit(`Updated curriculum.js for Class ${cls}`);
    await git.push("origin", "main");
    console.log(`🚀 curriculum.js pushed successfully for Class ${cls}`);
  } catch (err) {
    console.error("⚠️ Git push failed:", err.message);
    process.exit(1);
  }
})();
