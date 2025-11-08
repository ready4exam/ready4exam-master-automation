// scripts/generateCurriculum.js
import fs from "fs";
import path from "path";

/**
 * Ready4Exam Static Curriculum Generator
 * --------------------------------------
 * This version:
 *  - Copies pre-maintained curriculum.js from /static_curriculum/classX/
 *  - Ensures every class repo (5–12) uses the correct NCERT syllabus
 *  - Skips Gemini API or auto-generation completely
 *  - Guarantees consistent structure across runs
 */

export async function generateCurriculumForClass(cls) {
  const classFolder = `class${cls}`;
  const projectRoot = process.cwd();
  const srcFile = path.join(projectRoot, "static_curriculum", classFolder, "curriculum.js");
  const destDir = path.join(projectRoot, "temp_repo", "js");
  const destFile = path.join(destDir, "curriculum.js");

  console.log(`📘 Preparing curriculum for Class ${cls}...`);
  fs.mkdirSync(destDir, { recursive: true });

  // ✅ Check existence of the manual curriculum
  if (!fs.existsSync(srcFile)) {
    console.error(`❌ curriculum.js missing at: static_curriculum/${classFolder}/curriculum.js`);
    console.warn("ℹ️ Please create the file manually before running automation.");
    console.warn("Example path:", `ready4exam-master-automation/static_curriculum/${classFolder}/curriculum.js`);
    console.warn(`
      Example format:
      export const curriculum = {
        "Science": [
          { "chapter_title": "Motion", "table_id": "", "section": "" }
        ]
      };
    `);
    // Write an empty fallback to avoid pipeline break
    fs.writeFileSync(destFile, `// Empty fallback for Class ${cls}\nexport const curriculum = {};\n`);
    return {};
  }

  try {
    fs.copyFileSync(srcFile, destFile);
    console.log(`✅ curriculum.js successfully copied from static_curriculum/${classFolder}/`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to copy curriculum.js for Class ${cls}:`, err.message);
    console.log("⚠️ Writing fallback empty file instead to keep build running...");
    fs.writeFileSync(destFile, `// Error fallback for Class ${cls}\nexport const curriculum = {};\n`);
    return {};
  }
}
