// scripts/generateCurriculum.js
import fetch from "node-fetch";

/**
 * Generate NCERT curriculum for a given class using Gemini
 * - Strictly follows official NCERT syllabus (2024–25)
 * - Adds subject codes and chapter numbers
 * - Produces JSON ready for Supabase or frontend use
 */
export async function generateCurriculumForClass(cls) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("❌ Missing GEMINI_API_KEY in environment variables");

  console.log(`🧠 Generating NCERT curriculum for Class ${cls} via Gemini...`);

  const prompt = `
You are an NCERT syllabus expert and data formatter.

Generate a STRICT and COMPLETE JSON object listing all subjects and chapters 
from the official NCERT syllabus for CBSE Class ${cls}, academic session 2024–25.

✅ Rules:
- Follow ONLY official NCERT textbook chapter names.
- Include ALL chapters for each subject exactly as per NCERT.
- DO NOT invent, rename, summarize, or skip any chapter.
- Each subject must include chapter numbers and codes for database consistency.
- Use this schema strictly:

{
  "subject_code": "unique short code for subject (like PHY, CHE, BIO, MAT, ENG)",
  "subject_name": "string",
  "chapters": [
    {
      "chapter_no": "integer",
      "chapter_name": "exact NCERT chapter title"
    }
  ]
}

✅ Example Output Format:
[
  {
    "subject_code": "PHY",
    "subject_name": "Physics",
    "chapters": [
      { "chapter_no": 1, "chapter_name": "Physical World" },
      { "chapter_no": 2, "chapter_name": "Units and Measurements" }
    ]
  },
  {
    "subject_code": "CHE",
    "subject_name": "Chemistry",
    "chapters": [
      { "chapter_no": 1, "chapter_name": "Some Basic Concepts of Chemistry" }
    ]
  }
]

Return ONLY valid JSON without markdown, commentary, or code fences.
  `;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    // 🧹 Clean Gemini output (remove markdown fences, trim)
    const cleaned = rawText
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    // 🧾 Parse JSON
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
      console.log("✅ Curriculum generated successfully");
    } catch (err) {
      console.error("❌ Gemini output parsing error:", err);
      console.log("Raw Gemini text was:", cleaned.slice(0, 500));
      throw new Error("Gemini returned invalid JSON");
    }

    // 🧩 Optional validation for expected fields
    if (!Array.isArray(parsed)) {
      console.warn("⚠️ Gemini output is not an array, wrapping for consistency...");
      return [parsed];
    }

    // Add consistency check: ensure every subject has code, name, and chapters
    for (const subj of parsed) {
      if (!subj.subject_code || !subj.subject_name || !Array.isArray(subj.chapters)) {
        console.warn(`⚠️ Incomplete data in subject entry: ${JSON.stringify(subj).slice(0, 100)}`);
      }
    }

    // ✅ Return ready-to-use structured curriculum
    return parsed;
  } catch (err) {
    console.error("❌ Error while generating curriculum from Gemini:", err.message);
    throw err;
  }
}
