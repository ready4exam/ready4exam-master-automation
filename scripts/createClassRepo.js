// scripts/createClassRepo.js
// ------------------------------------------------------------
// Ready4Exam - Class Repo Automation
// Creates/updates a class repo with generated curriculum.js
// ------------------------------------------------------------

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// ------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------
const CLASS = process.env.CLASS;
const REPO_OWNER = "ready4exam";
const TEMPLATE_DIR = path.join(process.cwd(), "template");

if (!CLASS) {
  console.error("❌ Missing CLASS environment variable.");
  process.exit(1);
}

console.log(`⚙️ Running createClassRepo.js for class=${CLASS}`);

// ------------------------------------------------------------
// Validate curriculum.js exists (now in template/js)
// ------------------------------------------------------------
const curriculumJSPath = path.join(
  TEMPLATE_DIR,
  "js",
  "curriculum.js"
);

if (!fs.existsSync(curriculumJSPath)) {
  console.error(
    `❌ Missing curriculum.js in template/js.\n` +
    "Run generateCurriculumJS.js first."
  );
  process.exit(1);
}

console.log(`[Curriculum] Found curriculum.js for class${CLASS}`);

// ------------------------------------------------------------
// Create Target Repo Name
// ------------------------------------------------------------
const REPO_NAME = `ready4exam-class-${CLASS}`;
const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}.git`;

// ------------------------------------------------------------
// Clone the repo (or pull updates)
// ------------------------------------------------------------
const TARGET_DIR = path.join(process.cwd(), "output", REPO_NAME);
if (!fs.existsSync(path.join(process.cwd(), "output"))) {
  fs.mkdirSync(path.join(process.cwd(), "output"));
}

if (!fs.existsSync(TARGET_DIR)) {
  console.log(`📦 Cloning ${REPO_NAME}...`);
  execSync(`git clone ${REPO_URL} ${TARGET_DIR}`, { stdio: "inherit" });
} else {
  console.log(`🔄 Repo exists. Pulling updates...`);
  execSync(`git -C ${TARGET_DIR} pull`, { stdio: "inherit" });
}

// ------------------------------------------------------------
// Copy Template → Target Repo
// ------------------------------------------------------------
console.log(`📁 Copying template folder → ${REPO_NAME}`);

function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  for (const item of fs.readdirSync(src)) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);

    if (fs.lstatSync(srcPath).isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyRecursive(TEMPLATE_DIR, TARGET_DIR);

// ------------------------------------------------------------
// Insert curriculum.js into class repo
// ------------------------------------------------------------
const targetCurriculumPath = path.join(TARGET_DIR, "js", "curriculum.js");
fs.copyFileSync(curriculumJSPath, targetCurriculumPath);

console.log(`✨ curriculum.js written → ${targetCurriculumPath}`);

// ------------------------------------------------------------
// Commit + Push Changes
// ------------------------------------------------------------
console.log("🔐 Setting Git credentials");

execSync(`git -C ${TARGET_DIR} config user.email "automation@ready4exam.com"`);
execSync(`git -C ${TARGET_DIR} config user.name "R4E Automation Bot"`);

console.log("📤 Committing updates...");

try {
  execSync(`git -C ${TARGET_DIR} add .`, { stdio: "inherit" });
  execSync(
    `git -C ${TARGET_DIR} commit -m "🔄 Auto-update: Class ${CLASS} curriculum + template sync"`,
    {
      stdio: "inherit",
    }
  );
} catch (err) {
  console.log("ℹ️ No changes to commit.");
}

console.log("⬆️ Pushing to GitHub...");
execSync(`git -C ${TARGET_DIR} push`, { stdio: "inherit" });

console.log(`🎉 Successfully updated ${REPO_NAME}`);
