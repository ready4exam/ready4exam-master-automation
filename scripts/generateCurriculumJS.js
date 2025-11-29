// scripts/generateCurriculumJS.js

import fs from "fs";
import path from "path";

console.log("\n🚀 Curriculum Build Started");

// ==========================
//  FOLDERS
// ==========================
const ROOT   = process.cwd();
const SOURCE = path.join(ROOT, "static_curriculum");    
const OUTPUT = path.join(ROOT, "classes_repo");         
const TEMPLATE_CURRICULUM = path.join(ROOT, "template/js/curriculum.js");

// Target Class via env (Class 12 / Class 5 etc.)
const SELECTED = process.env.CLASS;
if (!SELECTED) {
  console.log("❌ CLASS env missing (CLASS=12)");
  process.exit(1);
}

// detect class folders
const CLASSES = fs.readdirSync(SOURCE).filter(f => f.startsWith("class"));

// ==========================
//  VALIDATION
// ==========================
function isFinalFormat(file) {
  return file.includes("export const curriculum = {") && file.includes("export default curriculum");
}

// ==========================
//  SCRIPT START
// ==========================
let chosenFile = null;

for (const folder of CLASSES) {
  const classNum = folder.replace("class", "");
  const src = path.join(SOURCE, folder, "curriculum.js");

  if (!fs.existsSync(src)) {
    console.log(`⚠ Missing curriculum for Class ${classNum}`);
    continue;
  }

  let file = fs.readFileSync(src, "utf8").trim();
  
  // 🚨 Not final format? warn — DO NOT STOP
  if (!isFinalFormat(file)) {
    console.log(`⚠ Class ${classNum} — not final format (skipped safely)`);
    continue;
  }

  // Only process matching class
  if (classNum === SELECTED) {

    // Make output folder
    const destDir = path.join(OUTPUT, `class${classNum}`, "js");
    const dest = path.join(destDir, "curriculum.js");
    fs.mkdirSync(destDir, { recursive:true });

    fs.writeFileSync(dest, file);
    chosenFile = file;           // 👈 fallback version
    console.log(`✔ Class ${classNum} curriculum built`);
  }
}

// ==========================
//  APPLY FALLBACK TO TEMPLATE
// ==========================
if (chosenFile) {
  fs.writeFileSync(TEMPLATE_CURRICULUM, chosenFile);
  console.log(`🔥 TEMPLATE UPDATED → template/js/curriculum.js now = Class ${SELECTED}`);
} else {
  console.log("❌ No valid curriculum found for selected class");
  process.exit(1);
}

console.log("\n🎉 DONE — Fallback enabled. Selected class curriculum exported & template updated.\n");
