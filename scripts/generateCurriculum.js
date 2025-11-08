import fs from "fs";
import path from "path";
import fetch from "node-fetch";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ✅ Static NCERT Fallback (Class 11–12)
const DEFAULT_CURRICULUM = {
  "Physics": {
    "Physics Part I": [
      { "chapter_title": "Physical World", "table_id": "", "section": "" },
      { "chapter_title": "Units and Measurement", "table_id": "", "section": "" },
      { "chapter_title": "Motion in a Straight Line", "table_id": "", "section": "" },
      { "chapter_title": "Motion in a Plane", "table_id": "", "section": "" },
      { "chapter_title": "Laws of Motion", "table_id": "", "section": "" },
      { "chapter_title": "Work, Energy and Power", "table_id": "", "section": "" }
    ],
    "Physics Part II": [
      { "chapter_title": "System of Particles and Rotational Motion", "table_id": "", "section": "" },
      { "chapter_title": "Gravitation", "table_id": "", "section": "" },
      { "chapter_title": "Thermodynamics", "table_id": "", "section": "" }
    ]
  },
  "Chemistry": {
    "Chemistry Part I": [
      { "chapter_title": "Some Basic Concepts of Chemistry", "table_id": "", "section": "" },
      { "chapter_title": "Structure of Atom", "table_id": "", "section": "" },
      { "chapter_title": "Chemical Bonding", "table_id": "", "section": "" }
    ],
    "Chemistry Part II": [
      { "chapter_title": "Thermodynamics", "table_id": "", "section": "" },
      { "chapter_title": "Equilibrium", "table_id": "", "section": "" }
    ]
  },
  "Biology": {
    "Biology": [
      { "chapter_title": "The Living World", "table_id": "", "section": "" },
      { "chapter_title": "Biological Classification", "table_id": "", "section": "" },
      { "chapter_title": "Cell: The Unit of Life", "table_id": "", "section": "" }
    ]
  },
  "Mathematics": {
    "Mathematics": [
      { "chapter_title": "Sets", "table_id": "", "section": "" },
      { "chapter_title": "Relations and Functions", "table_id": "", "section": "" },
      { "chapter_title": "Trigonometric Functions", "table_id": "", "section": "" }
    ]
  },
  "Accountancy": {
    "Financial Accounting - I": [
      { "chapter_title": "Introduction to Accounting", "table_id": "", "section": "" },
      { "chapter_title": "Theory Base of Accounting", "table_id": "", "section": "" }
    ]
  },
  "Business Studies": {
    "Business Studies": [
      { "chapter_title": "Nature and Purpose of Business", "table_id": "", "section": "" },
      { "chapter_title": "Forms of Business Organisation", "table_id": "", "section": "" }
    ]
  },
  "Economics": {
    "Indian Economic Development": [
      { "chapter_title": "Indian Economy on the Eve of Independence", "table_id": "", "section": "" },
      { "chapter_title": "Poverty", "table_id": "", "section": "" }
    ]
  },
  "History": {
    "Themes in World History": [
      { "chapter_title": "From the Beginning of Time", "table_id": "", "section": "" },
      { "chapter_title": "Writing and City Life", "table_id": "", "section": "" }
    ]
  },
  "Political Science": {
    "Political Theory": [
      { "chapter_title": "Political Theory: An Introduction", "table_id": "", "section": "" },
      { "chapter_title": "Freedom", "table_id": "", "section": "" }
    ]
  }
};

export async function generateCurriculumForClass(cls) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  console.log(`🧠 Generating NCERT-based curriculum for Class ${cls} via Gemini...`);

  const outputDir = path.join(process.cwd(), "temp_repo", "js");
  const curriculumFile = path.join(outputDir, "curriculum.js");

  // 🧊 Skip regeneration if existing curriculum is valid
  if (fs.existsSync(curriculumFile)) {
    const content = fs.readFileSync(curriculumFile, "utf-8").trim();
    if (content.includes("export const curriculum =") && content.length > 200) {
      console.log(`🧊 curriculum.js already exists — skipping regeneration for Class ${cls}.`);
      return {};
    }
  }

  let successfulResult = null;
  const models = ["gemini-2.5-pro", "gemini-2.5-flash"];
  const prompt = `
You are an NCERT syllabus expert.
Generate valid JSON for complete Class ${cls} syllabus as per NCERT official books.
Follow the format:
{
  "Subject Name": {
    "Book Name": [{ "chapter_title": "Exact Chapter", "table_id": "", "section": "" }]
  }
}
Include Science, Commerce, and Humanities streams for Class 11–12.
Return JSON only.
`;

  for (const model of models) {
    for (let attempt = 1; attempt <= 3 && !successfulResult; attempt++) {
      console.log(`🔁 Attempt ${attempt} using ${model}...`);
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 8192,
                responseMimeType: "application/json",
              },
            }),
          }
        );

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        if (text) {
          try {
            successfulResult = JSON.parse(text);
            console.log(`✅ Parsed JSON successfully from ${model}`);
            break;
          } catch {
            console.warn("⚠️ Parse failed, likely malformed response.");
          }
        } else {
          const msg = data.error?.message || "No text in response.";
          console.warn(`⚠️ ${msg}`);
        }
      } catch (err) {
        console.error(`❌ API/network error:`, err.message);
      }
      await sleep(2000);
    }
    if (successfulResult) break;
  }

  if (!successfulResult || Object.keys(successfulResult).length === 0) {
    console.warn("⚠️ Gemini failed or quota reached — using default NCERT fallback.");
    successfulResult = DEFAULT_CURRICULUM;
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    curriculumFile,
    `// Auto-generated curriculum for Class ${cls}\n\nexport const curriculum = ${JSON.stringify(successfulResult, null, 2)};\n`
  );

  console.log(`✅ curriculum.js written successfully for Class ${cls}.`);
  return successfulResult;
}
