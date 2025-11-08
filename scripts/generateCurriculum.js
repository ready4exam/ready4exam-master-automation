// scripts/generateCurriculum.js
import fs from "fs";
import path from "path";

/**
 * Creates a structured curriculum.js file for a given class.
 * No Gemini API calls. You can manually populate later.
 */
export async function generateCurriculumForClass(cls) {
  console.log(`📘 Creating static NCERT curriculum structure for Class ${cls}...`);

  const outputDir = path.join(process.cwd(), "temp_repo", "js");
  const curriculumFile = path.join(outputDir, "curriculum.js");
  fs.mkdirSync(outputDir, { recursive: true });

  // ✅ Structure template for manual population
  let baseStructure = {};

  if (cls <= 10) {
    // Class 5–10 -> simple structure
    baseStructure = {
      "Science": [],
      "Social_Science": [],
      "Mathematics": [],
      "English": [],
      "Hindi": []
    };
  } else {
    // Class 11–12 -> stream-based structure
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

  const fileContent = `// Auto-generated curriculum structure for Class ${cls}\n\nexport const curriculum = ${JSON.stringify(baseStructure, null, 2)};\n`;
  fs.writeFileSync(curriculumFile, fileContent);

  console.log(`✅ curriculum.js written successfully for Class ${cls}. You can now manually populate chapters.`);
  return baseStructure;
}
