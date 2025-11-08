// /api/manageSupabase.js
import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./_cors.js"; // keep this (do not rename)

export default async function handler(req, res) {
  try {
    // --- Set CORS headers ---
    const origin = req.headers.origin || "*";
    const headers = getCorsHeaders(origin);
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Only POST method allowed" });
    }

    // --- Debug logs for environment ---
    console.log("🔍 SUPABASE_URL:", process.env.SUPABASE_URL);
    console.log("🔍 SUPABASE_SERVICE_KEY present:", !!process.env.SUPABASE_SERVICE_KEY);

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase environment variables");
    }

    // --- Create client ---
    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- Parse request body ---
    let body;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch {
      body = {};
    }

    const { csv, meta } = body;
    if (!csv || !meta) {
      throw new Error("Missing CSV or meta data in request");
    }

    const { className, subject, chapter } = meta;
    const tableName = `${className}_${subject}_${chapter}`
      .replace(/\s+/g, "_")
      .toLowerCase();

    console.log("🧩 Creating table:", tableName);

    // --- Example insert (adjust according to your schema) ---
    const { data, error } = await supabase
      .from(tableName)
      .insert(csv);

    if (error) throw error;

    res.status(200).json({
      ok: true,
      message: `Table '${tableName}' created/updated successfully.`,
      inserted: data?.length || 0,
    });
  } catch (err) {
    console.error("❌ manageSupabase crash:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
}
