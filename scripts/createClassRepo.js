// scripts/createClassRepo.js
// -----------------------------------------------------------------------------
// Builds and pushes a new class repository from the /template folder
// Copies the correct curriculum.js for the selected class before packaging
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const cls = process.env.CLASS;
if (!cls) {
  console.error("❌ Error: CLASS environment variable not set.");
  process.exit(1);
}

console.log(`⚙️ Running createClassRepo.js for class=${cls}`);

const baseDir = process.cwd();
const templateDir = path.join(baseDir, "template");
const tempRepoDir = path.join(baseDir, "temp_repo", `class${cls}`);
const OWNER = "ready4exam"; // 👈 PERSONAL ACCOUNT OWNER

// -----------------------------------------------------------------------------
// STEP 1 — Copy correct curriculum for this class
// -----------------------------------------------------------------------------
const sourceCurriculum = path.join(baseDir, "static_curriculum", `class${cls}`, "curriculum.js");
const targetCurriculum = path.join(templateDir, "js", "curriculum.js");

console.log(`[Curriculum] Preparing curriculum for class${cls}`);
if (!fs.existsSync(sourceCurriculum)) {
  console.error(`❌ Missing source curriculum: ${sourceCurriculum}`);
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
// STEP 4 — Create repo if not exists (PERSONAL ACCOUNT FIX)
// -----------------------------------------------------------------------------
const repoName = `ready4exam-${cls}`;
const repoUrl = `https://github.com/${OWNER}/${repoName}.git`;

console.log(`🔍 Checking if repo exists on GitHub...`);

const headers = {
  Authorization: `token ${process.env.GITHUB_TOKEN}`,
  "Content-Type": "application/json"
};

// Check repo existence
try {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${repoName}`, {
    headers
  });

  if (res.ok) {
    console.log(`📌 Repo already exists. Skipping creation.`);
  } else {
    console.log(`🆕 Creating GitHub repo...`);
    const createRes = await fetch(`https://api.github.com/user/repos`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: repoName,
        private: false
      })
    });

    if (!createRes.ok) {
      console.error(await createRes.text());
      throw new Error("Failed to create repo.");
    }

    console.log(`🎯 Repo created successfully: ${repoUrl}`);
  }
} catch (err) {
  console.error("❌ GitHub API error:", err.message);
  process.exit(1);
}

// -----------------------------------------------------------------------------
// STEP 5 — Commit & push
// -----------------------------------------------------------------------------
try {
  execSync(`git init`, { cwd: tempRepoDir });
  execSync(`git config user.email "automation@ready4exam.org"`, { cwd: tempRepoDir });
  execSync(`git config user.name "ready4exam-bot"`, { cwd: tempRepoDir });

  execSync(`git add .`, { cwd: tempRepoDir });
  execSync(`git commit -m "Automated build for Class ${cls}"`, { cwd: tempRepoDir });
  execSync(`git branch -M main`, { cwd: tempRepoDir });

  execSync(
    `git push -f https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/${OWNER}/${repoName}.git main`,
    { cwd: tempRepoDir }
  );

  console.log(`🎉 Successfully pushed Class ${cls} repo to GitHub.`);
} catch (err) {
  console.error(`❌ Git push failed: ${err.message}`);
  process.exit(1);
}
