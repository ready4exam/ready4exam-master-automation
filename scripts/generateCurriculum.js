// scripts/generateCurriculum.js
import fs from "fs";
import path from "path";
import fetch from "node-fetch";

// Utility function to pause execution for a given number of milliseconds
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generates and freezes the NCERT curriculum for a given class using the Gemini API.
 * Once curriculum.js is generated, it will not be regenerated in future runs
 * unless the file is missing, empty, or invalid.
 */
export async function generateCurriculumForClass(cls) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("❌ Missing GEMINI_API_KEY in environment variables.");

  console.log(`🧠 Generating NCERT-based curriculum for Class ${cls} via Gemini...`);

  const outputDir = path.join(process.cwd(), "temp_repo", "js");
  const curriculumFile = path.join(outputDir, "curriculum.js");

  // 🧊 1️⃣ Smart Freeze Logic — Skip regeneration if valid data already exists
  if (fs.existsSync(curriculumFile)) {
    const content = fs.readFileSync(curriculumFile, "utf-8").trim();

    if (content.length > 50) {
      console.log(`🧊 curriculum.js already exists and contains data — skipping regeneration for Class ${cls}.`);
      try {
        const match = content.match(/export const curriculum = (.*);/s);
        if (match && match[1]) return JSON.parse(match[1]);
      } catch (err) {
        console.warn("⚠️ Could not parse existing curriculum.js — will regenerate from Gemini.");
      }
    } else {
      console.warn(`⚠️ curriculum.js exists but is empty or corrupted — regenerating for Class ${cls}.`);
    }
  }

  // --- 2️⃣ Define Prompt ---
  const prompt = `
You are an NCERT academic expert. 
Generate a valid JSON representing the full **Class ${cls}** syllabus strictly as per the official NCERT books.

JSON FORMAT:
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
- Use **official NCERT book and chapter titles** for Class ${cls}.
- If a subject has **multiple parts**, list each part (e.g., "Physics Part I", "Physics Part II").
- If a subject has only **one book**, return an array for that subject directly.
- Include all major streams (Science, Commerce, Humanities/Arts).
- Return only JSON (no markdown or text commentary).
`;

  // --- 3️⃣ API Call and Retry Logic ---
  const models = ["gemini-2.5-flash", "gemini-2.5-pro"];
  const DELAY_MS = 3000;
  let successfulResult = null;

  for (const model of models) {
    for (let attempt = 1; attempt <= 3 && !successfulResult; attempt++) {
      console.log(`🔁 Attempt ${attempt} using ${model}...`);
      try {
        const response = await fetch(
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

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

        if (response.ok && text) {
          try {
            const parsed = JSON.parse(text);
            console.log(`✅ Successfully parsed JSON (Attempt ${attempt}, Model ${model})`);
            successfulResult = parsed;
            break;
          } catch (parseErr) {
            console.error(`⚠️ JSON parse error on ${model}:`, parseErr.message);
            console.log("🔍 Raw Gemini output:", text.slice(0, 200) + "...");
          }
        } else {
          const errMsg = data.error?.message || `Status: ${response.status} ${response.statusText}`;
          console.warn(`⚠️ Invalid or empty response from ${model}: ${errMsg}`);
        }
      } catch (err) {
        console.error(`❌ Network/API error using ${model} (Attempt ${attempt}):`, err.message);
      }

      await sleep(DELAY_MS);
    }

    if (successfulResult) break; // Exit if successful
  }

  // --- 4️⃣ Handle Empty Result ---
  if (!successfulResult) {
    console.error("🚨 All attempts failed. Returning empty curriculum object.");
    successfulResult = {};
  }

  // --- 5️⃣ Write Output File ---
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    curriculumFile,
    `// Auto-generated curriculum for Class ${cls}\n\nexport const curriculum = ${JSON.stringify(successfulResult, null, 2)};\n`
  );

  console.log(`✅ curriculum.js written successfully for Class ${cls} (frozen).`);
  return successfulResult;
}
