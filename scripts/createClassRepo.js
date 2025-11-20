// scripts/createClassRepo.js
// ------------------------------------------------------------
// Ready4Exam - Class Repo Automation (Auto-create if missing)
// Fully corrected and robust version
// ------------------------------------------------------------

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import fetch from "node-fetch";

// ------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------
const CLASS = process.env.CLASS;
const REPO_OWNER = process.env.GITHUB_OWNER || "ready4exam";
const TEMPLATE_DIR = path.join(process.cwd(), "template");
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

// ------------------------------------------------------------
// Repo Naming → ready4exam-<CLASS>
// ------------------------------------------------------------
const REPO_NAME = `ready4exam-${CLASS}`;
const CLONE_URL = `https://${GITHUB_TOKEN}:x-oauth-basic@github.com/${REPO_OWNER}/${REPO_NAME}.git`;

const OUTPUT_DIR = path.join(process.cwd(), "output");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const TARGET_DIR = path.join(OUTPUT_DIR, REPO_NAME);

// ------------------------------------------------------------
// Placeholder → Vercel ENV mapping (adjust names to your Vercel env)
// ------------------------------------------------------------
const replacements = {
  // Firebase (use the env names you set in Vercel)
  "%%FIREBASE_API_KEY%%": process.env.FIREBASE_API_KEY || "",
  "%%FIREBASE_AUTH_DOMAIN%%": process.env.FIREBASE_AUTH_DOMAIN || "",
  "%%FIREBASE_PROJECT_ID%%": process.env.FIREBASE_PROJECT_ID || "",
  "%%FIREBASE_STORAGE_BUCKET%%": process.env.FIREBASE_STORAGE_BUCKET || "",
  "%%FIREBASE_MESSAGING_SENDER_ID%%": process.env.FIREBASE_MESSAGING_SENDER_ID || "",
  "%%FIREBASE_APP_ID%%": process.env.FIREBASE_APP_ID || "",
  "%%FIREBASE_MEASUREMENT_ID%%": process.env.FIREBASE_MEASUREMENT_ID || "",

  // Supabase (class-specific - ensure these env names exist in Vercel)
  "%%SUPABASE_URL_11%%": process.env.SUPABASE_URL_11 || "",
  "%%SUPABASE_ANON_KEY_11%%": process.env.SUPABASE_ANON_KEY_11 || ""
};

// ------------------------------------------------------------
// Helper: Replace placeholders inside a file
// ------------------------------------------------------------
function applyReplacementsToFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, "utf8");
    for (const [key, value] of Object.entries(replacements)) {
      content = content.split(key).join(value);
    }
    fs.writeFileSync(filePath, content, "utf8");
  } catch (err) {
    console.warn(`⚠️ applyReplacementsToFile failed for ${filePath}: ${err.message}`);
  }
}

// ------------------------------------------------------------
// Ensure repo exists on GitHub (create if missing)
// ------------------------------------------------------------
async function ensureRepoExists() {
  console.log(`🔍 Checking repo existence: ${REPO_NAME}`);

  const apiURL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
  const headers = {
    Authorization: `token ${GITHUB_TOKEN}`,
    "User-Agent": "Ready4Exam-Automation"
  };

  const res = await fetch(apiURL, { headers });

  if (res.status === 200) {
    console.log(`✅ Repo exists → ${REPO_NAME}`);
    return;
  }

  if (res.status === 404) {
    console.log(`📦 Repo not found. Creating now → ${REPO_NAME}`);

    const createRes = await fetch(
      `https://api.github.com/orgs/${REPO_OWNER}/repos`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: REPO_NAME,
          private: true,
          auto_init: true
        })
      }
    );

    if (!createRes.ok) {
      console.error("❌ Failed to create repository");
      console.error(await createRes.text());
      process.exit(1);
    }

    console.log(`🎉 Repo created successfully → ${REPO_NAME}`);
    return;
  }

  console.error("❌ GitHub API error:", await res.text());
  process.exit(1);
}

// ------------------------------------------------------------
// Clone or Pull the repo locally
// ------------------------------------------------------------
function cloneOrPullRepo() {
  if (!fs.existsSync(TARGET_DIR)) {
    console.log(`📥 Cloning repository → ${REPO_NAME}`);
    execSync(`git clone ${CLONE_URL} ${TARGET_DIR}`, { stdio: "inherit" });
  } else {
    console.log(`🔄 Pulling updates → ${REPO_NAME}`);
    execSync(`git -C ${TARGET_DIR} pull`, { stdio: "inherit" });
  }
}

// ------------------------------------------------------------
// Copy Template Recursively (safe: skip .git and node_modules)
// ------------------------------------------------------------
function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  for (const item of fs.readdirSync(src)) {
    // Safety: skip .git and node_modules and any hidden CI folders
    if (item === ".git" || item === "node_modules" || item.startsWith(".")) continue;

    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);

    const stat = fs.lstatSync(srcPath);
    if (stat.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      // Ensure dest directory exists
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

      // Copy file
      fs.copyFileSync(srcPath, destPath);

      // Apply replacements only for text files we care about
      const lower = destPath.toLowerCase();
      if (lower.endsWith(".html") || lower.endsWith(".js") || lower.endsWith(".json")) {
        applyReplacementsToFile(destPath);
      }
    }
  }
}

// ------------------------------------------------------------
// Commit and Push
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
  } catch (e) {
    console.log("ℹ️ No changes to commit.");
  }

  console.log("⬆️ Pushing...");
  execSync(`git -C ${TARGET_DIR} push`, { stdio: "inherit" });
  console.log(`🎉 Successfully updated ${REPO_NAME}`);
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
async function run() {
  await ensureRepoExists();
  cloneOrPullRepo();

  // Ensure the target repo directory exists (git clone will create it)
  if (!fs.existsSync(TARGET_DIR)) fs.mkdirSync(TARGET_DIR, { recursive: true });

  console.log("📁 Copying template to target repo...");
  copyRecursive(TEMPLATE_DIR, TARGET_DIR);

  // Ensure curriculum.js is present (copy from template/js if exists)
  const curriculumSrc = path.join(TEMPLATE_DIR, "js", "curriculum.js");
  const curriculumDest = path.join(TARGET_DIR, "js", "curriculum.js");
  if (fs.existsSync(curriculumSrc)) {
    fs.copyFileSync(curriculumSrc, curriculumDest);
    applyReplacementsToFile(curriculumDest);
    console.log("✨ curriculum.js synced");
  } else {
    console.warn("⚠️ curriculum.js not found in template/js — ensure generator ran.");
  }

  commitAndPush();
}

run().catch(err => {
  console.error("❌ createClassRepo.js failed:", err);
  process.exit(1);
});
