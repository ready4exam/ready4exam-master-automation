// -------------------- /api/_cors.js --------------------
export function corsHeaders(origin = "") {
  const allowed = new Set([
    "https://ready4exam.github.io",
    "https://tableautomation-5iuc.vercel.app",
    "https://tableautomation.vercel.app",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
  ]);

  // Default to GitHub Pages origin if the request origin isn't recognized
  const allowOrigin = allowed.has(origin)
    ? origin
    : "https://ready4exam.github.io";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
