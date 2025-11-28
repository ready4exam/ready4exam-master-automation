// scripts/createClassRepo.js
// ------------------------------------------------------------
// Ready4Exam - Class Repo Automation (Personal GitHub Account)
// ------------------------------------------------------------

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import fetch from "node-fetch";

// ------------------------------------------------------------
// ENV + CONFIG
// ------------------------------------------------------------
const CLASS = process.env.CLASS;
const REPO_OWNER = process.env.GIT_OWNER || "ready4exam";
const GITHUB_TOKEN = process.env.GIT_TOKEN;

if (!CLASS) {
  console.error("❌ Missing CLASS environment variable.");
  process.exit(1);
}

if (!GITHUB_TOKEN) {
  console.error("❌ Missing GITHUB_TOKEN environment variable.");
  process.exit(1);
}

console.log(`⚙️ Running createClassRepo.js → CLASS=${CLASS}`);

// Paths
const TEMPLATE_DIR = path.join(process.cwd(), "template");
const OUTPUT_DIR = path.join(process.cwd(), "output");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

// Repo naming
const REPO_NAME = `ready4exam-class-${CLASS}`;
const CLONE_URL = `https://${GITHUB_TOKEN}:x-oauth-basic@github.com/${REPO_OWNER}/${REPO_NAME}.git`;
const TARGET_DIR = path.join(OUTPUT_DIR, REPO_NAME);

// ------------------------------------------------------------
// 🔥 PLACEHOLDER REPLACEMENT MAP (added CLASS support)
// ------------------------------------------------------------
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

  // 🔥 New variable for template automation
  "{{CLASS}}": CLASS
};

// ------------------------------------------------------------
// REPO CHECK + CREATE IF MISSING
// ------------------------------------------------------------
async function ensureRepoExists() {
  console.log(`🔍 Checking GitHub repo → ${REPO_NAME}`);

  const apiURL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
  const headers = {
    Authorization: `token ${GITHUB_TOKEN}`,
    "User-Agent": "Ready4Exam-Automation",
    Accept: "application/vnd.github+json",
  };

  const res = await fetch(apiURL, { headers });

  if (res.status === 200) {
    console.log(`✅ Repository exists`);
    return;
  }

  if (res.status === 404) {
    console.log(`📦 Creating new repository → ${REPO_NAME}`);
    const createRes = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: REPO_NAME, private: false, auto_init: true }),
    });

    if (!createRes.ok) {
      console.error("❌ Repo creation failed:", await createRes.text());
      process.exit(1);
    }
    console.log(`🎉 Repo created successfully`);
    return;
  }

  console.error("❌ GitHub API Error:", await res.text());
  process.exit(1);
}

// ------------------------------------------------------------
// APPLY STRING REPLACEMENTS
// ------------------------------------------------------------
function applyReplacementsToFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replace(new RegExp(key, "g"), value);
  }
  fs.writeFileSync(filePath, content, "utf8");
}

// ------------------------------------------------------------
// COPY TEMPLATE → TARGET REPO FOLDER
// ------------------------------------------------------------
function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  for (const item of fs.readdirSync(src)) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);

    if (fs.lstatSync(srcPath).isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      if (destPath.endsWith(".html") || destPath.endsWith(".js"))
        applyReplacementsToFile(destPath);
    }
  }
}

// ------------------------------------------------------------
function cloneOrPullRepo() {
  if (!fs.existsSync(TARGET_DIR)) {
    console.log("📥 Cloning repo...");
    execSync(`git clone ${CLONE_URL} ${TARGET_DIR}`, { stdio: "inherit" });
  } else {
    console.log("🔄 Pulling latest commit...");
    execSync(`git -C ${TARGET_DIR} pull`, { stdio: "inherit" });
  }
}

function copyTemplate() {
  console.log("📁 Copying template → Repo");
  copyRecursive(TEMPLATE_DIR, TARGET_DIR);
}

function commitAndPush() {
  execSync(`git -C ${TARGET_DIR} config user.email "automation@ready4exam.com"`);
  execSync(`git -C ${TARGET_DIR} config user.name "R4E Automation Bot"`);

  try {
    execSync(`git -C ${TARGET_DIR} add .`, { stdio: "inherit" });
    execSync(`git -C ${TARGET_DIR} commit -m "🚀 Auto Build: Class ${CLASS} Repo Setup"`, { stdio: "inherit" });
  } catch {
    console.log("ℹ️ No file changes — nothing to commit");
  }

  console.log("⬆️ Pushing…");
  execSync(`git -C ${TARGET_DIR} push`, { stdio: "inherit" });
  console.log(`🎉 CLASS ${CLASS} deployment complete`);
}

// ------------------------------------------------------------
async function run() {
  await ensureRepoExists();
  cloneOrPullRepo();
  copyTemplate();
  commitAndPush();
}
run();
