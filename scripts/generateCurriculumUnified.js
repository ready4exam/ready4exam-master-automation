// scripts/generateCurriculumUnified.js
// Usage: CLASS=9 node scripts/generateCurriculumUnified.js
// Writes template/js/curriculum.js using static curriculum JSONs
import fs from "fs";
import path from "path";

const cls = process.env.CLASS;
if (!cls) {
  console.error("❌ Error: CLASS environment variable not set.");
  process.exit(1);
}

const classNum = Number(cls);
if (Number.isNaN(classNum)) {
  console.error("❌ CLASS must be numeric.");
  process.exit(1);
}

const baseDir = process.cwd();
const staticDir = path.join(baseDir, "static_curriculum");

// Decide source JSON
let sourceJsonFile = null;
if (classNum >= 5 && classNum <= 10) {
  sourceJsonFile = path.join(baseDir, "curriculum_7th.json");
} else if (classNum === 11 || classNum === 12) {
  sourceJsonFile = path.join(baseDir, "curriculum_11th.json");
} else {
  // If a per-class JSON exists in static_curriculum/classX/curriculum.json, prefer that
  const perClassPath = path.join(staticDir, `class${classNum}`, "curriculum.json");
  if (fs.existsSync(perClassPath)) {
    sourceJsonFile = perClassPath;
  } else {
    console.error(`❌ No curriculum mapping for class ${classNum}. Provide curriculum_7th.json or curriculum_11th.json or per-class JSON.`);
    process.exit(1);
  }
}

if (!fs.existsSync(sourceJsonFile)) {
  console.error("❌ Source JSON not found:", sourceJsonFile);
  process.exit(1);
}

try {
  const data = JSON.parse(fs.readFileSync(sourceJsonFile, "utf8"));
  const templatePath = path.join(baseDir, "template", "js", "curriculum.js");
  const content = `// Auto-generated curriculum for Class ${classNum}\n// Source: ${path.basename(sourceJsonFile)}\n// Generated: ${new Date().toISOString()}\n\nexport const curriculum = ${JSON.stringify(data, null, 2)};\n\nexport default curriculum;\n`;
  // Ensure template dir exists
  fs.mkdirSync(path.dirname(templatePath), { recursive: true });
  fs.writeFileSync(templatePath, content, "utf8");
  console.log(`✅ curriculum.js written successfully to ${templatePath}`);
} catch (err) {
  console.error("❌ Failed to parse or write curriculum:", err.message);
  process.exit(1);
}
