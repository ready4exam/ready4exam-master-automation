/**
 * Automation Tool 1 — Full Front-End and Curriculum Generator
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { Octokit } from "@octokit/rest";
import { generateCurriculumForClass } from "./generateCurriculum.js";

const CLASS = process.env.CLASS || "11";
const OWNER = process.env.GITHUB_OWNER || "ready4exam";
const TARGET_REPO = process.env.TARGET_REPO || `ready4exam-${CLASS}`;
const TOKEN = process.env.PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error("❌ Missing GitHub authentication token.");
  process.exit(2);
}

const octokit = new Octokit({ auth: TOKEN });

async function main() {
  console.log(`🚀 Starting automation for Class ${CLASS}`);
  const repoName = `ready4exam-${CLASS}`;
  const fullRepoName = `${OWNER}/${repoName}`;

  // 1️⃣ Check if repo exists
  let repoExists = false;
  try {
    await octokit.repos.get({ owner: OWNER, repo: repoName });
    repoExists = true;
    console.log(`✅ Repo already exists: ${fullRepoName}`);
  } catch {
    console.log(`🆕 Creating repo: ${fullRepoName}`);
    await octokit.repos.createForAuthenticatedUser({
      name: repoName,
      private: false,
      description: `Ready4Exam Frontend for Class ${CLASS}`,
    });
  }

  // 2️⃣ Prepare local temp folder
  const sourceDir = path.join(process.cwd(), "template");
  const tempDir = path.join(process.cwd(), "temp_repo");
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir);
  execSync(`cp -r ${sourceDir}/. ${tempDir}/`);

  // 3️⃣ Generate curriculum via Gemini
  console.log("🧠 Calling Gemini to generate curriculum...");
  const curriculumData = await generateCurriculumForClass(CLASS);

  // 4️⃣ Write curriculum.js
  const curriculumFile = path.join(tempDir, "js", "curriculum.js");
  const curriculumContent =
    `// Auto-generated curriculum for Class ${CLASS}\n\nexport const curriculum = ` +
    JSON.stringify(curriculumData, null, 2) +
    ";\n";
  fs.writeFileSync(curriculumFile, curriculumContent);
  console.log("✅ curriculum.js created successfully");

  // 5️⃣ Initialize Git, commit, and push
  process.chdir(tempDir);
  execSync("git init");
  execSync("git config user.name 'ready4exam-bot'");
  execSync("git config user.email 'bot@ready4exam.com'");
  execSync("git add .");
  execSync(`git commit -m "Auto-generated frontend and curriculum for Class ${CLASS}"`);
  const repoUrl = `https://${TOKEN}@github.com/${fullRepoName}.git`;
  execSync(`git remote add origin ${repoUrl}`);
  execSync("git branch -M main");
  execSync("git push -u origin main --force");

  console.log(`🎉 Successfully created/updated: https://github.com/${fullRepoName}`);
}

main().catch((err) => {
  console.error("❌ Error in createClassRepo.js:", err);
  process.exit(1);
});
