// scripts/generateCurriculum.js
import fs from "fs";
import path from "path";
import fetch from "node-fetch";

// Utility: simple delay
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generates and freezes the NCERT curriculum for a given class using the Gemini API.
 * Once curriculum.js is generated and contains valid data, it will NOT regenerate on future runs.
 */
export async function generateCurriculumForClass(cls) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("❌ Missing GEMINI_API_KEY in environment variables.");

  console.log(`🧠 Generating NCERT-based curriculum for Class ${cls} via Gemini...`);

  const outputDir = path.join(process.cwd(), "temp_repo", "js");
  const curriculumFile = path.join(outputDir, "curriculum.js");

  // 🧊 1️⃣ Freeze Check — skip regeneration if already exists and has data
  if (fs.existsSync(curriculumFile)) {
    const content = fs.readFileSync(curriculumFile, "utf-8").trim();
    if (content.length > 100 && content.includes("export const curriculum =")) {
      console.log(`🧊 curriculum.js already exists and contains data — skipping regeneration for Class ${cls}.`);
      try {
        const match = content.match(/export const curriculum\s*=\s*(\{[\s\S]*\});/);
        if (match && match[1]) {
          const parsed = JSON.parse(match[1]);
          if (Object.keys(parsed).length > 0) {
            console.log("✅ Existing curriculum is valid. Using frozen data.");
            return parsed;
          }
        }
      } catch (e) {
        console.warn("⚠️ Could not parse existing curriculum. Regeneration will proceed.", e.message);
      }
    }
  }

  // --- 2️⃣ Prompt Definition ---
  const prompt = `
You are a CBSE NCERT academic curriculum expert.
Generate a **valid JSON** representing the full Class ${cls} syllabus
as per official NCERT textbooks.

JSON FORMAT EXAMPLE:
{
  "Subject Name": {
    "Book Name": [
      { "chapter_title": "Exact Chapter Name", "table_id": "", "section": "" }
    ]
  },
  "Subject Name 2": [
    { "chapter_title": "Exact Chapter Name", "table_id": "", "section": "" }
  ]
}

RULES:
- Follow official NCERT structure exactly.
- If a subject has multiple parts (e.g., Physics Part I, II), include both separately.
- If a subject has one book, return it as a single array.
- Include all streams: Science, Commerce, Humanities.
- Return only JSON, without markdown or explanations.
`;

  // --- 3️⃣ API Call & Retry Logic ---
  const models = ["gemini-2.5-pro", "gemini-2.5-flash"];
  let successfulResult = null;
  const DELAY_MS = 3000;

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
        if (res.ok && text) {
          try {
            const parsed = JSON.parse(text);
            console.log(`✅ Successfully parsed JSON (attempt ${attempt}, model ${model})`);
            successfulResult = parsed;
            break;
          } catch (err) {
            console.error(`⚠️ JSON parse error on ${model}:`, err.message, "Raw snippet:", text.slice(0, 200) + "...");
          }
        } else {
          const msg = data.error?.message || `Status: ${res.status} ${res.statusText}`;
          console.warn(`⚠️ API invalid response from ${model}: ${msg}`);
        }
      } catch (err) {
        console.error(`❌ Network error using ${model}:`, err.message);
      }
      await sleep(DELAY_MS);
    }
    if (successfulResult) break;
  }

  // --- 4️⃣ Final Result & File Write ---
  if (!successfulResult) {
    console.error("🚨 All Gemini attempts failed. Returning empty curriculum object.");
    successfulResult = {};
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    curriculumFile,
    `// Auto-generated curriculum for Class ${cls}\n\nexport const curriculum = ${JSON.stringify(successfulResult, null, 2)};\n`
  );

  console.log(`✅ curriculum.js written successfully for Class ${cls} (frozen).`);
  return successfulResult;
}
