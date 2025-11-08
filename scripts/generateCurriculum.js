// scripts/generateCurriculum.js
import fs from "fs";
import path from "path";

/**
 * Generates the static curriculum.js structure for a given class (5–12).
 * This version:
 * - Creates curriculum.js only once.
 * - Skips regeneration on future runs (freeze behavior).
 * - Has no Gemini API calls.
 */

export async function generateCurriculumForClass(cls) {
  const outputDir = path.join(process.cwd(), "temp_repo", "js");
  const curriculumFile = path.join(outputDir, "curriculum.js");

  // 🧊 Step 1 — Freeze check
  if (fs.existsSync(curriculumFile)) {
    const existing = fs.readFileSync(curriculumFile, "utf-8").trim();

    if (existing && existing.includes("export const curriculum =") && existing.length > 100) {
      console.log(`🧊 curriculum.js already exists and contains data — skipping regeneration for Class ${cls}.`);
      return;
    }
  }

  console.log(`📘 Creating static NCERT curriculum structure for Class ${cls}...`);
  fs.mkdirSync(outputDir, { recursive: true });

  // Step 2 — Base structure (manual fill)
  let baseStructure = {};

  if (cls <= 10) {
    // Class 5–10 → Simple format
    baseStructure = {
      "Science": [],
      "Social_Science": [],
      "Mathematics": [],
      "English": [],
      "Hindi": []
    };
  } else {
    // Class 11–12 → Stream subjects
    baseStructure = {
      "Physics": { "Physics Part I": [], "Physics Part II": [] },
      "Chemistry": { "Chemistry Part I": [], "Chemistry Part II": [] },
      "Biology": { "Biology": [] },
      "Mathematics": { "Mathematics": [] },
      "Accountancy": { "Financial Accounting - I": [], "Financial Accounting - II": [] },
      "Business Studies": { "Business Studies": [] },
      "Economics": { "Indian Economic Development": [], "Statistics for Economics": [] },
      "History": { "Themes in World History": [] },
      "Geography": { "Fundamentals of Physical Geography": [], "India Physical Environment": [] },
      "Political Science": { "Political Theory": [], "Indian Constitution at Work": [] },
      "Psychology": { "Introduction to Psychology": [] },
      "Sociology": { "Introducing Sociology": [], "Understanding Society": [] },
      "English": { "Hornbill": [], "Snapshots": [] }
    };
  }

  // Step 3 — Write once
  const fileContent = `// Auto-generated curriculum structure for Class ${cls}\n\nexport const curriculum = ${JSON.stringify(baseStructure, null, 2)};\n`;
  fs.writeFileSync(curriculumFile, fileContent);

  console.log(`✅ curriculum.js written successfully for Class ${cls}. File is now frozen (will not regenerate).`);
}
