// scripts/createClassRepo.js
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const baseDir = process.cwd();
const classes = [5, 6, 7, 8, 9, 10, 11, 12];
const templateDir = path.join(baseDir, "template");
const tempRepoBase = path.join(baseDir, "temp_repo");

console.log("⚙️ Starting Ready4Exam Automation for Classes 5–12...");

for (const cls of classes) {
  try {
    console.log(`\n🚀 Building repo for Class ${cls}`);

    const tempRepoDir = path.join(tempRepoBase, `class${cls}`);
    const jsDir = path.join(tempRepoDir, "js");
    const curriculumSrc = path.join(baseDir, "temp_repo", `class${cls}`, "js", "curriculum.js");

    if (!fs.existsSync(curriculumSrc)) {
      console.warn(`⚠️ curriculum.js missing for Class ${cls}, skipping...`);
      continue;
    }

    // Copy template to temp_repo
    fs.cpSync(templateDir, tempRepoDir, { recursive: true });
    fs.mkdirSync(jsDir, { recursive: true });

    // Copy curriculum.js
    fs.copyFileSync(curriculumSrc, path.join(jsDir, "curriculum.js"));
    console.log(`✅ Template and curriculum.js prepared for Class ${cls}`);

    // Initialize git repo and push
    execSync(`git init`, { cwd: tempRepoDir });
    execSync(`git config user.name "ready4exam-bot"`, { cwd: tempRepoDir });
    execSync(`git config user.email "automation@ready4exam.org"`, { cwd: tempRepoDir });

    execSync(`git add .`, { cwd: tempRepoDir });
    execSync(`git commit -m "Auto-generated Ready4Exam Class ${cls}"`, { cwd: tempRepoDir });

    const remoteUrl = `https://github.com/ready4exam/ready4exam-${cls}.git`;
    execSync(`git remote add origin ${remoteUrl}`, { cwd: tempRepoDir });

    try {
      execSync(`git branch -M main`, { cwd: tempRepoDir });
    } catch (e) {}

    execSync(`git push -f origin main`, { cwd: tempRepoDir });
    console.log(`✅ Successfully pushed Class ${cls} repository.`);
  } catch (err) {
    console.error(`❌ Error building Class ${cls}:`, err.message);
  }
}

console.log("🏁 All class repositories processed successfully!");
