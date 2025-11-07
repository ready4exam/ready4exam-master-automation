// scripts/generateCurriculum.js
import fetch from "node-fetch";

/**
 * Generate NCERT curriculum for a given class using Gemini
 * • Classes 5–10 → simple subject→chapters JSON
 * • Classes 11–12 → stream→subject→book→chapter JSON
 */
export async function generateCurriculumForClass(cls) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY)
    throw new Error("❌ Missing GEMINI_API_KEY in environment variables");

  console.log(`🧠 Generating NCERT curriculum for Class ${cls} via Gemini...`);

  const isSenior = Number(cls) >= 11;
  const streamNote = isSenior
    ? `For Class ${cls}, group syllabus by streams — Science, Commerce, Humanities (Arts).
Each stream must list subjects, each subject its NCERT books (Part I, II …), and each book its official chapter list.`
    : `For Class ${cls}, generate normal subject→chapter JSON (no streams or books).`;

  const prompt = `
You are an NCERT syllabus expert.

Generate a STRICT and COMPLETE JSON listing all subjects, books, and chapters
from the official NCERT syllabus for CBSE Class ${cls}, session 2024–25.

${streamNote}

✅ Rules
• Follow ONLY official NCERT textbook titles.
• Include ALL books for subjects with Part I, Part II, etc.
• Maintain exact chapter numbers and order.
• Each subject must have subject_code, subject_name, and "books".
• Each book has book_name and an array of chapters (chapter_no + chapter_name).

✅ Example (for Class 11 Science)
{
  "Science":[
    {
      "subject_code":"PHY",
      "subject_name":"Physics",
      "books":[
        {"book_name":"Physics Part I","chapters":[
          {"chapter_no":1,"chapter_name":"Physical World"},
          {"chapter_no":2,"chapter_name":"Units and Measurements"}]},
        {"book_name":"Physics Part II","chapters":[
          {"chapter_no":9,"chapter_name":"Mechanical Properties of Solids"},
          {"chapter_no":10,"chapter_name":"Mechanical Properties of Fluids"}]}
      ]
    }
  ]
}

Return ONLY valid JSON (no markdown fences or commentary).
  `;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    console.log("✅ Curriculum generated successfully");
    return parsed;
  } catch (e) {
    console.error("❌ Gemini output parse error:", e);
    console.log("Raw text sample:", cleaned.slice(0, 400));
    throw new Error("Gemini returned invalid JSON");
  }
}
