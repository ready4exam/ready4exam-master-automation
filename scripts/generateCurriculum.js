// scripts/generateCurriculum.js
import fetch from "node-fetch";

// Utility function to pause execution for a given number of milliseconds
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generates the complete NCERT curriculum for a given class using the Gemini API.
 * @param {number} cls - The class number (e.g., 11).
 * @returns {Promise<object>} The curriculum data as a parsed JSON object.
 */
export async function generateCurriculumForClass(cls) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("❌ Missing GEMINI_API_KEY in environment variables.");

  console.log(`🧠 Generating NCERT-based curriculum for Class ${cls} via Gemini...`);

  // --- 1. Prompt Definition ---

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

  // --- 2. API Call and Retry Logic ---

  const models = ["gemini-2.5-flash", "gemini-2.5-pro"];
  let attempt = 0;
  let successfulResult = null;
  const DELAY_MS = 3000; // 3-second delay between attempts

  for (const model of models) {
    attempt = 0; // Reset attempt count for the new model
    while (attempt < 3 && successfulResult === null) {
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
              // Correct configuration key for the REST API
              generationConfig: {
                temperature: 0.5,
                maxOutputTokens: 4096,
                responseMimeType: "application/json", 
              },
            }),
          }
        );

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

        if (response.ok && text) {
          try {
            // Parse the output guaranteed to be JSON
            const parsed = JSON.parse(text); 
            console.log(`✅ Successfully parsed JSON (attempt ${attempt}, model ${model})`);
            successfulResult = parsed;
            break; // Success! Exit the inner loop
          } catch (parseErr) {
            console.error(`⚠️ JSON parse error on model ${model}:`, parseErr.message, "Raw Text:", text.slice(0, 120) + "...");
          }
        } else {
          // Log API-level errors (e.g., 400, 500, or empty 200 responses)
          const errorMsg = data.error?.message || `Status: ${response.status} ${response.statusText}`;
          console.warn(`⚠️ API error or invalid response from ${model}:`, errorMsg);
        }
      } catch (err) {
        // Log network errors
        console.error(`❌ Network error using ${model} (attempt ${attempt}):`, err.message);
      }
      
      // ⏳ Pause before the next attempt to allow the model to recover/become available
      await sleep(DELAY_MS); 
    }
    if (successfulResult !== null) break; // Exit the model loop on success
  }

  // --- 3. Final Result Handling ---
  if (successfulResult !== null) {
    return successfulResult;
  } else {
    console.error("🚨 All attempts failed. Returning empty curriculum object.");
    return {};
  }
}
