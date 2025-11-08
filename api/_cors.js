// -------------------- /api/_cors.js --------------------
// ✅ Universal CORS helper for both Edge & Node runtimes

export function getCorsHeaders(origin = "") {
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
}

// ✅ Optional: Node.js–style handler for manual testing or preflight debugging
export default function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = getCorsHeaders(origin);
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  if (req.method === "OPTIONS") return res.status(200).end();
  res.status(200).json({ ok: true, message: "CORS preflight handled." });
}
