// scripts/generateCurriculum.js
import fetch from "node-fetch";

export async function generateCurriculumForClass(cls) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("❌ Missing GEMINI_API_KEY in environment variables.");

  console.log(`🧠 Generating NCERT-based curriculum for Class ${cls} via Gemini...`);

  // --- 1. Simplified Prompt for Reliability ---
  const prompt = `
You are an expert academic planner for the CBSE NCERT syllabus.
Generate a **strictly valid JSON object** describing the complete Class ${cls} curriculum
as per the latest NCERT books.

The JSON should use **Subject Name** as the top-level key.
The value for each Subject must be an object where the **Book Name** (e.g., 'Physics Part I', 'Biology (Single Book)') is the key, and the value is a **list of chapter titles** exactly as they appear in the NCERT book.

Ensure the output:
- Is **pure, raw JSON only** (do not wrap in markdown or comments).
- Accurately reflects official NCERT book structure and naming.
- Includes all streams (Science, Commerce, Humanities/Arts).
`;

  // --- 2. Define a Response Schema (Optional but recommended for robust JSON) ---
  const responseSchema = {
    type: "OBJECT",
    properties: {
      Physics: {
        type: "OBJECT",
        description: "Science stream subject.",
        properties: {
          "Physics Part I": { type: "ARRAY", items: { type: "STRING" } },
          "Physics Part II": { type: "ARRAY", items: { type: "STRING" } }
        }
      },
      Chemistry: { type: "OBJECT" },
      // ... include schemas for other top-level subjects (Accountancy, History, etc.)
    },
    // Allows the model to include other subjects not explicitly listed above
    additionalProperties: true
  };

  const models = ["gemini-2.5-flash", "gemini-2.5-pro"];
  let attempt = 0;

  for (const model of models) {
    // Reset attempt count for the new model
    attempt = 0; 
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
                temperature: 0.5, // Lower temperature for factual data
                maxOutputTokens: 4096,
                // --- 3. Key Fix: Ensure JSON Output ---
                responseMimeType: "application/json", 
                responseSchema: responseSchema,
              },
            }),
          }
        );

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

        if (response.ok && text) {
          try {
            // Because we set responseMimeType, the output should be clean JSON.
            const parsed = JSON.parse(text); 
            console.log(`✅ Successfully parsed JSON (attempt ${attempt}, model ${model})`);
            return parsed;
          } catch (parseErr) {
            console.error(`⚠️ JSON parse error on model ${model}:`, parseErr.message, "Raw Text:", text.slice(0, 120) + "...");
          }
        } else {
          // Check for API-level errors
          const errorMsg = data.error?.message || `Status: ${response.status} ${response.statusText}`;
          console.warn(`⚠️ API error or invalid response from ${model}:`, errorMsg);
        }
      } catch (err) {
        console.error(`❌ Network error using ${model} (attempt ${attempt}):`, err.message);
      }
    }
  }

  console.error("🚨 All attempts failed. Returning empty curriculum object.");
  return {};
}

// Ensure you have 'node-fetch' installed: npm install node-fetch
// And set your API key: export GEMINI_API_KEY='your_key_here'
