// scripts/generateCurriculum.js
import fetch from "node-fetch";

export async function generateCurriculumForClass(cls) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("❌ Missing GEMINI_API_KEY in environment variables.");

  console.log(`🧠 Generating NCERT-based curriculum for Class ${cls} via Gemini...`);

  const prompt = `
You are an expert academic planner for CBSE NCERT curriculum design.

Generate a detailed structured JSON strictly following the *latest NCERT syllabus for Class ${cls}*.
Group subjects into major streams (Science, Commerce, Arts/Humanities) where applicable.

For each subject:
- Include all books under that subject (for example, Physics Part 1 and Physics Part 2).
- Under each book, list all chapters in correct NCERT order.

Output Format Example:
{
  "Science": {
    "Physics": {
      "Part 1": ["Chapter 1: Physical World", "Chapter 2: Units and Measurements"],
      "Part 2": ["Chapter 9: Mechanical Properties of Solids"]
    },
    "Chemistry": {
      "Part 1": ["Chapter 1: Some Basic Concepts of Chemistry"],
      "Part 2": ["Chapter 9: The s-Block Elements"]
    },
    "Biology": ["Chapter 1: The Living World", "Chapter 2: Biological Classification"],
    "Mathematics": ["Chapter 1: Sets", "Chapter 2: Relations and Functions"]
  },
  "Commerce": {
    "Accountancy": ["Chapter 1: Introduction to Accounting", "Chapter 2: Theory Base of Accounting"],
    "Business Studies": ["Chapter 1: Nature and Purpose of Business"],
    "Economics": ["Chapter 1: Introduction to Microeconomics"]
  },
  "Arts": {
    "History": ["Chapter 1: Writing and City Life"],
    "Political Science": ["Chapter 1: Constitution - Why and How?"],
    "Sociology": ["Chapter 1: Sociology and Society"],
    "Geography": ["Chapter 1: Geography as a Discipline"]
  }
}

Output only valid JSON — no explanations, no markdown.
  `;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  const data = await response.json();

  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "{}";

  try {
    const parsed = JSON.parse(rawText);
    console.log("✅ Gemini API returned structured curriculum data.");
    return parsed;
  } catch (err) {
    console.error("❌ Parsing error — Gemini did not return clean JSON.");
    console.log("🧩 Raw API Output:\n", rawText);
    return {};
  }
}
