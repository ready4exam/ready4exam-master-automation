// scripts/generateCurriculumJS.js
import fs from "fs";
import path from "path";

const cls = process.env.CLASS;
if (!cls) {
  console.error("❌ Error: CLASS environment variable not set.");
  process.exit(1);
}

const baseDir = process.cwd();
const staticPath = path.join(baseDir, "static_curriculum", "class" + cls, "curriculum.json");
const templatePath = path.join(baseDir, "template", "js", "curriculum.js");

console.log(`🧠 Generating curriculum.js for Class ${cls}`);
console.log(`📘 Source JSON: ${staticPath}`);

if (!fs.existsSync(staticPath)) {
  console.error(`❌ File not found: ${staticPath}`);
  process.exit(1);
}

try {
  const data = JSON.parse(fs.readFileSync(staticPath, "utf8"));
  const content = `// Auto-generated curriculum for Class ${cls}\nexport const curriculum = ${JSON.stringify(data, null, 2)};\n`;
  fs.writeFileSync(templatePath, content, "utf8");
  console.log(`✅ curriculum.js written successfully to template/js/curriculum.js`);
} catch (err) {
  console.error("❌ Failed to parse or write curriculum:", err.message);
  process.exit(1);
}
