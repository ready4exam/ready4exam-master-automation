// /api/cors.js
// CORS Handler – Full Fix for GitHub Pages deployment

export function getCorsHeaders(origin = "") {
  const allowedOrigins = [
    "https://tableautomation-5iuc.vercel.app",
    "https://ready4exam.github.io",
    "https://ready4exam.github.io/",
    "http://localhost:3000",
    "http://127.0.0.1:5500"
  ];

  const allowOrigin =
    allowedOrigins.some(o => origin && origin.startsWith(o.replace(/\/$/, "")))
      ? origin
      : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    "Access-Control-Allow-Credentials": "true"
  };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = getCorsHeaders(origin);

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }

  if (req.method === "OPTIONS") return res.status(200).end();

  res.status(200).json({
    ok: true,
    message: "CORS preflight OK",
    origin
  });
}
