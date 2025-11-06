// -------------------- /api/gemini.js --------------------
import { corsHeaders } from "./_cors.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  const origin = req.headers.get("origin") || "";
  const headers = { ...corsHeaders(origin), "Content-Type": "application/json" };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Only POST method allowed" }), { status: 405, headers });
  }

  const apiKey = process.env.google_api;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing google_api environment variable" }), { status: 500, headers });
  }

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
  }

  const { prompt } = body || {};
  if (!prompt) {
    return new Response(JSON.stringify({ error: "Missing prompt" }), { status: 400, headers });
  }

  const payload = { contents: [{ parts: [{ text: prompt }] }] };

  try {
    const resp = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(payload)
      }
    );

    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: "Gemini API failed", data }), { status: resp.status, headers });
    }

    return new Response(JSON.stringify(data), { status: 200, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}
