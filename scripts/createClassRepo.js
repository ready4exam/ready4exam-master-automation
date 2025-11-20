// scripts/createClassRepo.js
// ------------------------------------------------------------
// Ready4Exam Phase-2 Automation
// Final, Fully-Fixed Version (ENV Injection + Safe Copy)
// ------------------------------------------------------------

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import fetch from "node-fetch";

// ------------------------------------------------------------
// ENV VARIABLES (From Vercel)
// ------------------------------------------------------------
const CLASS = process.env.CLASS;
const REPO_OWNER = "ready4exam";
const TEMPLATE_DIR = path.join(process.cwd(), "template");
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Firebase Vars
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY_1112;
const FIREBASE_AUTH_DOMAIN = process.env.FIREBASE_AUTH_DOMAIN_1112;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID_1112;
const FIREBASE_STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET_1112;
const FIREBASE_MESSAGING_SENDER_ID = process.env.FIREBASE_MESSAGING_SENDER_ID_1112;
const FIREBASE_APP_ID = process.env.FIREBASE_APP_ID_1112;
const FIREBASE_MEASUREMENT_ID = process.env.FIREBASE_MEASUREMENT_ID_1112;

// Supabase Vars
const SUPABASE_URL = process.env.SUPABASE_URL_11;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY_11;

// ------------------------------------------------------------
if (!CLASS) {
  console.error("❌ Missing CLASS environment variable.");
  process.exit(1);
}

if (!GITHUB_TOKEN) {
  console.error("❌ Missing GITHUB_TOKEN environment variable.");
  process.exit(1);
}

console.log(`⚙️ createClassRepo.js → class=${CLASS}`);

// ------------------------------------------------------------
// Repo Name Pattern → ready4exam-11
// ------------------------------------------------------------
const REPO_NAME = `ready4exam-${CLASS}`;
const CLONE_URL = `https://${GITHUB_TOKEN}:x-oauth-basic@github.com/${REPO_OWNER}/${REPO_NAME}.git`;

const TARGET_DIR = path.join(process.cwd(), "output", REPO_NAME);
fs.mkdirSync(path.join(process.cwd(), "output"), { recursive: true });

// ------------------------------------------------------------
// Inject ENV placeholders in HTML
// ------------------------------------------------------------
function replaceEnv(content) {
  return content
    .replace(/%%FIREBASE_API_KEY%%/g, FIREBASE_API_KEY)
    .replace(/%%FIREBASE_AUTH_DOMAIN%%/g, FIREBASE_AUTH_DOMAIN)
    .replace(/%%FIREBASE_PROJECT_ID%%/g, FIREBASE_PROJECT_ID)
    .replace(/%%FIREBASE_STORAGE_BUCKET%%/g, FIREBASE_STORAGE_BUCKET)
    .replace(/%%FIREBASE_MESSAGING_SENDER_ID%%/g, FIREBASE_MESSAGING_SENDER_ID)
    .replace(/%%FIREBASE_APP_ID%%/g, FIREBASE_APP_ID)
    .replace(/%%FIREBASE_MEASUREMENT_ID%%/g, FIREBASE_MEASUREMENT_ID)
    .replace(/%%SUPABASE_URL%%/g, SUPABASE_URL)
    .replace(/%%SUPABASE_ANON_KEY%%/g, SUPABASE_ANON_KEY);
}


// ------------------------------------------------------------
// Ensure repo exists on GitHub
// ------------------------------------------------------------
async function ensureRepoExists() {
  console.log(`🔍 Checking repo: ${REPO_NAME}`);

  const apiURL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
  const headers = {
    Authorization: `token ${GITHUB_TOKEN}`,
    "User-Agent": "Ready4Exam-Automation",
  };

  const res = await fetch(apiURL, { headers });

  if (res.status === 200) {
    console.log(`✅ Repo exists: ${REPO_NAME}`);
    return;
  }

  if (res.status === 404) {
    console.log(`📦 Repo missing → creating ${REPO_NAME}...`);

    const createRes = await fetch(
      `https://api.github.com/orgs/${REPO_OWNER}/repos`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: REPO_NAME,
          private: false,
          auto_init: true,
        }),
      }
    );

    if (!createRes.ok) {
      console.error("❌ Failed to create repo");
      console.error(await createRes.text());
      process.exit(1);
    }

    console.log(`🎉 Repo created → ${REPO_NAME}`);
    return;
  }

  console.error("❌ GitHub API Error:", await res.text());
  process.exit(1);
}


// ------------------------------------------------------------
// Clone or Pull Repo
// ------------------------------------------------------------
function cloneOrPullRepo() {
  if (!fs.existsSync(TARGET_DIR)) {
    console.log(`📥 Cloning ${REPO_NAME}...`);
    execSync(`git clone ${CLONE_URL} ${TARGET_DIR}`, { stdio: "inherit" });
  } else {
    console.log(`🔄 Pulling latest changes...`);
    execSync(`git -C ${TARGET_DIR} pull`, { stdio: "inherit" });
  }
}


// ------------------------------------------------------------
// Safely Copy Template (ignores .git)
// ------------------------------------------------------------
function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  for (const item of fs.readdirSync(src)) {
    if (item === ".git") continue; // safety

    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);

    if (fs.lstatSync(srcPath).isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      // Inject env only for HTML files
      if (item.endsWith(".html")) {
        let html = fs.readFileSync(srcPath, "utf8");
        html = replaceEnv(html);
        fs.writeFileSync(destPath, html);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

function copyTemplate() {
  console.log(`📁 Copying template folder...`);
  copyRecursive(TEMPLATE_DIR, TARGET_DIR);
}


// ------------------------------------------------------------
// Commit + Push
// ------------------------------------------------------------
function commitAndPush() {
  execSync(`git -C ${TARGET_DIR} config user.email "automation@ready4exam.com"`);
  execSync(`git -C ${TARGET_DIR} config user.name "R4E Automation Bot"`);

  try {
    execSync(`git -C ${TARGET_DIR} add .`, { stdio: "inherit" });
    execSync(
      `git -C ${TARGET_DIR} commit -m "🔄 Auto-update for Class ${CLASS}"`,
      { stdio: "inherit" }
    );
  } catch {
    console.log("ℹ️ No changes to commit.");
  }

  console.log("⬆️ Pushing...");
  execSync(`git -C ${TARGET_DIR} push`, { stdio: "inherit" });

  console.log(`🎉 Class ${CLASS} Repo Updated Successfully`);
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
