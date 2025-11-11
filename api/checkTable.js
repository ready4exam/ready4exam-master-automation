// /api/checkTable.js
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(200).json({ ok: false, error: "POST required" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { chapter } = body || {};
    if (!chapter) return res.status(400).json({ ok: false, error: "Missing chapter" });

    // same slug logic as manageSupabase
    const chapterSlug = chapter
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join("_");
    const tableName = `${chapterSlug}_quiz`;

    const supabaseUrl = process.env.SUPABASE_URL_11;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY_11;
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase credentials missing.");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1) Check information_schema for table existence
    const infoRes = await fetch(`${supabaseUrl}/rest/v1/rpc/pg_table_exists`, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ table_name: tableName }),
    }).catch(() => null);

    // If rpc endpoint not available, fallback to query information_schema
    let exists = false;
    let infoText = null;

    if (infoRes && infoRes.ok) {
      const infoJson = await infoRes.json().catch(() => null);
      infoText = infoJson;
      exists = !!infoJson?.exists || false;
    } else {
      // fallback select from information_schema.tables via restful SQL endpoint
      const q = `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='${tableName}'`;
      const qRes = await fetch(`${supabaseUrl}/rest/v1/query`, {
        method: "POST",
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const qText = await qRes.text().catch(() => null);
      infoText = qText;
      exists = qRes.ok && qText && qText !== "[]";
    }

    // 2) If exists, get row count and policies
    let rowCount = null;
    let policies = null;
    if (exists) {
      const { data, error } = await supabase.rpc("count_rows_in_table", { p_table: tableName }).catch(() => ({ data: null }));
      // Many projects won't have rpc function; do a safe select if possible
      try {
        const sel = await fetch(`${supabaseUrl}/rest/v1/${tableName}?select=count`, {
          method: "GET",
          headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
        });
        if (sel.ok) {
          const selJson = await sel.json().catch(() => null);
          // supabase will require a proper select expression; fallback below
        }
      } catch (e) {}
      // simpler: run count via SQL
      const q2 = `SELECT COUNT(*) as cnt FROM public.${tableName};`;
      const q2Res = await fetch(`${supabaseUrl}/rest/v1/query`, {
        method: "POST",
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: q2 }),
      });
      if (q2Res.ok) {
        const q2Text = await q2Res.text().catch(() => null);
        try {
          const js = JSON.parse(q2Text);
          rowCount = js?.[0]?.cnt ?? null;
        } catch {
          rowCount = q2Text;
        }
      } else {
        rowCount = "count query failed";
      }

      // get policies
      const policyQuery = `SELECT policyname, permissive, cmd, qual, check FROM pg_policies WHERE tablename='${tableName}';`;
      const polRes = await fetch(`${supabaseUrl}/rest/v1/query`, {
        method: "POST",
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: policyQuery }),
      });
      if (polRes.ok) {
        const polText = await polRes.text().catch(() => null);
        try { policies = JSON.parse(polText); } catch { policies = polText; }
      } else {
        policies = "policy query failed";
      }
    }

    return res.status(200).json({
      ok: true,
      tableName,
      exists,
      info: infoText,
      rowCount,
      policies,
    });
  } catch (err) {
    console.error("checkTable error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
