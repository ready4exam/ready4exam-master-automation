// /api/debug-env.js  (temporary route)
export default function handler(req, res) {
  res.json({
    hasKey: !!process.env.GEMINI_API_KEY,
    length: process.env.GEMINI_API_KEY?.length || 0,
  });
}
