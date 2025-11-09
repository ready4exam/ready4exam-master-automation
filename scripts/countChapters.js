// scripts/countChapters.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base directory (adjust automatically)
const repoRoot = process.cwd().includes("ready4exam-master-automation")
  ? process.cwd()
  : path.join(process.cwd(), "ready4exam-master-automation");

const baseDir = path.join(repoRoot, "static_curriculum");

async function countChapters() {
  console.log("📘 Counting chapters in all curriculum JSON files...\n");

  const results = [];
  const classDirs = fs
    .readdirSync(baseDir)
    .filter((f) => fs.statSync(path.join(baseDir, f)).isDirectory());

  for (const classDir of classDirs) {
    const jsonPath = path.join(baseDir, classDir, "curriculum.json");
    if (!fs.existsSync(jsonPath)) {
      console.warn(`⚠️  Skipping ${classDir} — curriculum.json not found`);
      continue;
    }

    let curriculum;
    try {
      curriculum = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    } catch (err) {
      console.error(`❌ Failed to parse ${jsonPath}: ${err.message}`);
      continue;
    }

    let totalChapters = 0;
    const subjectCounts = {};

    for (const [subject, books] of Object.entries(curriculum)) {
      let subjectChapterCount = 0;

      for (const [bookTitle, chapters] of Object.entries(books)) {
        if (Array.isArray(chapters)) {
          subjectChapterCount += chapters.length;
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

  // Write a JSON summary file
  fs.writeFileSync(
    path.join(repoRoot, "chapter_summary.json"),
    JSON.stringify(results, null, 2)
  );

  console.log("\n✅ Done!");
  return results;
}

countChapters();
