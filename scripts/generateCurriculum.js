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
 * Once curriculum.js is generated, it will not be regenerated in future runs.
 */
export async function generateCurriculumForClass(cls) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("❌ Missing GEMINI_API_KEY in environment variables.");

  console.log(`🧠 Generating NCERT-based curriculum for Class ${cls} via Gemini...`);

  const outputDir = path.join(process.cwd(), "temp_repo", "js");
  const curriculumFile = path.join(outputDir, "curriculum.js");

  // 🧊 1️⃣ Freeze check — skip regeneration if file already exists
  if (fs.existsSync(curriculumFile)) {
    console.log(`🧊 curriculum.js already exists — skipping regeneration for Class ${cls}.`);
    const content = fs.readFileSync(curriculumFile, "utf-8");
    try {
      const match = content.match(/export const curriculum = (.*);/s);
      if (match && match[1]) return JSON.parse(match[1]);
    } catch {
      console.warn("⚠️ Could not parse existing curriculum.js, continuing with empty object.");
    }
    return {};
  }

  // --- 2️⃣ Prompt Definition ---
  const prompt = `
You are a CBSE NCERT academic curriculum expert.
Generate a **valid JSON** representing the full Class ${cls} syllabus
following official NCERT books.

JSON FORMAT RULES:
{
  "SubjectName": {
    "Book Name": [
      { "chapter_title": "Exact Chapter Name", "table_id": "", "section": "" }
    ]
  },
  "SubjectName2": [
    { "chapter_title": "Exact Chapter Name", "table_id": "", "section": "" }
  ]
}

RULES:
- Follow *exact NCERT textbook naming and structure* for Class ${cls}.
- If a subject has **multiple parts**, e.g. Physics (Part I, Part II), show both as separate book keys.
- If a subject has **only one book**, directly return an array for that subject.
- Include all subjects across all streams (Science, Commerce, Humanities) for Class ${cls}.
- Return only JSON, no markdown, commentary, or backticks.
`;

  // --- 3️⃣ API Call and Retry Logic (your stable version retained) ---
  const models = ["gemini-2.5-flash", "gemini-2.5-pro"];
  let attempt = 0;
  let successfulResult = null;
  const DELAY_MS = 3000; // 3s delay between retries

  for (const model of models) {
    attempt = 0;
    while (attempt < 3 && successfulResult === null) {
      attempt++;
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
            console.log(`✅ Successfully parsed JSON (attempt ${attempt}, model ${model})`);
            successfulResult = parsed;
            break;
          } catch (parseErr) {
            console.error(`⚠️ JSON parse error on ${model}:`, parseErr.message, "Raw:", text.slice(0, 200) + "...");
          }
        } else {
          const errorMsg = data.error?.message || `Status: ${response.status} ${response.statusText}`;
          console.warn(`⚠️ API error or invalid response from ${model}:`, errorMsg);
        }
      } catch (err) {
        console.error(`❌ Network error using ${model} (attempt ${attempt}):`, err.message);
      }
      await sleep(DELAY_MS);
    }
    if (successfulResult !== null) break;
  }

  // --- 4️⃣ Final Result Handling + Write to File ---
  if (!successfulResult) {
    console.error("🚨 All attempts failed. Returning empty curriculum object.");
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
