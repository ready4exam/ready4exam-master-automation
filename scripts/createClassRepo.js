import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import simpleGit from "simple-git";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cls = process.env.CLASS || "11";
const repoPath = path.join(__dirname, `../temp_repo/class${cls}`);
const staticFile = path.join(process.cwd(), "static_curriculum", `class${cls}`, "curriculum.js`);

console.log(`⚙️ Running createClassRepo.js for class=${cls}`);

if (!fs.existsSync(staticFile)) {
  console.error(`❌ curriculum.js not found at: ${staticFile}`);
  process.exit(1);
}

if (!fs.existsSync(repoPath)) {
  console.log(`❌ Repo folder not found at ${repoPath}. Ensure it is cloned first.`);
  process.exit(1);
}

// Ensure /js folder exists in the repo
const jsDir = path.join(repoPath, "js");
if (!fs.existsSync(jsDir)) {
  fs.mkdirSync(jsDir, { recursive: true });
  console.log(`📁 Created js folder in ${repoPath}`);
}

// Copy only curriculum.js file safely
const targetFile = path.join(jsDir, "curriculum.js");
fs.copyFileSync(staticFile, targetFile);

console.log(`✅ curriculum.js successfully copied from static_curriculum/class${cls}/`);
console.log(`📘 curriculum.js created at: ${targetFile}`);

// Commit the changes
const git = simpleGit(repoPath);

try {
  await git.add(".");
  await git.commit(`Updated curriculum.js for Class ${cls}`);
  await git.push("origin", "main");
  console.log(`🚀 Curriculum pushed successfully for Class ${cls}`);
} catch (err) {
  console.error("⚠️ Git push failed:", err.message);
}
