// scripts/generateCurriculumJS.js
//-------------------------------------------------------
// Converts static_curriculum/classX/curriculum.json → 
// template/js/curriculum.js (final flattened R4E format)
//-------------------------------------------------------

import fs from "fs";
import path from "path";
import process from "process";

// ------------------------------
// 1. Read CLASS from workflow
// ------------------------------
const cls = process.env.CLASS;

if (!cls) {
  console.error("❌ ERROR: CLASS environment variable not set.");
  process.exit(1);
}

console.log(`📘 Generating curriculum.js for Class ${cls} ...`);

// ------------------------------
// 2. Paths
// ------------------------------
const baseDir = process.cwd();

const sourceJson = path.join(
  baseDir,
  "static_curriculum",
  `class${cls}`,
  "curriculum.json"
);

const outputJs = path.join(
  baseDir,
  "template",
  "js",
  "curriculum.js"
);

// ------------------------------
// 3. Validate source file
// ------------------------------
if (!fs.existsSync(sourceJson)) {
  console.error(`❌ ERROR: curriculum.json missing for class ${cls}`);
  console.error(`Expected: ${sourceJson}`);
  process.exit(1);
}

console.log(`📄 Reading: ${sourceJson}`);

const rawJson = fs.readFileSync(sourceJson, "utf8");
let jsonData;

try {
  jsonData = JSON.parse(rawJson);
} catch (err) {
  console.error("❌ ERROR: Invalid JSON file.");
  console.error(err);
  process.exit(1);
}

// ---------------------------------------------
// 4. Flatten NCERT JSON → Ready4Exam format
// ---------------------------------------------
function convert(json) {
  const result = {};

  if (!json.streams) {
    throw new Error("❌ JSON missing 'streams' key.");
  }

  for (const streamName of Object.keys(json.streams)) {
    const stream = json.streams[streamName];

    if (!stream.subjects) continue;

    for (const subjectName of Object.keys(stream.subjects)) {
      const subject = stream.subjects[subjectName];
      if (!result[subjectName]) result[subjectName] = {};

      (subject.books || []).forEach((book) => {
        result[subjectName][book.title] = book.chapters.map((ch, i) => ({
          chapter_title: ch,
          table_id: `Ch ${i + 1}`,
          section: streamName
        }));
      });
    }
  }

  return result;
}

console.log("🔄 Converting to Ready4Exam curriculum.js format...");
let finalData;

try {
  finalData = convert(jsonData);
} catch (err) {
  console.error("❌ ERROR converting JSON → JS");
  console.error(err);
  process.exit(1);
}

// ------------------------------------------------------
// 5. Build curriculum.js output file
// ------------------------------------------------------
const jsContent =
  `// Auto-generated for Class ${cls}\n` +
  `export const curriculum = ${JSON.stringify(finalData, null, 2)};\n` +
  `export default curriculum;\n`;

fs.writeFileSync(outputJs, jsContent, "utf8");

console.log(`✅ SUCCESS: curriculum.js created → ${outputJs}`);