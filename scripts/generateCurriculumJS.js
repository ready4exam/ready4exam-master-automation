// scripts/generateCurriculumJS.js
// Universal generator: reads static_curriculum/class${CLASS}/curriculum.json
// and writes template/js/curriculum.js in the expected flattened format.
// - Auto-detects CLASS from process.env.CLASS
// - Removes any top-level numeric wrapper (e.g., {"11": {...}})
// - Supports input that is already subject->books or a 'streams' structure
// - Numbers chapters sequentially PER SUBJECT across all books (Ch 1, Ch 2, ...)
// - Overwrites table_id to "Ch N" to ensure consistent format
// ----------------------------------------------------------

import fs from "fs";
import path from "path";

const CLASS = process.env.CLASS;
if (!CLASS) {
  console.error("❌ Error: CLASS environment variable not set.");
  process.exit(1);
}

const baseDir = process.cwd();
const inputPath = path.join(baseDir, "static_curriculum", `class${CLASS}`, "curriculum.json");
const outputPath = path.join(baseDir, "template", "js", "curriculum.js");

console.log(`🔍 generateCurriculumJS.js — class=${CLASS}`);
console.log("📘 Input:", inputPath);
console.log("📙 Output:", outputPath);

if (!fs.existsSync(inputPath)) {
  console.error("❌ Missing input curriculum.json at:", inputPath);
  process.exit(1);
}

let raw;
try {
  raw = fs.readFileSync(inputPath, "utf8");
} catch (err) {
  console.error("❌ Failed to read input:", err.message);
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (err) {
  console.error("❌ Invalid JSON:", err.message);
  process.exit(1);
}

// Helper: if parsed is wrapper like { "11": { ... } } unwrap it
function unwrapIfNumericWrapper(obj, cls) {
  if (!obj || typeof obj !== "object") return obj;
  const clsKey = String(cls);
  if (Object.keys(obj).length === 1 && (obj[clsKey] !== undefined || obj[Number(cls)] !== undefined)) {
    return obj[clsKey] ?? obj[Number(cls)];
  }
  // also handle case where top-level has the class key among others
  if (obj[clsKey] && typeof obj[clsKey] === "object") {
    return obj[clsKey];
  }
  return obj;
}

// Helper: flatten streams -> subject->books->chapters
function flattenStreamsFormat(obj) {
  // expected input:
  // { streams: { streamName: { subjects: { SubjectName: { books: [ { title, chapters: [...] } ] } } } } }
  const out = {};
  if (!obj.streams) return null;
  for (const streamName of Object.keys(obj.streams)) {
    const stream = obj.streams[streamName];
    if (!stream || !stream.subjects) continue;
    for (const subjectName of Object.keys(stream.subjects)) {
      const subject = stream.subjects[subjectName];
      if (!subject || !subject.books) continue;
      if (!out[subjectName]) out[subjectName] = {};
      for (const bookObj of subject.books) {
        const bookTitle = bookObj.title || "Untitled Book";
        const chaptersArr = bookObj.chapters || [];
        out[subjectName][bookTitle] = chaptersArr.map(ch => ({
          chapter_title: typeof ch === "string" ? ch : (ch.chapter_title ?? ch.title ?? ""),
          // section preservation if present
          section: ch.section ?? streamName
        }));
      }
    }
  }
  return out;
}

// Helper: detect if already in subject->books form
function isSubjectBooksFormat(obj) {
  if (!obj || typeof obj !== "object") return false;
  // look for a value that's an object whose values are arrays of chapter objects
  for (const subKey of Object.keys(obj)) {
    const subVal = obj[subKey];
    if (subVal && typeof subVal === "object") {
      // check one book inside
      const bookKeys = Object.keys(subVal);
      if (bookKeys.length === 0) continue;
      const sampleBook = subVal[bookKeys[0]];
      if (Array.isArray(sampleBook)) return true;
    }
  }
  return false;
}

// Start processing
let source = unwrapIfNumericWrapper(parsed, CLASS);

// if it's streams format, flatten
let finalSubjects = null;

if (source && source.streams) {
  const flat = flattenStreamsFormat(source);
  if (flat) finalSubjects = flat;
}

if (!finalSubjects && isSubjectBooksFormat(source)) {
  // Use as-is but normalize chapters shape
  finalSubjects = {};
  for (const subjectName of Object.keys(source)) {
    const books = source[subjectName] || {};
    finalSubjects[subjectName] = {};
    for (const bookTitle of Object.keys(books)) {
      const chaptersArr = books[bookTitle] || [];
      finalSubjects[subjectName][bookTitle] = chaptersArr.map(ch => {
        if (typeof ch === "string") {
          return { chapter_title: ch, section: "" };
        }
        // if already object, pick fields
        return {
          chapter_title: ch.chapter_title ?? ch.title ?? "",
          section: ch.section ?? ""
        };
      });
    }
  }
}

// If still not populated, attempt to interpret parsed as a single book list (fallback)
if (!finalSubjects) {
  // If parsed is an array -> assume it's a single unnamed subject/book
  if (Array.isArray(parsed)) {
    finalSubjects = { "Misc": { "Book": parsed.map((ch, i) => ({ chapter_title: ch.chapter_title ?? ch, section: ch.section ?? "" })) } };
  } else {
    console.error("❌ Unrecognized curriculum.json format. Expected either 'streams' or subject->books mapping.");
    process.exit(1);
  }
}

// Now ensure sequential numbering per subject across all books
const output = {};

for (const subjectName of Object.keys(finalSubjects)) {
  const books = finalSubjects[subjectName];
  output[subjectName] = {};
  let counter = 1;
  // preserve book order as in object keys
  for (const bookTitle of Object.keys(books)) {
    const chapters = books[bookTitle] || [];
    output[subjectName][bookTitle] = chapters.map(ch => {
      const chapter_title = ch.chapter_title ?? ch.title ?? "";
      const section = ch.section ?? "";
      const table_id = `Ch ${counter}`;
      counter += 1;
      return {
        chapter_title,
        table_id,
        section
      };
    });
  }
}

// Write file
const jsContent = `export const curriculum = ${JSON.stringify(output, null, 2)};

export default curriculum;
`;

try {
  // ensure output directory exists
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outputPath, jsContent, "utf8");
  console.log("✅ curriculum.js written to:", outputPath);
} catch (err) {
  console.error("❌ Failed to write output:", err.message);
  process.exit(1);
}
