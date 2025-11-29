// scripts/createClassRepo.js
// ------------------------------------------------------------
// Ready4Exam - Class Repo Automation
// ------------------------------------------------------------

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import fetch from "node-fetch";

// ============================================================
// ENV + CONFIG
// ============================================================
const CLASS = process.env.CLASS;
const REPO_OWNER = process.env.GIT_OWNER || "ready4exam";
const GITHUB_TOKEN = process.env.GIT_TOKEN;

if (!CLASS) {
  console.error("❌ Missing CLASS env");
  process.exit(1);
}
if (!GITHUB_TOKEN) {
  console.error("❌ Missing GIT_TOKEN");
  process.exit(1);
}

console.log(`⚙ Running createClassRepo.js → CLASS=${CLASS}`);

// repo paths
const ROOT = process.cwd();
const TEMPLATE_DIR = path.join(ROOT, "template");
const OUTPUT_DIR = path.join(ROOT, "output");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

const REPO_NAME = `ready4exam-class-${CLASS}`;
const REPO_URL = `https://${GITHUB_TOKEN}:x-oauth-basic@github.com/${REPO_OWNER}/${REPO_NAME}.git`;
const TARGET_DIR = path.join(OUTPUT_DIR, REPO_NAME);

// ============================================================
// PLACEHOLDER REPLACEMENTS
// ============================================================
const replacements = {
  "%%FIREBASE_API_KEY%%": process.env.FIREBASE_API_KEY || "",
  "%%FIREBASE_AUTH_DOMAIN%%": process.env.FIREBASE_AUTH_DOMAIN || "",
  "%%FIREBASE_PROJECT_ID%%": process.env.FIREBASE_PROJECT_ID || "",
  "%%FIREBASE_STORAGE_BUCKET%%": process.env.FIREBASE_STORAGE_BUCKET || "",
  "%%FIREBASE_MESSAGING_SENDER_ID%%": process.env.FIREBASE_MESSAGING_SENDER_ID || "",
  "%%FIREBASE_APP_ID%%": process.env.FIREBASE_APP_ID || "",
  "%%FIREBASE_MEASUREMENT_ID%%": process.env.FIREBASE_MEASUREMENT_ID || "",
  "%%SUPABASE_URL%%": process.env.SUPABASE_URL || "",
  "%%SUPABASE_ANON_KEY%%": process.env.SUPABASE_ANON_KEY || "",
  "{{CLASS}}": CLASS
};

// ============================================================
// CHECK OR CREATE GITHUB REPO
// ============================================================
async function ensureRepoExists() {
  console.log(`🔍 Checking repo → ${REPO_NAME}`);

  const req = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` }
  });

  if (req.status === 200) {
    console.log("✅ Repo exists");
    return;
  }

  if (req.status === 404) {
    console.log("📦 Creating new repo…");
    const res = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json"
      },
      body: JSON.stringify({ name: REPO_NAME, private: false })
    });
    if (!res.ok) {
      console.error("❌ Repo creation failed:", await res.text());
      process.exit(1);
    }
    console.log("🎉 Repo created");
    return;
  }

  console.error("❌ GitHub API Error:", await req.text());
  process.exit(1);
}

// ============================================================
// APPLY REPLACEMENTS IN FILES
// ============================================================
function applyReplacements(file) {
  let text = fs.readFileSync(file, "utf8");
  for (const [key, val] of Object.entries(replacements)) {
    text = text.replace(new RegExp(key, "g"), val);
  }
  fs.writeFileSync(file, text);
}

// ============================================================
// COPY TEMPLATE → TARGET REPO  (with curriculum override)
// ============================================================
function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  for (const item of fs.readdirSync(src)) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);

    // 🔥 curriculum override
    if (item === "curriculum.js") {
      const generated = path.join(ROOT, "classes_repo", `class${CLASS}`, "js", "curriculum.js");

      if (fs.existsSync(generated)) {
        console.log(`🔁 Using BUILT curriculum.js for class ${CLASS}`);
        fs.copyFileSync(generated, destPath);
      } else {
        console.log(`⚠ No built file — using template curriculum.js`);
        fs.copyFileSync(srcPath, destPath);
      }
      continue;
    }

    if (fs.lstatSync(srcPath).isDirectory()) {
      copyRecursive(srcPath, destPath);
      continue;
    }

    fs.copyFileSync(srcPath, destPath);
    if (destPath.endsWith(".html") || destPath.endsWith(".js")) applyReplacements(destPath);
  }
}

// ============================================================
function cloneOrPull() {
  if (!fs.existsSync(TARGET_DIR)) {
    console.log("📥 Cloning repo...");
    execSync(`git clone ${REPO_URL} ${TARGET_DIR}`, { stdio: "inherit" });
  } else {
    console.log("🔄 Pulling latest...");
    execSync(`git -C ${TARGET_DIR} pull`, { stdio: "inherit" });
  }
}

function pushRepo() {
  execSync(`git -C ${TARGET_DIR} config user.email "automation@ready4exam.com"`);
  execSync(`git -C ${TARGET_DIR} config user.name "R4E Automation Bot"`);

  try {
    execSync(`git -C ${TARGET_DIR} add .`);
    execSync(`git -C ${TARGET_DIR} commit -m "🚀 Auto update for Class ${CLASS}"`);
  } catch {
    console.log("ℹ No changes — nothing to commit");
  }

  execSync(`git -C ${TARGET_DIR} push`);
  console.log(`🎉 Class ${CLASS} repo deployed`);
}

// ============================================================
async function run() {
  await ensureRepoExists();
  cloneOrPull();
  copyRecursive(TEMPLATE_DIR, TARGET_DIR);
  pushRepo();
}
run();
