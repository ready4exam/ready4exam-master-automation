// scripts/createClassRepo.js
// -----------------------------------------------------------------------------
// Builds and pushes a new class repository from the /template folder
// Copies correct curriculum.js for the selected class & auto-creates repo if missing
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import fetch from "node-fetch";

const cls = process.env.CLASS;
const token = process.env.GITHUB_TOKEN;

if (!cls) {
  console.error("❌ CLASS environment variable not set.");
  process.exit(1);
}
if (!token) {
  console.error("❌ GITHUB_TOKEN missing.");
  process.exit(1);
}

console.log(`⚙️ Running createClassRepo.js for class=${cls}`);

const baseDir = process.cwd();
const templateDir = path.join(baseDir, "template");
const tempRepoDir = path.join(baseDir, "temp_repo", `class${cls}`);
const ORG = "ready4exam";
const repoName = `ready4exam-${cls}`;
const repoUrl = `https://github.com/${ORG}/${repoName}.git`;

// -----------------------------------------------------------------------------
// STEP 0 — Ensure repo exists or create it
// -----------------------------------------------------------------------------
async function ensureRepoExists() {
  console.log("🔍 Checking if repo exists on GitHub...");

  const check = await fetch(`https://api.github.com/repos/${ORG}/${repoName}`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "ready4exam-bot"
    }
  });

  if (check.status === 200) {
    console.log("ℹ️ Repo already exists — will update it.");
    return;
  }

  console.log("🆕 Creating GitHub repo...");
  const create = await fetch(`https://api.github.com/orgs/${ORG}/repos`, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "ready4exam-bot"
    },
    body: JSON.stringify({
      name: repoName,
      private: false,
      auto_init: false
    })
  });

  if (!create.ok) {
    console.error(await create.text());
    throw new Error("❌ Failed to create repo.");
  }

  console.log(`✔ Repo created: ${repoUrl}`);
}

// -----------------------------------------------------------------------------
// STEP 1 — Copy correct curriculum for this class
// -----------------------------------------------------------------------------
const sourceCurriculum = path.join(baseDir, "static_curriculum", `class${cls}`, "curriculum.js");
const targetCurriculum = path.join(templateDir, "js", "curriculum.js");

console.log(`[Curriculum] Preparing curriculum for class${cls}`);
if (!fs.existsSync(sourceCurriculum)) {
  console.error(`❌ Missing: ${sourceCurriculum}`);
  process.exit(1);
}

fs.copyFileSync(sourceCurriculum, targetCurriculum);
console.log(`[Curriculum] Copied ${sourceCurriculum} → ${targetCurriculum}`);

// -----------------------------------------------------------------------------
// STEP 2 — Prepare temp repo folder
// -----------------------------------------------------------------------------
if (fs.existsSync(tempRepoDir)) fs.rmSync(tempRepoDir, { recursive: true, force: true });
fs.mkdirSync(tempRepoDir, { recursive: true });
fs.cpSync(templateDir, tempRepoDir, { recursive: true });
console.log(`✅ Template copied successfully.`);

// -----------------------------------------------------------------------------
// STEP 3 — Update index.html with class reference
// -----------------------------------------------------------------------------
const indexPath = path.join(tempRepoDir, "index.html");
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, "utf8");
  html = html.replace(/Class\s\d+/gi, `Class ${cls}`);
  fs.writeFileSync(indexPath, html, "utf8");
  console.log(`✅ Updated index.html with Class ${cls}`);
}

// -----------------------------------------------------------------------------
// STEP 4 — Git Push
// -----------------------------------------------------------------------------
async function pushRepo() {
  try {
    execSync(`git init`, { cwd: tempRepoDir });
    execSync(`git config user.email "automation@ready4exam.org"`, { cwd: tempRepoDir });
    execSync(`git config user.name "ready4exam-bot"`, { cwd: tempRepoDir });

    execSync(`git add .`, { cwd: tempRepoDir });
    execSync(`git commit -m "Automated build for Class ${cls}"`, { cwd: tempRepoDir });

    execSync(`git branch -M main`, { cwd: tempRepoDir });

    console.log("📤 Pushing to GitHub...");
    execSync(`git remote add origin https://x-access-token:${token}@github.com/${ORG}/${repoName}.git`, {
      cwd: tempRepoDir
    });

    execSync(`git push -f origin main`, { cwd: tempRepoDir });

    console.log(`🎉 Successfully pushed Class ${cls} repo.`);
  } catch (err) {
    throw new Error(`❌ Git push failed: ${err.message}`);
  }
}

// -----------------------------------------------------------------------------
// RUN ALL
// -----------------------------------------------------------------------------
ensureRepoExists()
  .then(pushRepo)
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
