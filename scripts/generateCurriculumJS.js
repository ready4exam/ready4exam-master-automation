// scripts/generateCurriculumJS.js
// Auto-convert ALL static_curriculum/classX/curriculum.json → template/js/curriculum.js

import fs from "fs";
import path from "path";

const root = process.cwd();
const staticDir = path.join(root, "static_curriculum");
const outputJS = path.join(root, "template", "js", "curriculum.js");

// ------------------------------------------------------------
// AUTO DETECT ALL CLASS FOLDERS (class5, class6… class12)
// ------------------------------------------------------------
const classDirs = fs.readdirSync(staticDir).filter((d) =>
  /^class\d+$/.test(d)
);

if (!classDirs.length) {
  console.error("❌ No class folders found in static_curriculum/");
  process.exit(1);
}

console.log("🔍 Found curriculum folders:", classDirs.join(", "));

// ------------------------------------------------------------
// FLATTENER: convert your big JSON → simple curriculum.js format
// ------------------------------------------------------------
function flatten(jsonObj) {
  const out = {};

  for (const streamName of Object.keys(jsonObj.streams)) {
    const stream = jsonObj.streams[streamName];
    const subjects = stream.subjects;

    for (const subjectName of Object.keys(subjects)) {
      const subject = subjects[subjectName];
      out[subjectName] = {};

      subject.books.forEach((book) => {
        const bookTitle = book.title;
        out[subjectName][bookTitle] = [];

        book.chapters.forEach((chapter, idx) => {
          out[subjectName][bookTitle].push({
            chapter_title: chapter,
            table_id: `Ch ${idx + 1}`,
            section: streamName
          });
        });
      });
    }
  }

  return out;
}

// ------------------------------------------------------------
// Build a MASTER curriculum object for all classes
// ------------------------------------------------------------
const master = {};

for (const classFolder of classDirs) {
  const classNum = classFolder.replace("class", "");
  const file = path.join(staticDir, classFolder, "curriculum.json");

  if (!fs.existsSync(file)) {
    console.warn(`⚠️ Missing curriculum.json for ${classFolder}, skipping.`);
    continue;
  }

  console.log(`📘 Reading → ${file}`);

  const json = JSON.parse(fs.readFileSync(file, "utf-8"));
  master[`class${classNum}`] = flatten(json);
}

// ------------------------------------------------------------
// Write final curriculum.js
// ------------------------------------------------------------
const jsContent =
  "export const curriculum = " +
  JSON.stringify(master, null, 2) +
  ";\n\nexport default curriculum;";

fs.writeFileSync(outputJS, jsContent);

console.log("✅ curriculum.js generated for ALL classes");
console.log("📄 Saved → template/js/curriculum.js");
