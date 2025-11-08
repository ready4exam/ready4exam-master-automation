// -------------------- /api/gemini.js --------------------
// ✅ Edge-compatible Gemini 2.5 Flash integration
// Uses the unified getCorsHeaders() helper from _cors.js

import { getCorsHeaders } from "./_cors.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  // --- Build base CORS headers ---
  const origin = req.headers.get("origin") || "";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };

  // --- Handle preflight ---
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers });

  // --- Method check ---
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Only POST method allowed" }), {
      status: 405,
      headers
    });
  }

  // --- Read API key ---
  const apiKey = process.env.google_api;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing google_api environment variable" }), {
      status: 500,
      headers
    });
  }

  // --- Parse body safely ---
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers
    });
  }

  // --- Extract parameters ---
  const { prompt } = body || {};
  if (!prompt) {
    return new Response(JSON.stringify({ error: "Missing prompt" }), {
      status: 400,
      headers
    });
  }

  // --- Build Gemini payload ---
  const payload = { contents: [{ parts: [{ text: prompt }] }] };

  try {
    // --- Call Gemini 2.5 Flash API ---
    const resp = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify(payload)
      }
    );

    const rawText = await resp.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { raw: rawText };
    }

    if (!resp.ok) {
      return new Response(
        JSON.stringify({ error: "Gemini API failed", data }),
        { status: resp.status, headers }
      );
    }

    // --- Return Gemini data as JSON ---
    return new Response(JSON.stringify(data), { status: 200, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers
    });
  }
}
