/**
 * Automation Tool 1 — Full Front-End and Curriculum Generator
 * Version: Stable with Dynamic Class Injection + Gemini Curriculum Update
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { Octokit } from "@octokit/rest";
import { generateCurriculumForClass } from "./generateCurriculum.js";

// Environment setup
const CLASS = process.env.CLASS || "11";
const OWNER = process.env.GITHUB_OWNER || "ready4exam";
const TOKEN =
  process.env.PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error("❌ Missing GitHub authentication token (PERSONAL_ACCESS_TOKEN or GITHUB_TOKEN).");
  process.exit(2);
}

// Initialize Octokit
const octokit = new Octokit({ auth: TOKEN });

// Path setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Correct root-level template resolution
const sourceDir = path.resolve(__dirname, "../template");
const tempDir = path.resolve(__dirname, "temp_repo");

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
  console.log("📁 Preparing temporary working directory...");
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir);
  execSync(`cp -r "${sourceDir}/." "${tempDir}/"`);
  console.log("✅ Template copied successfully");

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

  // 5️⃣ Inject Class name into index.html
  const indexFile = path.join(tempDir, "index.html");
  if (fs.existsSync(indexFile)) {
    let html = fs.readFileSync(indexFile, "utf8");

    // Replace any previous Class reference (e.g., "Class 9")
    html = html.replace(/Class\s\d+/gi, `Class ${CLASS}`);

    // Add metadata comment for clarity
    html = html.replace(
      /<head>/i,
      `<head>\n  <!-- Auto-generated for Class ${CLASS} on ${new Date().toISOString()} -->`
    );

    fs.writeFileSync(indexFile, html, "utf8");
    console.log("✅ index.html updated for Class " + CLASS);
  } else {
    console.warn("⚠️ index.html not found in template directory!");
  }

  // 6️⃣ Commit and push to GitHub
  process.chdir(tempDir);
  execSync("git init");
  execSync('git config user.name "ready4exam-bot"');
  execSync('git config user.email "bot@ready4exam.com"');
  execSync("git add .");
  execSync(`git commit -m "Auto-generated frontend and curriculum for Class ${CLASS}"`);

  const repoUrl = `https://${TOKEN}@github.com/${fullRepoName}.git`;
  execSync(`git remote add origin "${repoUrl}"`);
  execSync("git branch -M main");
  execSync("git push -u origin main --force");

  console.log(`🎉 Successfully created/updated: https://github.com/${fullRepoName}`);
}

// Main runner
main().catch((err) => {
  console.error("❌ Error in createClassRepo.js:", err.message);
  process.exit(1);
});
