// /api/config.js
// -----------------------------------------------------------------------------
// Serves environment-based Firebase + Supabase credentials securely to frontend
// -----------------------------------------------------------------------------

export default async function handler(req, res) {
  try {
    return res.status(200).json({
      firebase: {
        apiKey: process.env.FIREBASE_API_KEY_1112,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN_1112,
        projectId: process.env.FIREBASE_PROJECT_ID_1112,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET_1112,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID_1112,
        appId: process.env.FIREBASE_APP_ID_1112,
        measurementId: process.env.FIREBASE_MEASUREMENT_ID_1112,
      },
      supabase: {
        url: process.env.SUPABASE_URL_11,
        anonKey: process.env.SUPABASE_SERVICE_KEY_11,
      },
    });
  } catch (err) {
    console.error("[API CONFIG] Failed to load env vars:", err);
    return res.status(500).json({ error: "Failed to load config" });
  }
}
