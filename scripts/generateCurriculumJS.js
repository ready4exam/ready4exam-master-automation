// scripts/generateCurriculumJS.js
// ------------------------------------------------------------
// UNIVERSAL CURRICULUM GENERATOR
// Converts ANY NCERT JSON format (Class 5–12) → curriculum.js
// ------------------------------------------------------------

import fs from "fs";
import path from "path";

const BASE = process.cwd();
const STATIC_DIR = path.join(BASE, "static_curriculum");

console.log("🔍 Scanning static_curriculum...");
const folders = fs.readdirSync(STATIC_DIR).filter(f => f.startsWith("class"));

console.log("🔍 Found classes:", folders.join(", "));

// ------------------------------------------------------------
// UNIVERSAL JSON → Unified JS converter
// Handles ALL formats used across Class 5–12
// ------------------------------------------------------------
function convertToUnified(json) {

  // --------------------------------------------
  // FORMAT A → Class 11/12 (streams based)
  // --------------------------------------------
  if (json.streams) {
    const out = {};

    for (const streamName of Object.keys(json.streams)) {
      const stream = json.streams[streamName];

      for (const subjectName of Object.keys(stream.subjects)) {
        const subject = stream.subjects[subjectName];
        out[subjectName] = out[subjectName] || {};

        for (const book of subject.books) {
          out[subjectName][book.title] = book.chapters.map((ch, idx) => ({
            chapter_title: ch,
            table_id: `Ch ${idx + 1}`,
            section: streamName
          }));
        }
      }
    }

    return out;
  }

  // --------------------------------------------
  // FORMAT B → Class 6–10 (subjects → books)
  // --------------------------------------------
  if (json.subjects) {
    const out = {};

    for (const subjectName of Object.keys(json.subjects)) {
      const subject = json.subjects[subjectName];
      out[subjectName] = {};

      for (const book of subject.books) {
        out[subjectName][book.title] = book.chapters.map((ch, idx) => ({
          chapter_title: ch,
          table_id: `Ch ${idx + 1}`
        }));
      }
    }

    return out;
  }

  // --------------------------------------------
  // FORMAT C → Very simple JSON
  // { subject: { bookName: ["Ch1","Ch2"] }}
  // --------------------------------------------
  if (typeof json === "object") {
    const out = {};

    for (const subjectName of Object.keys(json)) {
      out[subjectName] = {};

      for (const bookName of Object.keys(json[subjectName])) {
        const chapters = json[subjectName][bookName];
        out[subjectName][bookName] = chapters.map((ch, idx) => ({
          chapter_title: ch,
          table_id: `Ch ${idx + 1}`
        }));
      }
    }

    return out;
  }

  return {};
}

// ------------------------------------------------------------
// MAIN EXECUTION
// ------------------------------------------------------------
for (const folder of folders) {
  const classNum = folder.replace("class", "");
  const jsonPath = path.join(STATIC_DIR, folder, "curriculum.json");

  console.log(`📘 Reading → ${jsonPath}`);

  if (!fs.existsSync(jsonPath)) {
    console.warn(`⚠️ No curriculum.json found for ${folder}. Skipping…`);
    continue;
  }

  const raw = fs.readFileSync(jsonPath, "utf8");
  let jsonObj;

  try {
    jsonObj = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ ERROR parsing JSON for ${folder}:`, err);
    continue;
  }

  // Convert any schema → unified structure
  const unified = convertToUnified(jsonObj);

  // JS output file inside template/js/
  const outPath = path.join(BASE, "template", "js", "curriculum.js");
  const jsContent = `export const curriculum = ${JSON.stringify(unified, null, 2)};
export default curriculum;
`;

  fs.writeFileSync(outPath, jsContent, "utf8");
  console.log(`✅ curriculum.js generated for Class ${classNum}`);
}

console.log("🎉 All curriculum.js files generated successfully!");
