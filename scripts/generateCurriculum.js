// scripts/generateCurriculum.js
import fetch from "node-fetch";

export async function generateCurriculumForClass(cls) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY in env");

  console.log(`🧠 Generating curriculum for class ${cls} via Gemini...`);

  const prompt = `
  Generate a structured JSON for CBSE Class ${cls} subjects and chapters
  based on the latest NCERT syllabus. Use this format:
  {
    "Science": {
      "Physics": ["Chapter1", "Chapter2"],
      "Chemistry": ["Chapter1", "Chapter2"],
      "Biology": ["Chapter1", "Chapter2"]
    },
    "Mathematics": {
      "Algebra": ["Chapter1", "Chapter2"]
    },
    ...
  }`;

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + GEMINI_API_KEY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

  try {
    const parsed = JSON.parse(text);
    console.log("✅ Curriculum generated successfully");
    return parsed;
  } catch (err) {
    console.error("❌ Gemini output parsing error:", err);
    console.log("Raw output:", text);
    throw err;
  }
}
