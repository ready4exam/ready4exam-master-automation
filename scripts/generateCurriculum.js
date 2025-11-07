// scripts/generateCurriculum.js
import fetch from "node-fetch";

export async function generateCurriculumForClass(cls) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("❌ Missing GEMINI_API_KEY in environment variables.");

  console.log(`🧠 Generating NCERT-based curriculum for Class ${cls} via Gemini...`);

  const prompt = `
You are an expert academic planner for CBSE NCERT syllabus.
Generate a structured JSON strictly following the latest NCERT syllabus for Class ${cls}.
Group subjects by stream (Science, Commerce, Arts/Humanities) if applicable.

Each subject should include all NCERT books and chapters (Part 1, Part 2, etc.).
Return only valid JSON — no extra text, no markdown.
`;

  try {
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
    console.log("🧩 Gemini raw response keys:", Object.keys(data));
    console.log("📦 Full Gemini response snippet:", JSON.stringify(data, null, 2).slice(0, 600));

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "{}";

    try {
      const parsed = JSON.parse(rawText);
      console.log("✅ Gemini returned valid structured data.");
      return parsed;
    } catch (err) {
      console.error("⚠️ Could not parse JSON. Raw text output:\n", rawText);
      return {};
    }
  } catch (error) {
    console.error("❌ Gemini API fetch failed:", error);
    return {};
  }
}
