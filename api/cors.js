// ✅ Universal CORS Handler for Ready4Exam Automation (Node + Edge Compatible)
// Works for all backend routes like /api/manageSupabase, /api/gemini, etc.

export function getCorsHeaders(origin = "") {
  const allowedOrigins = [
    "https://tableautomation-5iuc.vercel.app",  // frontend developer tool
    "https://ready4exam.github.io",             // public GitHub frontend (if used)
    "http://localhost:3000",                    // local dev (Vercel preview)
    "http://127.0.0.1:5500"                     // local file testing
  ];

  const allowOrigin = allowedOrigins.includes(origin) ? origin : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// ✅ Direct access (for testing CORS route manually)
export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = getCorsHeaders(origin);

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  res.status(200).json({
    ok: true,
    message: "CORS preflight handled successfully.",
    origin,
  });
}
