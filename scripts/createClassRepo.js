// scripts/createClassRepo.js
// ------------------------------------------------------------
// Ready4Exam – Class Repo Automation
// Injects Firebase & Supabase configs and pushes full template
// ------------------------------------------------------------

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import fetch from "node-fetch";

// ------------------------------------------------------------
// ENV + BASIC CONFIG
// ------------------------------------------------------------
const CLASS = process.env.CLASS;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = "ready4exam";

const TEMPLATE_DIR = path.join(process.cwd(), "template");
const OUTPUT_DIR = path.join(process.cwd(), "output");

if (!CLASS) {
  console.error("❌ Missing CLASS environment variable.");
  process.exit(1);
}
if (!GITHUB_TOKEN) {
  console.error("❌ Missing GITHUB_TOKEN.");
  process.exit(1);
}

const REPO_NAME = `ready4exam-${CLASS}`;
const TARGET_DIR = path.join(OUTPUT_DIR, REPO_NAME);
const CLONE_URL = `https://${GITHUB_TOKEN}:x-oauth-basic@github.com/${REPO_OWNER}/${REPO_NAME}.git`;

console.log(`⚙️ Ready4Exam Automation → CLASS = ${CLASS}`);
console.log(`📦 Target repo → ${REPO_NAME}`);


// ------------------------------------------------------------
// Helper: Ensure folder exists
// ------------------------------------------------------------
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);


// ------------------------------------------------------------
// GitHub – Ensure Repo Exists
// ------------------------------------------------------------
async function ensureRepoExists() {
  const apiURL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
  const headers = {
    Authorization: `token ${GITHUB_TOKEN}`,
    "User-Agent": "Ready4Exam-Automation",
  };

  console.log(`🔍 Checking repo: ${REPO_NAME}`);

  const res = await fetch(apiURL, { headers });

  if (res.status === 200) {
    console.log(`✅ Repo exists → ${REPO_NAME}`);
    return;
  }

  if (res.status === 404) {
    console.log(`📦 Repo missing, creating → ${REPO_NAME}`);

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
      console.error("❌ Repo creation failed");
      console.error(await createRes.text());
      process.exit(1);
    }

    console.log(`🎉 Repo created → ${REPO_NAME}`);
    return;
  }

  console.error("❌ GitHub API error:", await res.text());
  process.exit(1);
}


// ------------------------------------------------------------
// Clone or Pull Repo
// ------------------------------------------------------------
function cloneOrPullRepo() {
  if (!fs.existsSync(TARGET_DIR)) {
    console.log(`📥 Cloning repo → ${REPO_NAME}`);
    execSync(`git clone ${CLONE_URL} ${TARGET_DIR}`, { stdio: "inherit" });
  } else {
    console.log(`🔄 Pulling latest changes → ${REPO_NAME}`);
    execSync(`git -C ${TARGET_DIR} pull`, { stdio: "inherit" });
  }
}


// ------------------------------------------------------------
// Copy Template Recursively
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
    }
  }
}

function copyTemplate() {
  console.log(`📁 Copying template → ${REPO_NAME}`);
  copyRecursive(TEMPLATE_DIR, TARGET_DIR);
}


// ------------------------------------------------------------
// 🔥 Placeholder Replacement Engine
// ------------------------------------------------------------
function replacePlaceholdersInFile(filePath, replacements) {
  let content = fs.readFileSync(filePath, "utf8");

  for (const [placeholder, value] of Object.entries(replacements)) {
    const regex = new RegExp(placeholder, "g");
    content = content.replace(regex, value || "");
  }

  fs.writeFileSync(filePath, content, "utf8");
  console.log(`🔧 Updated → ${filePath}`);
}


// ------------------------------------------------------------
// 🔥 Build replacement dictionary from Vercel ENV
// ------------------------------------------------------------
function getReplacements() {
  return {
    "%%FIREBASE_API_KEY%%": process.env.FIREBASE_API_KEY,
    "%%FIREBASE_AUTH_DOMAIN%%": process.env.FIREBASE_AUTH_DOMAIN,
    "%%FIREBASE_PROJECT_ID%%": process.env.FIREBASE_PROJECT_ID,
    "%%FIREBASE_STORAGE_BUCKET%%": process.env.FIREBASE_STORAGE_BUCKET,
    "%%FIREBASE_MESSAGING_SENDER_ID%%": process.env.FIREBASE_MESSAGING_SENDER_ID,
    "%%FIREBASE_APP_ID%%": process.env.FIREBASE_APP_ID,
    "%%FIREBASE_MEASUREMENT_ID%%": process.env.FIREBASE_MEASUREMENT_ID,

    // Supabase keys for this class
    "%%SUPABASE_URL%%": process.env[`SUPABASE_URL_${CLASS}`],
    "%%SUPABASE_ANON_KEY%%": process.env[`SUPABASE_ANON_KEY_${CLASS}`],
  };
}


// ------------------------------------------------------------
// 🔥 Apply replacements to all HTML/JS files
// ------------------------------------------------------------
function applyReplacements() {
  console.log("🛠 Applying Firebase + Supabase config…");

  const replacements = getReplacements();

  const filesToPatch = [
    "quiz-engine.html",
    "chapter-selection.html",
    "index.html",
    "js/config.js"
  ];

  for (const file of filesToPatch) {
    const fullPath = path.join(TARGET_DIR, file);
    if (fs.existsSync(fullPath)) {
      replacePlaceholdersInFile(fullPath, replacements);
    } else {
      console.warn(`⚠️ File missing, skipped: ${file}`);
    }
  }
}


// ------------------------------------------------------------
// Curriculum Sync
// ------------------------------------------------------------
function insertCurriculum() {
  const src = path.join(TEMPLATE_DIR, "js", "curriculum.js");
  const dest = path.join(TARGET_DIR, "js", "curriculum.js");

  fs.copyFileSync(src, dest);
  console.log(`✨ curriculum.js synced → ${dest}`);
}


// ------------------------------------------------------------
// Git Commit + Push
// ------------------------------------------------------------
function commitAndPush() {
  execSync(`git -C ${TARGET_DIR} config user.email "automation@ready4exam.com"`);
  execSync(`git -C ${TARGET_DIR} config user.name "R4E Automation Bot"`);

  try {
    execSync(`git -C ${TARGET_DIR} add .`, { stdio: "inherit" });
    execSync(
      `git -C ${TARGET_DIR} commit -m "🔄 Auto-update: Class ${CLASS} + config injection"`,
      { stdio: "inherit" }
    );
  } catch {
    console.log("ℹ️ No changes to commit.");
  }

  execSync(`git -C ${TARGET_DIR} push`, { stdio: "inherit" });
  console.log(`🎉 Successfully updated → ${REPO_NAME}`);
}


// ------------------------------------------------------------
// MAIN PIPELINE
// ------------------------------------------------------------
async function run() {
  await ensureRepoExists();
  cloneOrPullRepo();
  copyTemplate();
  applyReplacements();
  insertCurriculum();
  commitAndPush();
}

run();
