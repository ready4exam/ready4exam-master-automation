/**
 * Automation Tool 1 — Frontend Builder & Curriculum Generator
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { Octokit } from "@octokit/rest";
import { generateCurriculumForClass } from "./generateCurriculum.js";

// ─── Environment ────────────────────────────────────────────────
const CLASS = process.env.CLASS || "11";
const OWNER = process.env.GITHUB_OWNER || "ready4exam";
const TOKEN = process.env.PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error("❌ Missing GitHub token");
  process.exit(2);
}
const octokit = new Octokit({ auth: TOKEN });

// ─── Path setup ─────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceDir = path.resolve(__dirname, "../template");
const tempDir = path.resolve(__dirname, "temp_repo");

// ─── Main ───────────────────────────────────────────────────────
async function main() {
  console.log(`🚀 Starting automation for Class ${CLASS}`);
  const repoName = `ready4exam-${CLASS}`;
  const fullRepo = `${OWNER}/${repoName}`;

  // 1️⃣ Check or create repo
  try {
    await octokit.repos.get({ owner: OWNER, repo: repoName });
    console.log(`✅ Repository exists: ${fullRepo}`);
  } catch {
    console.log(`🆕 Creating repository: ${fullRepo}`);
    await octokit.request("POST /user/repos", {
      name: repoName,
      private: false,
      description: `Ready4Exam Frontend for Class ${CLASS}`,
    });
  }

  // 2️⃣ Prepare temp folder
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir);
  execSync(`cp -r "${sourceDir}/." "${tempDir}/"`);
  console.log("✅ Template copied");

  // 3️⃣ Generate curriculum
  const curriculumData = await generateCurriculumForClass(CLASS);

  // 4️⃣ Write curriculum.js
  const curriculumFile = path.join(tempDir, "js", "curriculum.js");
  const jsOut =
    `// Auto-generated curriculum for Class ${CLASS}\n\nexport const curriculum = ` +
    JSON.stringify(curriculumData, null, 2) +
    ";\n";
  fs.writeFileSync(curriculumFile, jsOut);
  console.log("✅ curriculum.js written");

  // 5️⃣ Patch index.html
  const indexFile = path.join(tempDir, "index.html");
  if (fs.existsSync(indexFile)) {
    let html = fs.readFileSync(indexFile, "utf8");

    // Replace any previous Class x label
    html = html.replace(/Class\s\d+/gi, `Class ${CLASS}`);
    html = html.replace(
      /<head>/i,
      `<head>\n  <!-- Auto-generated for Class ${CLASS} on ${new Date().toISOString()} -->`
    );

    // Add Stream Selector for Class 11 / 12
    if (["11", "12"].includes(CLASS)) {
      const streamUI = `
      <section id="stream-selection" class="text-center my-10">
        <h2 class="text-2xl font-bold mb-4">Select Your Stream</h2>
        <div class="flex justify-center gap-6">
          <button class="stream-btn bg-blue-500 text-white px-6 py-2 rounded-xl" data-stream="Science">Science</button>
          <button class="stream-btn bg-green-500 text-white px-6 py-2 rounded-xl" data-stream="Commerce">Commerce</button>
          <button class="stream-btn bg-purple-500 text-white px-6 py-2 rounded-xl" data-stream="Humanities">Humanities</button>
        </div>
      </section>
      <script>
        document.querySelectorAll('.stream-btn').forEach(btn=>{
          btn.addEventListener('click',e=>{
            const stream = e.target.dataset.stream;
            localStorage.setItem('selectedStream', stream);
            window.location.href = 'chapter-selection.html';
          });
        });
      </script>`;
      html = html.replace(/<\/body>/i, `${streamUI}\n</body>`);
      console.log("✅ Stream UI added");
    }

    fs.writeFileSync(indexFile, html, "utf8");
  }

  // 6️⃣ Git commit and push
  process.chdir(tempDir);
  execSync("git init");
  execSync("git config user.name 're4exam-bot'");
  execSync("git config user.email 'bot@ready4exam.com'");
  execSync("git add .");
  execSync(`git commit -m "Auto-generated frontend for Class ${CLASS}"`);
  const repoUrl = `https://${TOKEN}@github.com/${fullRepo}.git`;
  execSync(`git remote add origin "${repoUrl}"`);
  execSync("git branch -M main");
  execSync("git push -u origin main --force");
  console.log(`🎉 Deployed/updated → https://github.com/${fullRepo}`);
}

main().catch((e) => {
  console.error("❌ Error in createClassRepo.js:", e);
  process.exit(1);
});
