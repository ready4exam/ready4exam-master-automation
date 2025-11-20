// scripts/createClassRepo.js
// ------------------------------------------------------------
// Ready4Exam - Class Repo Automation (Option A: Universal Vars)
// ------------------------------------------------------------

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import fetch from "node-fetch";

// ------------------------------------------------------------
// ENV + CONFIG
// ------------------------------------------------------------
const CLASS = process.env.CLASS;
const REPO_OWNER = process.env.GITHUB_OWNER || "ready4exam";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!CLASS) {
  console.error("❌ Missing CLASS environment variable.");
  process.exit(1);
}

if (!GITHUB_TOKEN) {
  console.error("❌ Missing GITHUB_TOKEN environment variable.");
  process.exit(1);
}

console.log(`⚙️ Running createClassRepo.js for class=${CLASS}`);

// Paths
const TEMPLATE_DIR = path.join(process.cwd(), "template");
const OUTPUT_DIR = path.join(process.cwd(), "output");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

// Repo naming
const REPO_NAME = `ready4exam-${CLASS}`;
const CLONE_URL = `https://${GITHUB_TOKEN}:x-oauth-basic@github.com/${REPO_OWNER}/${REPO_NAME}.git`;
const TARGET_DIR = path.join(OUTPUT_DIR, REPO_NAME);

// ------------------------------------------------------------
// DEBUGGING ENV VARS (Visible in workflow run logs)
// ------------------------------------------------------------
console.log("\n🧪 DEBUG — Loaded Environment Variables:");
console.log("FIREBASE_API_KEY =", process.env.FIREBASE_API_KEY);
console.log("FIREBASE_AUTH_DOMAIN =", process.env.FIREBASE_AUTH_DOMAIN);
console.log("FIREBASE_PROJECT_ID =", process.env.FIREBASE_PROJECT_ID);
console.log("FIREBASE_STORAGE_BUCKET =", process.env.FIREBASE_STORAGE_BUCKET);
console.log("FIREBASE_MESSAGING_SENDER_ID =", process.env.FIREBASE_MESSAGING_SENDER_ID);
console.log("FIREBASE_APP_ID =", process.env.FIREBASE_APP_ID);
console.log("FIREBASE_MEASUREMENT_ID =", process.env.FIREBASE_MEASUREMENT_ID);
console.log("SUPABASE_URL =", process.env.SUPABASE_URL);
console.log("SUPABASE_ANON_KEY =", process.env.SUPABASE_ANON_KEY);
console.log("------------------------------------------------------------\n");

// ------------------------------------------------------------
// REPLACEMENT MAP — FINAL OPTION A
// ------------------------------------------------------------
const replacements = {
  "%%FIREBASE_API_KEY%%": process.env.FIREBASE_API_KEY || "",
  "%%FIREBASE_AUTH_DOMAIN%%": process.env.FIREBASE_AUTH_DOMAIN || "",
  "%%FIREBASE_PROJECT_ID%%": process.env.FIREBASE_PROJECT_ID || "",
  "%%FIREBASE_STORAGE_BUCKET%%": process.env.FIREBASE_STORAGE_BUCKET || "",
  "%%FIREBASE_MESSAGING_SENDER_ID%%": process.env.FIREBASE_MESSAGING_SENDER_ID || "",
  "%%FIREBASE_APP_ID%%": process.env.FIREBASE_APP_ID || "",
  "%%FIREBASE_MEASUREMENT_ID%%": process.env.FIREBASE_MEASUREMENT_ID || "",

  // Supabase (universal)
  "%%SUPABASE_URL%%": process.env.SUPABASE_URL || "",
  "%%SUPABASE_ANON_KEY%%": process.env.SUPABASE_ANON_KEY || "",
};

// ------------------------------------------------------------
// REPO EXISTS?
// ------------------------------------------------------------
async function ensureRepoExists() {
  console.log(`🔍 Checking repo existence: ${REPO_NAME}`);

  const apiURL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
  const headers = {
    Authorization: `token ${GITHUB_TOKEN}`,
    "User-Agent": "Ready4Exam-Automation",
  };

  const res = await fetch(apiURL, { headers });

  if (res.status === 200) {
    console.log(`✅ Repo exists → ${REPO_NAME}`);
    return;
  }

  if (res.status === 404) {
    console.log(`📦 Repo not found. Creating → ${REPO_NAME}`);

    const createRes = await fetch(
      `https://api.github.com/orgs/${REPO_OWNER}/repos`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: REPO_NAME,
          private: true,
          auto_init: true,
        }),
      }
    );

    if (!createRes.ok) {
      console.error("❌ Error creating repository:\n", await createRes.text());
      process.exit(1);
    }

    console.log(`🎉 Repo created successfully → ${REPO_NAME}`);
    return;
  }

  console.error("❌ GitHub API error:", await res.text());
  process.exit(1);
}

// ------------------------------------------------------------
// APPLY PLACEHOLDERS
// ------------------------------------------------------------
function applyReplacementsToFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");

  for (const [placeholder, value] of Object.entries(replacements)) {
    content = content.replace(new RegExp(placeholder, "g"), value);
  }

  fs.writeFileSync(filePath, content, "utf8");
}

// ------------------------------------------------------------
// CLONE or PULL
// ------------------------------------------------------------
function cloneOrPullRepo() {
  if (!fs.existsSync(TARGET_DIR)) {
    console.log(`📥 Cloning repo → ${REPO_NAME}`);
    execSync(`git clone ${CLONE_URL} ${TARGET_DIR}`, { stdio: "inherit" });
  } else {
    console.log(`🔄 Pulling latest → ${REPO_NAME}`);
    execSync(`git -C ${TARGET_DIR} pull`, { stdio: "inherit" });
  }
}

// ------------------------------------------------------------
// COPY TEMPLATE + Apply replacements
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

      if (destPath.endsWith(".html") || destPath.endsWith(".js")) {
        applyReplacementsToFile(destPath);
      }
    }
  }
}

function copyTemplate() {
  console.log(`📁 Copying template → ${REPO_NAME}`);
  copyRecursive(TEMPLATE_DIR, TARGET_DIR);
}

// ------------------------------------------------------------
// COMMIT + PUSH
// ------------------------------------------------------------
function commitAndPush() {
  execSync(`git -C ${TARGET_DIR} config user.email "automation@ready4exam.com"`);
  execSync(`git -C ${TARGET_DIR} config user.name "R4E Automation Bot"`);

  try {
    execSync(`git -C ${TARGET_DIR} add .`, { stdio: "inherit" });
    execSync(
      `git -C ${TARGET_DIR} commit -m "🔄 Auto-update: Class ${CLASS} template + env injection"`,
      { stdio: "inherit" }
    );
  } catch {
    console.log("ℹ️ No changes to commit.");
  }

  console.log("⬆️ Pushing changes…");
  execSync(`git -C ${TARGET_DIR} push`, { stdio: "inherit" });
  console.log(`🎉 Successfully updated → ${REPO_NAME}`);
}

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------
async function run() {
  await ensureRepoExists();
  cloneOrPullRepo();
  copyTemplate();
  commitAndPush();
}

run();
