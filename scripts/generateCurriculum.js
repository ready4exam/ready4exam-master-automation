// scripts/generateCurriculum.js
import fs from "fs";
import path from "path";
import fetch from "node-fetch";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function generateCurriculumForClass(cls) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("❌ Missing GEMINI_API_KEY in environment variables.");

  console.log(`🧠 Generating NCERT-based curriculum for Class ${cls} via Gemini...`);

  const outputDir = path.join(process.cwd(), "temp_repo", "js");
  const curriculumFile = path.join(outputDir, "curriculum.js");

  // 🧊 Smart Freeze Logic
  if (fs.existsSync(curriculumFile)) {
    const content = fs.readFileSync(curriculumFile, "utf-8").trim();
    if (content.length > 50) {
      console.log(`🧊 curriculum.js already exists and contains data — skipping regeneration for Class ${cls}.`);
      try {
        const match = content.match(/export const curriculum = (.*);/s);
        if (match && match[1]) return JSON.parse(match[1]);
      } catch {
        console.warn("⚠️ Could not parse existing curriculum.js — regenerating.");
      }
    } else {
      console.warn(`⚠️ curriculum.js exists but empty — regenerating for Class ${cls}.`);
    }
  }

  const prompt = `
You are an NCERT academic expert.
Generate a **valid JSON** representing the official CBSE NCERT syllabus for **Class ${cls}**, including all streams (Science, Commerce, Humanities).

FORMAT:
{
  "Subject": {
    "Book Name": [
      { "chapter_title": "Exact Chapter Name", "table_id": "", "section": "" }
    ]
  }
}

RULES:
- Use official NCERT textbook titles.
- Include both parts where applicable (e.g., Physics Part I, Part II).
- If single-book subject, directly return array under subject.
- Return only JSON (no text commentary or markdown).
`;

  const models = ["gemini-2.5-pro", "gemini-2.5-flash"];
  let successfulResult = null;
  const DELAY_MS = 4000;

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
                temperature: 0.3,
                topP: 0.8,
                maxOutputTokens: 12288
              },
              response_schema: {
                type: "application/json"
              }
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
          } catch (err) {
            console.error(`⚠️ JSON parse error on ${model}: ${err.message}`);
            console.log("🔍 Raw Gemini output snippet:", text.slice(0, 300) + "...");
          }
        } else {
          const errMsg = data.error?.message || `Status: ${response.status} ${response.statusText}`;
          console.warn(`⚠️ Invalid or empty response from ${model}: ${errMsg}`);
        }
      } catch (err) {
        console.error(`❌ Network/API error on ${model} (Attempt ${attempt}):`, err.message);
      }
      await sleep(DELAY_MS);
    }
    if (successfulResult) break;
  }

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
