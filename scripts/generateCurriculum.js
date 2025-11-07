// scripts/generateCurriculum.js
import fetch from "node-fetch";

/**
 * Generate a structured NCERT curriculum for a given class via Gemini API
 */
export async function generateCurriculumForClass(cls) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("❌ Missing GEMINI_API_KEY in environment variables");

  console.log(`🧠 Generating curriculum for Class ${cls} via Gemini...`);

  const prompt = `
  Generate a structured JSON for CBSE Class ${cls} subjects and chapters
  based on the latest NCERT syllabus.
  Use this format only (no markdown, no comments):
  {
    "Science": {
      "Physics": ["Chapter1", "Chapter2"],
      "Chemistry": ["Chapter1", "Chapter2"],
      "Biology": ["Chapter1", "Chapter2"]
    },
    "Mathematics": {
      "Algebra": ["Chapter1", "Chapter2"]
    }
  }`;

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
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    // 🧹 Clean output to handle Gemini occasionally wrapping JSON in Markdown
    const cleaned = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    console.log("✅ Curriculum generated successfully");
    return parsed;
  } catch (err) {
    console.error("❌ Gemini output parsing error:", err);
    throw new Error("Gemini returned invalid JSON");
  }
}
