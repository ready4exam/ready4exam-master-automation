// -------------------- /api/gemini.js --------------------
import { corsHeaders } from "./_cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || "";
  res.set({ ...corsHeaders(origin), "Content-Type": "application/json" });

  // Preflight
  if (req.method === "OPTIONS") return res.status(200).end();

  // Methods
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  // Env
  const apiKey = process.env.google_api;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing env google_api" });
  }

  // Body
  let body = {};
  try {
    body =
      req.body && typeof req.body === "object"
        ? req.body
        : JSON.parse(
            await new Promise((resolve, reject) => {
              let raw = "";
              req.on("data", (c) => (raw += c));
              req.on("end", () => resolve(raw || "{}"));
              req.on("error", reject);
            })
          );
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const { prompt } = body || {};
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  // Call Gemini
  try {
    const payload = { contents: [{ parts: [{ text: prompt }] }] };

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(payload),
      }
    );

    const text = await response.text();
    let data = {};
    try {
      data = JSON.parse(text || "{}");
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      console.error("❌ Gemini API error:", data);
      return res
        .status(response.status)
        .json({ error: "Gemini API failed", data });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("🔥 Gemini error:", err);
    return res.status(500).json({ error: err.message });
  }
}
