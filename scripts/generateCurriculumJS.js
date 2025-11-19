// scripts/generateCurriculumJS.js
//-------------------------------------------------------------
// Converts curriculum.json → curriculum.js (flattened format)
//-------------------------------------------------------------

import fs from "fs";
import path from "path";

const cls = process.env.CLASS;
if (!cls) {
  console.error("❌ ERROR: CLASS environment variable not set.");
  process.exit(1);
}

const baseDir = process.cwd();
const jsonPath = path.join(baseDir, "static_curriculum", "class" + cls, "curriculum.json");
const outPath = path.join(baseDir, "template", "js", "curriculum.js");

//-------------------------------------------------------------
// READ JSON
//-------------------------------------------------------------
if (!fs.existsSync(jsonPath)) {
  console.error("❌ ERROR: curriculum.json does not exist at:", jsonPath);
  process.exit(1);
}

console.log("📘 Loading:", jsonPath);
const raw = fs.readFileSync(jsonPath, "utf8");
const data = JSON.parse(raw);

//-------------------------------------------------------------
// FLATTENER LOGIC
//-------------------------------------------------------------
/*
INPUT FORMAT:
{
  "class": "11",
  "streams": {
    "Science": { subjects: { Physics: { books: […] } } },
    "Commerce": { … },
    "Humanities": { … }
  }
}

OUTPUT FORMAT:
export const curriculum = {
  "Physics": {
    "Physics Part I": [ {chapter_title, table_id, section}, ... ],
    "Physics Part II": [ ... ]
  },
  "Chemistry": {...}
};
*/

function transformCurriculum(json) {
  const result = {};

  const streams = json.streams || {};

  for (const streamName of Object.keys(streams)) {
    const stream = streams[streamName];
    const subjects = stream.subjects || {};

    for (const subjectName of Object.keys(subjects)) {
      const subjectObj = subjects[subjectName];
      const books = subjectObj.books || [];

      if (!result[subjectName]) result[subjectName] = {};

      for (const book of books) {
        const bookTitle = book.title;
        const chapters = book.chapters || [];

        if (!result[subjectName][bookTitle]) {
          result[subjectName][bookTitle] = [];
        }

        chapters.forEach((ch, idx) => {
          result[subjectName][bookTitle].push({
            chapter_title: ch,
            table_id: `Ch ${idx + 1}`,
            section: streamName   // Science / Commerce / Humanities
          });
        });
      }
    }
  }

  return result;
}

const curriculumJS = transformCurriculum(data);

//-------------------------------------------------------------
// WRITE curriculum.js
//-------------------------------------------------------------
const output =
`// Auto-generated for Class ${cls} — Do NOT edit manually
export const curriculum = ${JSON.stringify(curriculumJS, null, 2)};

export default curriculum;
`;

fs.writeFileSync(outPath, output, "utf8");

console.log("✅ curriculum.js created at:", outPath);
