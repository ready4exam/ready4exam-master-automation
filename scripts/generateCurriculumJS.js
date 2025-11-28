import fs from "fs";
import path from "path";

console.log("\n🚀 Curriculum Build Started");

// ==========================
//  FOLDERS
// ==========================
const ROOT      = process.cwd();
const SOURCE    = path.join(ROOT, "static_curriculum");   // MASTER SOURCE - Correct Place
const OUTPUT    = path.join(ROOT, "classes_repo");        // Final Target Output

// detect available class folders
const CLASSES = fs.readdirSync(SOURCE).filter(f => f.startsWith("class"));


// ==========================
//  VALIDATION CHECK 🔍
// ==========================
function isFinalFormat(file) {
  return (
       file.includes("export const curriculum = {")
    && file.includes("table_id")
    && file.includes("export default curriculum")
  );
}


// ==========================
//  BUILD START
// ==========================
for (const folder of CLASSES) {

  const classNum = folder.replace("class", "");
  const inputJS  = path.join(SOURCE, folder, "curriculum.js");
  const outputJS = path.join(OUTPUT, `class${classNum}`, "js", "curriculum.js");

  // skip if master curriculum missing
  if (!fs.existsSync(inputJS)) {
    console.log(`⚠ No curriculum.js found for Class ${classNum}`);
    continue;
  }

  // read master file
  const file = fs.readFileSync(inputJS, "utf-8").trim();

  // ==========================
  //  🔴 MUST BE FINAL FORMAT
  // ==========================
  if (!isFinalFormat(file)) {
    console.log(`❌ ERROR: curriculum.js for Class ${classNum} is not in final export format.`);
    console.log(`   Location: static_curriculum/${folder}/curriculum.js`);
    console.log("   Expected format:\n   export const curriculum = { ... }\n   export default curriculum;");
    process.exit(1); // STOP 🔥 – prevents wrong fallback/template overrides
  }

  // ==========================
  //  COPY EXACT — NO TEMPLATE
  // ==========================
  fs.mkdirSync(path.dirname(outputJS), { recursive: true });
  fs.writeFileSync(outputJS, file);

  console.log(`✔ Class ${classNum} — Curriculum exported successfully → (NO fallback used)`);
}

console.log("\n🎉 BUILD COMPLETE — All Classes Loaded ONLY From static_curriculum\n");
