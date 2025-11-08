// scripts/convertCurriculumToJSON.js
import fs from "fs";
import path from "path";

const baseDir = path.join(process.cwd(), "static_curriculum");

// Get all folders like class5, class6, etc.
const classes = fs
  .readdirSync(baseDir)
  .filter(f => f.startsWith("class") && fs.statSync(path.join(baseDir, f)).isDirectory());

for (const folder of classes) {
  const jsPath = path.join(baseDir, folder, "curriculum.js");
  const jsonPath = path.join(baseDir, folder, "curriculum.json");

  if (!fs.existsSync(jsPath)) {
    console.log(`⚠️  No JS file found for ${folder}, skipping.`);
    continue;
  }

  console.log(`🔄 Converting ${jsPath} → ${jsonPath}`);

  try {
    let content = fs.readFileSync(jsPath, "utf8");

    // Remove export syntax and semicolons
    content = content
      .replace(/^\/\/.*$/gm, "") // remove // comments
      .replace(/^.*?export\s+const\s+curriculum\s*=\s*/, "")
      .replace(/;?\s*$/, "");

    // Parse using eval since we control the file
    const obj = eval("(" + content + ")");
    const jsonStr = JSON.stringify(obj, null, 2);

    fs.writeFileSync(jsonPath, jsonStr, "utf8");
    console.log(`✅ Wrote: ${jsonPath}`);
  } catch (err) {
    console.error(`❌ Failed to convert ${folder}: ${err.message}`);
  }
}

console.log("✨ Conversion complete!");
