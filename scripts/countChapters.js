// scripts/countChapters.js
// -----------------------------------------
// Counts chapters from curriculum.json files,
// adds a final total across all classes,
// and exports results to both JSON and CSV.
// -----------------------------------------

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine repo root (handles GitHub Actions nested path)
const repoRoot = process.cwd().includes("ready4exam-master-automation")
  ? process.cwd()
  : path.join(process.cwd(), "ready4exam-master-automation");

const baseDir = path.join(repoRoot, "static_curriculum");

// Utility to convert JSON to CSV
function convertToCSV(dataArray) {
  const headers = ["Class", "Subject", "Chapters"];
  const rows = [];

  for (const item of dataArray) {
    for (const [subject, count] of Object.entries(item.subjects)) {
      rows.push([item.class, subject, count]);
    }
  }

  // Add total rows
  const totalPerClass = dataArray.map(
    (item) => [item.class, "Total (Class)", item.totalChapters]
  );
  rows.push(["---", "---", "---"]);
  rows.push(...totalPerClass);

  // Calculate final total
  const grandTotal = dataArray.reduce(
    (acc, item) => acc + item.totalChapters,
    0
  );
  rows.push(["---", "FINAL TOTAL", grandTotal]);

  // Convert to CSV string
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

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

  // Print readable report
  console.log("📊 Summary Report:");
  console.log("---------------------------");
  for (const item of results) {
    console.log(`\n🧩 ${item.class.toUpperCase()}`);
    for (const [sub, count] of Object.entries(item.subjects)) {
      console.log(`   📖 ${sub}: ${count} chapters`);
    }
    console.log(`   ➕ Total: ${item.totalChapters} chapters`);
  }

  const grandTotal = results.reduce(
    (acc, item) => acc + item.totalChapters,
    0
  );
  console.log("\n===========================");
  console.log(`📚 FINAL TOTAL CHAPTERS: ${grandTotal}`);
  console.log("===========================\n");

  // Save JSON
  const jsonPath = path.join(repoRoot, "chapter_summary.json");
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));

  // Save CSV
  const csvContent = convertToCSV(results);
  const csvPath = path.join(repoRoot, "chapter_summary.csv");
  fs.writeFileSync(csvPath, csvContent);

  console.log(`✅ Reports saved:
   • ${jsonPath}
   • ${csvPath}`);
}

countChapters();
