// scripts/testGeminiKey.js
// ------------------------------------------------------
// Hard-coded Gemini API key test (standalone, quick sanity check)
// ------------------------------------------------------

import fetch from "node-fetch";

// 🔹 Paste your actual Gemini 2.5 Flash key below
const GEMINI_API_KEY = "AIzaSyCvNMTytg4fuMxNvRpNyAT7eTBc_1S94RQ"; // <-- replace this

if (!GEMINI_API_KEY) {
  console.error("❌ Missing GEMINI_API_KEY. Please paste your key above.");
  process.exit(1);
}

async function testGemini() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const prompt = "Who are you?";

  console.log("🚀 Sending test request to Gemini 2.5 Flash...");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!res.ok) {
    console.error(`❌ Request failed → HTTP ${res.status}`);
    const errorText = await res.text();
    console.error("Response:", errorText);
    return;
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "(no response)";
  console.log("\n✅ Gemini API responded successfully:\n");
  console.log(text);
}

testGemini().catch((err) => {
  console.error("❌ Unexpected error:", err);
});
