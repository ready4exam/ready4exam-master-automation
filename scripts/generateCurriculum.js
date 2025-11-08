// scripts/generateCurriculum.js
import fs from "fs";
import path from "path";

/**
 * Copies static curriculum for the class from /static_curriculum/classX/
 * to the new repo's /js/ folder.
 */
export async function generateCurriculumForClass(cls) {
  console.log(`🧠 Preparing curriculum for Class ${cls} from static source...`);

  const staticFile = path.join(process.cwd(), "static_curriculum", `class${cls}`, "curriculum.js`);
  const destFile = path.join(process.cwd(), "temp_repo", "js", "curriculum.js");

  if (!fs.existsSync(staticFile)) {
    console.error(`❌ Static curriculum file not found: ${staticFile}`);
    throw new Error(`Static curriculum missing for Class ${cls}`);
  }

  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  fs.copyFileSync(staticFile, destFile);
  console.log(`✅ curriculum.js successfully copied from static_curriculum/class${cls}/`);

  const content = fs.readFileSync(destFile, "utf-8");
  if (content.includes("export const curriculum")) {
    console.log(`📘 curriculum.js verified and ready for Class ${cls}.`);
  } else {
    console.warn(`⚠️ curriculum.js copied but missing export syntax — check file.`);
  }

  return true;
}
