/**
 * scripts/countChapters.js
 * -----------------------------------------
 * Counts total chapters per class and per subject
 * from all static_curriculum/classX/curriculum.js files.
 * -----------------------------------------
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Adjust base path if needed
const baseDir = path.join(__dirname, "../static_curriculum");

// Function to safely import curriculum.js (ESM-compatible)
async function importCurriculum(filePath) {
  try {
    // Dynamic import to handle ES module exports
    const mod = await import(filePath);
    // curriculum.js may export default or named variable
    return mod.default || mod.curriculum || mod;
  } catch (err) {
    console.error(`❌ Failed to import ${filePath}:`, err.message);
    return null;
  }
}

async function countChapters() {
  console.log("📘 Counting chapters in all curriculum files...\n");

  const results = [];

  // Loop through folders like class6, class7, ..., class12
  const classDirs = fs
    .readdirSync(baseDir)
    .filter((f) => fs.statSync(path.join(baseDir, f)).isDirectory());

  for (const classDir of classDirs) {
    const curriculumPath = path.join(baseDir, classDir, "curriculum.js");
    if (!fs.existsSync(curriculumPath)) {
      console.warn(`⚠️  Skipping ${classDir} — curriculum.js not found`);
      continue;
    }

    // Convert file path to file:// URL for import
    const curriculumURL = pathToFileURL(curriculumPath).href;
    const curriculum = await importCurriculum(curriculumURL);
    if (!curriculum || typeof curriculum !== "object") continue;

    let totalChapters = 0;
    const subjectCounts = {};

    for (const [subject, books] of Object.entries(curriculum)) {
      let subjectChapterCount = 0;
      for (const book of Object.values(books)) {
        if (Array.isArray(book)) {
          subjectChapterCount += book.length;
        }
      }
      subjectCounts[subject] = subjectChapterCount;
      totalChapters += subjectChapterCount;
    }

    results.push({
      class: classDir,
      totalChapters,
      subjects: subjectCounts,
    });
  }

  console.log("📊 Summary Report:");
  console.log("---------------------------");
  for (const item of results) {
    console.log(`\n🧩 ${item.class.toUpperCase()}`);
    for (const [sub, count] of Object.entries(item.subjects)) {
      console.log(`   📖 ${sub}: ${count} chapters`);
    }
    console.log(`   ➕ Total: ${item.totalChapters} chapters`);
  }

  console.log("\n✅ Done!");
}

// Helper for dynamic import
function pathToFileURL(filePath) {
  const absPath = path.resolve(filePath);
  return new URL(`file://${absPath}`);
}

// Run
countChapters();
