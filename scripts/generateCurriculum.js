// scripts/generateCurriculum.js
import fetch from "node-fetch";

export async function generateCurriculumForClass(cls) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY)
    throw new Error("❌ Missing GEMINI_API_KEY in environment variables.");

  console.log(`🧠 Generating NCERT-based curriculum for Class ${cls} via Gemini...`);

  const prompt = `
You are an expert in NCERT CBSE education content design.

Generate a detailed structured JSON strictly following the *official NCERT syllabus for Class ${cls}*.
Include all subjects, their books (like Physics Part 1, Part 2), and their chapters.

⚠️ Important:
- Return only **valid JSON** (no markdown, commentary, or code blocks).
- Include all major streams (Science, Commerce, Humanities/Arts) if applicable.
- Each subject should contain all books and all chapters in correct NCERT order.
- Chapter names must match official NCERT textbook names.

Example format:
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
                temperature: 0.6,
                maxOutputTokens: 4096,
              },
            }),
          }
        );

        const data = await response.json();

        if (data?.error) {
          console.warn(`⚠️ API error or invalid response from ${model}: ${data.error.message}`);
          break; // move to next model
        }

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

        if (text && text.startsWith("{") && text.endsWith("}")) {
          try {
            const parsed = JSON.parse(text);
            console.log(`✅ Successfully parsed NCERT curriculum JSON (attempt ${attempt})`);
            return parsed;
          } catch (parseErr) {
            console.error("⚠️ JSON parsing failed. Retrying...");
          }
        } else {
          console.warn("⚠️ No valid text in Gemini response:", text.slice(0, 200));
        }
      } catch (err) {
        console.error(`❌ Gemini fetch error (attempt ${attempt}):`, err.message);
      }
    }
  }

  console.error("🚨 All attempts failed. Returning empty curriculum object.");
  return {};
}
