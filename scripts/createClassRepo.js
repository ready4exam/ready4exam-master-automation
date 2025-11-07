/**
 * Automation Tool 1 — Full Front-End and Curriculum Generator
 * Version: Personal account compatible (no organization required)
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { Octokit } from "@octokit/rest";
import { generateCurriculumForClass } from "./generateCurriculum.js";

// --- START: Update 1 ---
// Changed GITHUB_OWNER to OWNER to match the YAML environment variable name
const CLASS = process.env.CLASS || "11";
const OWNER = process.env.OWNER || "ready4exam"; // <-- Updated variable name
// --- END: Update 1 ---

const TOKEN =
  process.env.PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error("❌ Missing GitHub authentication token (PERSONAL_ACCESS_TOKEN or GITHUB_TOKEN).");
  process.exit(2);
}

const octokit = new Octokit({ auth: TOKEN });

async function main() {
  console.log(`🚀 Starting automation for Class ${CLASS}`);
  const repoName = `ready4exam-${CLASS}`;
  const fullRepoName = `${OWNER}/${repoName}`;

  // 1️⃣ Check if repository exists
  let repoExists = false;
  try {
    await octokit.repos.get({ owner: OWNER, repo: repoName });
    repoExists = true;
    console.log(`✅ Repository already exists: ${fullRepoName}`);
  } catch {
    console.log(`🆕 Repository does not exist — creating under personal account: ${fullRepoName}`);

    try {
      // ✅ Use /user/repos instead of /orgs/{org}/repos (for personal accounts)
      await octokit.request("POST /user/repos", {
        name: repoName,
        private: false,
        description: `Ready4Exam Frontend for Class ${CLASS}`,
      });
      console.log(`✅ Successfully created repo: ${fullRepoName}`);
    } catch (createErr) {
      console.error("❌ Failed to create repository. Check PAT permissions:", createErr.message);
      console.error("Required scopes: repo, admin:repo_hook, workflow");
      throw createErr;
    }
  }

  // 2️⃣ Prepare temporary folder
  // ✅ fix: make sure we use the root-level 'template' directory
  const sourceDir = path.join(process.cwd(), "../template");
  const tempDir = path.join(process.cwd(), "temp_repo");
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir);
  execSync(`cp -r "${sourceDir}/." "${tempDir}/"`);

  // 3️⃣ Generate curriculum via Gemini
  console.log("🧠 Generating curriculum for class via Gemini...");
  const curriculumData = await generateCurriculumForClass(CLASS);

  // 4️⃣ Write curriculum.js
  const curriculumFile = path.join(tempDir, "js", "curriculum.js");
  const curriculumContent =
    `// Auto-generated curriculum for Class ${CLASS}\n\nexport const curriculum = ` +
    JSON.stringify(curriculumData, null, 2) +
    ";\n";
  fs.writeFileSync(curriculumFile, curriculumContent);
  console.log("✅ curriculum.js created successfully");

  // 5️⃣ Commit and push changes
  process.chdir(tempDir);
  execSync("git init");
  execSync('git config user.name "ready4exam-bot"');
  execSync('git config user.email "bot@ready4exam.com"');
  execSync("git add .");
  execSync(`git commit -m "Auto-generated frontend and curriculum for Class ${CLASS}"`);

  // Use the OWNER and TOKEN variables for the push URL
  const repoUrl = `https://${TOKEN}@github.com/${OWNER}/${repoName}.git`; // <-- Updated path to use OWNER
  execSync(`git remote add origin "${repoUrl}"`);
  execSync("git branch -M main");
  execSync("git push -u origin main --force");

  console.log(`🎉 Successfully created/updated: https://github.com/${fullRepoName}`);
}

main().catch((err) => {
  console.error("❌ Error in createClassRepo.js:", err.message);
  process.exit(1);
});
