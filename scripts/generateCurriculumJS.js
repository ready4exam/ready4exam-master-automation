// scripts/generateCurriculumJS.js
import fs from "fs";
import path from "path";

// Root folder
const baseDir = process.cwd();
const rootDir = path.join(baseDir, "static_curriculum");

// Detect all class folders
const classFolders = fs.readdirSync(rootDir).filter(f => f.startsWith("class"));

console.log("🔍 Found curriculum folders:", classFolders.join(", "));

function flatten(jsonObj) {
  if (!jsonObj.streams) return null; // ❌ invalid format → skip

  const output = {};

  for (const streamName of Object.keys(jsonObj.streams)) {
    const stream = jsonObj.streams[streamName];
    if (!stream.subjects) continue;

    for (const subjectName of Object.keys(stream.subjects)) {
      const subject = stream.subjects[subjectName];
      if (!subject.books) continue;

      if (!output[subjectName]) output[subjectName] = {};

      for (const bookObj of subject.books) {
        const bookTitle = bookObj.title;
        const chaptersArr = bookObj.chapters || [];

        output[subjectName][bookTitle] = chaptersArr.map((chapter, idx) => ({
          chapter_title: chapter,
          table_id: `Ch ${idx + 1}`,
          section: streamName
        }));
      }
    }
  }

  return output;
}

function writeCurriculumJS(finalObj) {
  const outPath = path.join(baseDir, "template", "js", "curriculum.js");

  const jsContent =
`export const curriculum = ${JSON.stringify(finalObj, null, 2)};

export default curriculum;`;

  fs.writeFileSync(outPath, jsContent);
  console.log(`✅ curriculum.js generated → template/js/curriculum.js`);
}

// COMBINED curriculum for all classes
const allClasses = {};

for (const folder of classFolders) {
  const classNum = folder.replace("class", "");

  const jsonPath = path.join(rootDir, folder, "curriculum.json");
  if (!fs.existsSync(jsonPath)) {
    console.warn(`⚠️ No curriculum.json found → ${folder}`);
    continue;
  }

  console.log(`📘 Reading → ${jsonPath}`);
  const raw = fs.readFileSync(jsonPath, "utf8");
  const parsed = JSON.parse(raw);

  const flat = flatten(parsed);

  if (!flat) {
    console.warn(`⚠️ Skipped: curriculum.json for class${classNum} is not in streams/subjects structure.`);
    continue;
  }

  allClasses[classNum] = flat;
}

// Write final single curriculum.js used by all repos
writeCurriculumJS(allClasses);

console.log("🎉 All curriculum conversions completed.");
