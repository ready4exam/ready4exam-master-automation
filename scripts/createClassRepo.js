// scripts/createClassRepo.js
// ------------------------------------------------------------
// Ready4Exam - Class Repo Automation
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

const ROOT = process.cwd();
const TEMPLATE_DIR = path.join(ROOT, "template");
const OUTPUT_DIR = path.join(ROOT, "output");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

const REPO_NAME = `ready4exam-class-${CLASS}`;
const CLONE_URL = `https://${GITHUB_TOKEN}:x-oauth-basic@github.com/${REPO_OWNER}/${REPO_NAME}.git`;
const TARGET_DIR = path.join(OUTPUT_DIR, REPO_NAME);

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
  "{{CLASS}}": CLASS
};

// ------------------------------------------------------------
async function ensureRepoExists() {
  const apiURL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
  const headers = {
    Authorization: `token ${GITHUB_TOKEN}`,
    "User-Agent": "Ready4Exam Automation",
    Accept: "application/vnd.github+json",
  };

  const res = await fetch(apiURL, { headers });
  if (res.status === 200) return console.log(`✅ Repo exists`);

  if (res.status === 404) {
    console.log(`📦 Creating repo → ${REPO_NAME}`);
    await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: REPO_NAME, private: false, auto_init: true }),
    });
    return console.log(`🎉 Repo created`);
  }

  console.error(await res.text());
  process.exit(1);
}

// ------------------------------------------------------------
function applyReplacementsToFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  for (const [key, value] of Object.entries(replacements))
    content = content.replace(new RegExp(key, "g"), value);
  fs.writeFileSync(filePath, content, "utf8");
}

// ------------------------------------------------------------
// 🔥 THE IMPORTANT PART — CURRICULUM OVERRIDE FIX
// ------------------------------------------------------------
function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  for (const item of fs.readdirSync(src)) {
    const srcPath  = path.join(src, item);
    const destPath = path.join(dest, item);

    if (item === "curriculum.js") {
      const generated = path.join(ROOT, "classes_repo", `class${CLASS}`, "js", "curriculum.js`);

      if (fs.existsSync(generated)) {
        console.log(`🔁 Using BUILT curriculum.js for Class ${CLASS}`);
        fs.copyFileSync(generated, destPath);
      } else {
        console.log(`⚠ No built curriculum found → using template`);
        fs.copyFileSync(srcPath, destPath);
      }
      continue;
    }

    if (fs.lstatSync(srcPath).isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      if (destPath.endsWith(".js") || destPath.endsWith(".html"))
        applyReplacementsToFile(destPath);
    }
  }
}

// ------------------------------------------------------------
function cloneOrPullRepo() {
  if (!fs.existsSync(TARGET_DIR)) {
    execSync(`git clone ${CLONE_URL} ${TARGET_DIR}`, { stdio: "inherit" });
  } else {
    execSync(`git -C ${TARGET_DIR} pull`, { stdio: "inherit" });
  }
}

function commitAndPush() {
  execSync(`git -C ${TARGET_DIR} config user.email "automation@ready4exam.com"`);
  execSync(`git -C ${TARGET_DIR} config user.name "R4E Automation Bot"`);

  try {
    execSync(`git -C ${TARGET_DIR} add .`, { stdio: "inherit" });
    execSync(`git -C ${TARGET_DIR} commit -m "🚀 Auto Build: Class ${CLASS} Curriculum Update"`, { stdio: "inherit" });
  } catch {
    return console.log("ℹ️ No changes — nothing to commit");
  }

  execSync(`git -C ${TARGET_DIR} push`, { stdio: "inherit" });
  console.log(`🎉 Class ${CLASS} deployment complete`);
}

// ------------------------------------------------------------
async function run() {
  await ensureRepoExists();
  cloneOrPullRepo();
  copyRecursive(TEMPLATE_DIR, TARGET_DIR);
  commitAndPush();
}
run();
