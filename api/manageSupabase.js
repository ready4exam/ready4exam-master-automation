// /api/manageSupabase.js
import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./_cors.js"; // internal import
// If you renamed _cors.js → corsHandler.js, update the import accordingly

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = getCorsHeaders(origin);
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  // Handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST method allowed" });
  }

  try {
    const body = req.body ? JSON.parse(req.body) : {};
    const { csv, meta } = body;

    if (!csv || !meta) {
      return res.status(400).json({ error: "Missing CSV or meta data in request" });
    }

    // Supabase credentials
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: "Missing Supabase environment variables" });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse metadata
    const { className, subject, chapter } = meta;
    const tableName = `${className}_${subject}_${chapter}`
      .replace(/\s+/g, "_")
      .toLowerCase();

    // Create table if not exists
    await supabase.rpc("create_table_if_not_exists", { table_name: tableName });

    // Insert CSV data
    const { data, error } = await supabase
      .from(tableName)
      .insert(csv);

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      ok: true,
      message: `Table '${tableName}' created/updated successfully.`,
      inserted: data?.length || 0
    });
  } catch (err) {
    console.error("manageSupabase crash:", err);
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  }
}
