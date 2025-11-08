// scripts/createClassRepo.js
import fs from "fs";
import path from "path";

const __dirname = process.cwd();

async function main() {
  const cls = process.argv[2];
  if (!cls) throw new Error("❌ Missing class argument (e.g. node createClassRepo.js 11)");

  console.log(`⚙️ Running createClassRepo.js for class=${cls}`);
  console.log(`🚀 Starting automation for Class ${cls}`);

  // Paths
  const sourceFile = path.join(__dirname, "static_curriculum", `class${cls}`, "curriculum.js");
  const destDir = path.join(__dirname, "temp_repo", "js");
  const destFile = path.join(destDir, "curriculum.js");

  // Ensure target folder exists
  fs.mkdirSync(destDir, { recursive: true });

  // 1️⃣ Check if static curriculum exists
  if (!fs.existsSync(sourceFile)) {
    throw new Error(`❌ Missing static curriculum file for Class ${cls}: ${sourceFile}`);
  }

  // 2️⃣ Read and copy file
  const data = fs.readFileSync(sourceFile, "utf-8");

  if (!data || data.trim().length < 10) {
    throw new Error(`⚠️ Static curriculum file for Class ${cls} seems empty.`);
  }

  fs.writeFileSync(destFile, data);
  console.log(`✅ curriculum.js successfully copied from static_curriculum/class${cls}/`);

  // 3️⃣ Confirm file integrity
  const verify = fs.readFileSync(destFile, "utf-8");
  if (verify.includes("export const curriculum")) {
    console.log(`📘 curriculum.js verified and ready for Class ${cls}.`);
  } else {
    console.warn(`⚠️ Warning: curriculum.js copied but missing export line! Check static file syntax.`);
  }

  console.log(`🎉 Successfully processed curriculum for Class ${cls}.`);
}

main().catch((err) => {
  console.error("🚨 Error in createClassRepo.js:", err.message);
  process.exit(1);
});
