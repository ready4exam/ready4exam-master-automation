// scripts/generateCurriculumJS.js
// -----------------------------------------------------------------------------
// Converts static JSON curriculum files into JS modules with named + default export
// -----------------------------------------------------------------------------
// Usage: node scripts/generateCurriculumJS.js
// Output: static_curriculum/classX/curriculum.js for each available JSON
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";

const BASE_DIR = path.resolve("static_curriculum");
const classes = fs.readdirSync(BASE_DIR).filter((f) => f.startsWith("class"));

for (const classFolder of classes) {
  const jsonPath = path.join(BASE_DIR, classFolder, "curriculum.json");
  const jsPath = path.join(BASE_DIR, classFolder, "curriculum.js");

  if (!fs.existsSync(jsonPath)) {
    console.warn(`⚠️  Missing JSON file for ${classFolder}, skipping.`);
    continue;
  }

  try {
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const jsContent =
`// Auto-generated from ${classFolder}/curriculum.json
// Do not edit manually. Generated on ${new Date().toISOString()}

export const curriculum = ${JSON.stringify(jsonData, null, 2)};

// ✅ Added dual export for flexibility:
export default curriculum;
`;

    fs.writeFileSync(jsPath, jsContent, "utf8");
    console.log(`✅ Generated ${jsPath}`);
  } catch (err) {
    console.error(`❌ Failed to process ${classFolder}:`, err.message);
  }
}

console.log("🎉 Curriculum JS generation complete for all classes.");
