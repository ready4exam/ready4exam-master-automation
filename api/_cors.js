// /api/_cors.js
// ✅ Updated universal CORS handler
// Works for both Automation 1 (Gemini) & Automation 2 (Supabase + Curriculum)

export default function handler(req, res) {
  // --- Allow specific trusted origins ---
  const allowedOrigins = [
    "https://tableautomation-5iuc.vercel.app",
    "https://ready4exam.github.io",
    "http://localhost:3000",
    "http://127.0.0.1:5500"
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    // Default fallback — useful during early testing
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  // --- Allow required methods & headers ---
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // --- Handle preflight (OPTIONS) requests immediately ---
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // --- Response for direct access (optional debug) ---
  res.status(200).json({
    ok: true,
    message: "✅ CORS preflight handled successfully.",
    origin: origin || "unknown",
  });
}
