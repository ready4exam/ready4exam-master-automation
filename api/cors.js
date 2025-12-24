// ============================================================================
// /api/cors.js — SHARED CORS HELPER (Final Version)
// Includes support for Supabase headers (apikey, x-client-info)
// ============================================================================

export const config = { runtime: "nodejs" };

export function getCorsHeaders(origin = "") {
  const allowedOrigins = [
    "https://tableautomation-5iuc.vercel.app",
    "https://ready4exam.github.io",
    "http://localhost:3000",
    "http://127.0.0.1:5500"
  ];

  // Check if origin is allowed (or allow all if unknown for flexibility)
  const isAllowed = allowedOrigins.some(o => 
    origin && origin.startsWith(o.replace(/\/$/, ""))
  );

  const allowOrigin = isAllowed ? origin : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE",
    // ⭐ CRITICAL FIX: Added 'apikey' and 'x-client-info' for Supabase
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, apikey, x-client-info",
    "Access-Control-Allow-Credentials": "true"
  };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const headers = getCorsHeaders(origin);

  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  res.status(200).json({
    ok: true,
    message: "CORS preflight OK",
    origin
  });
}
