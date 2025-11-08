// -------------------- /api/_cors.js --------------------
// ✅ Universal CORS helper for both Edge & Node runtimes
// Fully Vercel-compatible (no runtime build errors)

export function getCorsHeaders(origin = "") {
  try {
    const allowedOrigins = [
      "https://tableautomation-5iuc.vercel.app",
      "https://ready4exam.github.io",
      "http://localhost:3000",
      "http://127.0.0.1:5500"
    ];

    const allowOrigin = allowedOrigins.includes(origin) ? origin : "*";

    return {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };
  } catch (err) {
    // If anything breaks (Edge sandbox), return safe fallback
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };
  }
}

// ✅ Optional Node-only default handler (won’t run in Edge)
export default async function handler(req, res) {
  try {
    // Defensive: Only execute Node runtime APIs if res is defined
    if (!res) return new Response("CORS helper active", { status: 200 });

    const origin = req.headers?.origin || "*";
    const headers = getCorsHeaders(origin);

    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }

    if (req.method === "OPTIONS") return res.status(200).end();

    res.status(200).json({
      ok: true,
      message: "CORS preflight handled successfully.",
      origin
    });
  } catch (err) {
    if (res) res.status(500).json({ error: err.message });
  }
}
