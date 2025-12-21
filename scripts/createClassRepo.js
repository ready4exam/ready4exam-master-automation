// ------------------------------------------------------------
// Ready4Exam - Class Repo Automation (CURRICULUM SAFE)
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
// ENSURE REPO EXISTS
// ============================================================
async function ensureRepoExists() {
  console.log(`🔍 Checking repo → ${REPO_NAME}`);

  const req = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`,
    { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
  );

  if (req.status === 200) return;

  if (req.status === 404) {
    console.log("📦 Creating new repo...");
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

  console.error("❌ GitHub API error");
  process.exit(1);
}

// ============================================================
// FILE HELPERS
// ============================================================
function applyReplacements(file) {
  let text = fs.readFileSync(file, "utf8");
  for (const [key, val] of Object.entries(replacements)) {
    text = text.replace(new RegExp(key, "g"), val);
  }
  fs.writeFileSync(file, text);
}

// ============================================================
// COPY TEMPLATE → TARGET (CURRICULUM IMMUTABLE)
// ============================================================
function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  for (const item of fs.readdirSync(src)) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);

    // 🔒 CRITICAL: curriculum.js RULES
    if (item === "curriculum.js") {
      // 1️⃣ If destination already has curriculum → NEVER TOUCH
      if (fs.existsSync(destPath)) {
        console.log("🔒 Preserving existing destination curriculum.js");
        continue;
      }

      // 2️⃣ Inject built curriculum ONLY if destination missing
      const builtCurriculum = path.join(
        ROOT,
        "classes_repo",
        `class${CLASS}`,
        "js",
        "curriculum.js"
      );

      if (fs.existsSync(builtCurriculum)) {
        console.log(`📘 Injecting built curriculum.js for Class ${CLASS}`);
        fs.copyFileSync(builtCurriculum, destPath);
      } else {
        console.log("⛔ No curriculum injected (template blocked)");
      }
      continue;
    }

    if (fs.lstatSync(srcPath).isDirectory()) {
      copyRecursive(srcPath, destPath);
      continue;
    }

    fs.copyFileSync(srcPath, destPath);

    if (destPath.endsWith(".html") || destPath.endsWith(".js")) {
      applyReplacements(destPath);
    }
  }
}

// ============================================================
// GIT OPS
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
    console.log("ℹ No changes to commit");
  }

  execSync(`git -C ${TARGET_DIR} push`);
  console.log(`🎉 Class ${CLASS} repo deployed`);
}

// ============================================================
// RUN
// ============================================================
async function run() {
  await ensureRepoExists();
  cloneOrPull();
  copyRecursive(TEMPLATE_DIR, TARGET_DIR);
  pushRepo();
}

run();
