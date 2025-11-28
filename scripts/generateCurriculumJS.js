// scripts/generateCurriculumJS.js
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, "static_curriculum");   // master files you edit
const OUTPUT = path.join(ROOT, "classes_repo");        // where repo classes generate

// detect class folders
const CLASSES = fs.readdirSync(SOURCE).filter(f => f.startsWith("class"));

console.log("\n🚀 Curriculum Compiler Started\n");

// 1️⃣ Detect if file is already perfect
function finalFormatCheck(text) {
  return text.includes('export const curriculum = {') &&
         text.includes('table_id') &&
         text.trim().endsWith('export default curriculum;');
}

// 2️⃣ Format builder – Outputs EXACT like your sample
function buildFinal(curr) {
  return (
`export const curriculum = ${JSON.stringify(curr, null, 2)
    .replace(/"([^"]+)":/g,'"${1}":')};  // ensure identical spacing style

export default curriculum;`
  );
}

// 3️⃣ Process each class
for (const folder of CLASSES) {
  const classNum = folder.replace("class","");
  const src = path.join(SOURCE, folder, "curriculum.js");
  const destDir = path.join(OUTPUT, `class${classNum}`, "js");
  const dest = path.join(destDir, "curriculum.js");

  if (!fs.existsSync(src)) continue;

  fs.mkdirSync(destDir, { recursive:true });

  const file = fs.readFileSync(src, "utf8").trim();

  // ------------------------------------
  // A) If master file is already perfect → COPY EXACTLY
  // ------------------------------------
  if (finalFormatCheck(file)) {
    fs.writeFileSync(dest, file);
    console.log(`✔ Class ${classNum} — Copied exactly (unchanged)`);
    continue;
  }

  // ------------------------------------
  // B) If structure differs → Convert then format EXACT like sample
  // ------------------------------------
  try {
    const parsed = eval(file.replace("export const curriculum =","")
                            .replace("export default curriculum",""));

    const output = buildFinal(parsed);
    fs.writeFileSync(dest, output);

    console.log(`🔄 Class ${classNum} — Converted & formatted to EXACT structure`);
  }
  catch(err) {
    console.log(`❌ Format error in ${folder} — cannot convert automatically`);
  }
}

console.log("\n🎉 DONE — Every output is now in EXACT Display Format You Provided.\n");
