// -------------------- /api/_cors.js --------------------
export function corsHeaders(origin) {
  const allowedOrigins = new Set([
    "https://ready4exam.github.io",                                // GitHub Pages frontend
    "https://tableautomation-5iuc.vercel.app",                     // Vercel preview (frontend)
    "https://ready4exam-master-automation.vercel.app",             // backend itself (safe)
    "http://localhost:5500",
    "http://127.0.0.1:5500"
  ]);

  const allow = allowedOrigins.has(origin) ? origin : "https://ready4exam.github.io";

  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}
