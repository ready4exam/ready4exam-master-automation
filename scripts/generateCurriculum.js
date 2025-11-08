// scripts/generateCurriculumJS.js
import fs from "fs";
import path from "path";

const baseDir = process.cwd();
const staticDir = path.join(baseDir, "static_curriculum");
const templateDir = path.join(baseDir, "template", "js");

// Ensure target dir exists
if (!fs.existsSync(templateDir)) fs.mkdirSync(templateDir, { recursive: true });

const classes = [5, 6, 7, 8, 9, 10, 11, 12];
console.log("🧠 Generating curriculum.js files for all classes...");

for (const cls of classes) {
  try {
    const jsonPath = path.join(staticDir, `class${cls}`, "curriculum.json");
    if (!fs.existsSync(jsonPath)) {
      console.warn(`⚠️ Missing: ${jsonPath} — skipping this class`);
      continue;
    }

    const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const outputDir = path.join(baseDir, "temp_repo", `class${cls}`, "js");
    const outputFile = path.join(outputDir, "curriculum.js");

    fs.mkdirSync(outputDir, { recursive: true });

    const jsContent = `// Auto-generated curriculum for Class ${cls}\nexport const curriculum = ${JSON.stringify(jsonData, null, 2)};\n`;

    fs.writeFileSync(outputFile, jsContent, "utf8");
    console.log(`✅ curriculum.js generated for Class ${cls}`);
  } catch (err) {
    console.error(`❌ Error generating curriculum for Class ${cls}:`, err.message);
  }
}

console.log("🏁 All available curriculums processed successfully.");
