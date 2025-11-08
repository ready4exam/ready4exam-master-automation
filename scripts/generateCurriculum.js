// scripts/generateCurriculum.js
import fs from "fs";
import path from "path";

/**
 * Copies static curriculum for the class from /static_curriculum/classX/
 * to the new repo's /js/ folder (replaces Gemini dependency).
 */
export async function generateCurriculumForClass(cls) {
  console.log(`🧠 Preparing curriculum for Class ${cls} from static source...`);

  // FIX APPLIED: Changed the trailing backtick (`) to a double quote (")
  // to fix the SyntaxError: Invalid or unexpected token.
  const staticFile = path.join(process.cwd(), "static_curriculum", `class${cls}`, "curriculum.js");
  const destFile = path.join(process.cwd(), "temp_repo", "js", "curriculum.js");

  // ✅ Check if static curriculum exists
  if (!fs.existsSync(staticFile)) {
    console.error(`❌ Static curriculum file not found: ${staticFile}`);
    throw new Error(`Static curriculum missing for Class ${cls}`);
  }

  // ✅ Ensure js directory exists
  fs.mkdirSync(path.dirname(destFile), { recursive: true });

  // ✅ Copy curriculum to destination
  fs.copyFileSync(staticFile, destFile);
  console.log(`✅ curriculum.js successfully copied from static_curriculum/class${cls}/`);

  // ✅ Validation check
  const content = fs.readFileSync(destFile, "utf-8");
  if (content.includes("export const curriculum")) {
    console.log(`📘 curriculum.js verified and ready for Class ${cls}.`);
  } else {
    console.warn(`⚠️ curriculum.js copied but missing export syntax — please verify file.`);
  }

  return true;
}
