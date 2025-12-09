// ============================================================================
//  BULLETPROOF FALLBACK MODEL CHAIN (FREE-TIER SAFE)
// ============================================================================
const MODEL_CHAIN = [
  "gemini-2.5-flash",     // best, 1M tokens
  "gemini-flash-latest",  // stable fallback
  "gemini-2.0-flash",     // reliable fallback
  "gemini-2.5-flash-lite" // emergency fallback
];

// ============================================================================
//  BULLETPROOF CALL GEMINI (Retries + Fallbacks)
// ============================================================================
async function callGemini(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);

  let lastError = null;

  for (const model of MODEL_CHAIN) {
    console.log(`⚡ API Trying model: ${model}`);

    try {
      const g = client.getGenerativeModel({ model });
      const out = await g.generateContent(prompt);
      const text = out.response.text();

      if (!text || !text.trim()) {
        console.log(`⚠ Model ${model} returned EMPTY → switching`);
        continue;
      }

      console.log(`✅ SUCCESS using model ${model}`);
      return text;
    } catch (err) {
      const status = err?.status;
      lastError = err;

      console.log(`❌ Model ${model} failed (${status}): ${err.message}`);

      // QUOTA EXHAUSTED → immediate fallback
      if (status === 429) {
        console.log(`🔄 QUOTA EXHAUSTED for ${model} → switching`);
        continue;
      }

      // Server busy → retry same model 1 time
      if (status === 500 || status === 503) {
        console.log(`🔁 Retrying model ${model} after 1s...`);
        await new Promise((res) => setTimeout(res, 1000));

        try {
          const g2 = client.getGenerativeModel({ model });
          const out2 = await g2.generateContent(prompt);
          const text2 = out2.response.text();

          if (text2?.trim()) {
            console.log(`✅ SUCCESS on retry using ${model}`);
            return text2;
          }
        } catch (err2) {
          console.log(`❌ Retry also failed for ${model}`);
        }

        continue;
      }

      // Anything else → skip
      console.log(`⏭ Skipping model ${model}`);
      continue;
    }
  }

  throw lastError || new Error("ALL_MODELS_FAILED");
}
