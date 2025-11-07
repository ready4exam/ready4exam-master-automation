/**
 * Ready4Exam Automation Tool — Class Repo Generator
 * Dynamically builds frontend repos (Class 5–12)
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { Octokit } from "@octokit/rest";
import { generateCurriculumForClass } from "./generateCurriculum.js";

const CLASS = process.env.CLASS || "11";
const OWNER = process.env.GITHUB_OWNER || "ready4exam";
const REPO_NAME = `ready4exam-${CLASS}`;
const TOKEN = process.env.PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error("❌ Missing GitHub authentication token.");
  process.exit(2);
}

const octokit = new Octokit({ auth: TOKEN });

async function main() {
  console.log(`🚀 Starting automation for Class ${CLASS}`);
  const fullRepoName = `${OWNER}/${REPO_NAME}`;

  // 1️⃣ Ensure repo exists
  let repoExists = false;
  try {
    await octokit.repos.get({ owner: OWNER, repo: REPO_NAME });
    repoExists = true;
    console.log(`✅ Repository already exists: ${fullRepoName}`);
  } catch {
    console.log(`🆕 Repository does not exist — creating under personal account: ${fullRepoName}`);
    try {
      const created = await octokit.repos.createForAuthenticatedUser({
        name: REPO_NAME,
        private: false,
        description: `Ready4Exam Frontend for Class ${CLASS}`,
      });
      console.log(`✅ Successfully created repo: ${created.data.full_name}`);
    } catch (err) {
      console.error(`❌ Failed to create repository. Check PAT permissions: ${err.message}`);
      process.exit(1);
    }
  }

// 2️⃣ Prepare temporary folder
const sourceDir = path.join(process.cwd(), "template");
const tempDir = path.join(process.cwd(), "temp_repo");

if (!fs.existsSync(sourceDir)) {
  console.error(`❌ Template folder not found at ${sourceDir}`);
  process.exit(1);
}

fs.rmSync(tempDir, { recursive: true, force: true });
fs.mkdirSync(tempDir, { recursive: true });
execSync(`cp -r ${sourceDir}/. ${tempDir}/`);
console.log("✅ Template copied successfully.");
  
  // 3️⃣ Update index.html dynamically
  const indexPath = path.join(tempDir, "index.html");
  if (fs.existsSync(indexPath)) {
    let indexContent = fs.readFileSync(indexPath, "utf-8");
    indexContent = indexContent
      .replace(/Class\s+\d+/gi, `Class ${CLASS}`)
      .replace(/CBSE Class Syllabus/gi, `CBSE Class ${CLASS} Syllabus`)
      .replace(/CBSE Class Portal/gi, `CBSE Class ${CLASS} Portal`)
      .replace(/Academic Study Portal/gi, `Academic Study Portal — Class ${CLASS}`);
    fs.writeFileSync(indexPath, indexContent);
    console.log("✅ Updated index.html with correct class name.");
  }

  // 4️⃣ Generate curriculum.js using Gemini
  console.log("🧠 Generating curriculum using Gemini API...");
  const curriculumData = await generateCurriculumForClass(CLASS);

  const curriculumFile = path.join(tempDir, "js", "curriculum.js");
  fs.mkdirSync(path.dirname(curriculumFile), { recursive: true });
  fs.writeFileSync(
    curriculumFile,
    `// Auto-generated curriculum for Class ${CLASS}\n\nexport const curriculum = ${JSON.stringify(curriculumData, null, 2)};\n`
  );
  console.log("✅ curriculum.js created successfully.");

  // 5️⃣ Initialize Git, commit, push
  process.chdir(tempDir);
  execSync("git init");
  execSync("git config user.name 'ready4exam-bot'");
  execSync("git config user.email 'bot@ready4exam.com'");
  execSync("git add .");
  execSync(`git commit -m "Auto-generated frontend for Class ${CLASS}"`);
  const repoUrl = `https://${TOKEN}@github.com/${fullRepoName}.git`;
  execSync(`git remote add origin ${repoUrl}`);
  execSync("git branch -M main");
  execSync("git push -u origin main --force");

  console.log(`🎉 Successfully deployed: https://github.com/${fullRepoName}`);
}

main().catch((err) => {
  console.error("❌ Error in createClassRepo.js:", err);
  process.exit(1);
});
