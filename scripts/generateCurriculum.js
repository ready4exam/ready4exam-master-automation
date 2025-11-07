// scripts/generateCurriculum.js
import fetch from "node-fetch";

export async function generateCurriculumForClass(cls) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("❌ Missing GEMINI_API_KEY in environment variables.");

  console.log(`🧠 Generating NCERT-based curriculum for Class ${cls} via Gemini...`);

  const prompt = `
You are an expert academic planner for the CBSE NCERT syllabus.

Generate a **strictly valid JSON** object describing the complete Class ${cls} curriculum
as per the latest NCERT books. Include all subjects, their books (e.g., Physics Part 1, Part 2),
and the chapters under each book.

Ensure the output:
- Is *pure JSON only* (no text, comments, or markdown).
- Accurately reflects official NCERT book structure and naming.
- Includes all streams (Science, Commerce, Humanities/Arts) if applicable.

Format example:
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
    "Biology": ["Chapter 1: The Living World", "Chapter 2: Biological Classification"]
  },
  "Commerce": {
    "Accountancy": ["Chapter 1: Introduction to Accounting"],
    "Business Studies": ["Chapter 1: Nature and Purpose of Business"],
    "Economics": ["Chapter 1: Introduction to Microeconomics"]
  },
  "Humanities": {
    "History": ["Chapter 1: Writing and City Life"],
    "Political Science": ["Chapter 1: Constitution - Why and How?"],
    "Geography": ["Chapter 1: Geography as a Discipline"]
  }
}

Return only the JSON — nothing else.
`;

  const models = ["gemini-2.5-flash", "gemini-2.5-pro"];
  let attempt = 0;

  for (const model of models) {
    while (attempt < 3) {
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
                temperature: 0.7,
                maxOutputTokens: 4096,
              },
            }),
          }
        );

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

        if (text && text.startsWith("{") && text.endsWith("}")) {
          try {
            const parsed = JSON.parse(text);
            console.log(`✅ Successfully parsed JSON (attempt ${attempt}, model ${model})`);
            return parsed;
          } catch (parseErr) {
            console.error("⚠️ JSON parse error, retrying...");
          }
        } else {
          console.warn(`⚠️ Empty or invalid response from ${model}:`, text.slice(0, 120));
        }
      } catch (err) {
        console.error(`❌ Error using ${model} (attempt ${attempt}):`, err.message);
      }
    }
  }

  console.error("🚨 All attempts failed. Returning empty curriculum object.");
  return {};
}
