// -------------------- /api/manageSupabase.js --------------------
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "./_cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  res.set({ ...corsHeaders(origin), "Content-Type": "application/json" });

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const { class: classValue, tableName, rows } = req.body || {};

    if (!tableName || !Array.isArray(rows) || rows.length === 0) {
      return res
        .status(400)
        .json({ error: "Invalid body. Expect { class, tableName, rows[] }" });
    }

    // Pick Supabase project by class (9 vs 11). Default → 9.
    const is11 = String(classValue) === "11";

    const supabaseUrl = is11
      ? process.env.SUPABASE_URL_11
      : process.env.SUPABASE_URL_9;

    const supabaseKey = is11
      ? process.env.SUPABASE_SERVICE_KEY_11
      : process.env.SUPABASE_SERVICE_KEY_9;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        error: `Missing Supabase credentials for class ${classValue || 9}`,
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // DDL (create table + RLS + policies) using the "execute_sql" RPC helper
    const ddl = `
      create table if not exists public.${tableName} (
        id bigserial primary key,
        difficulty text,
        question_type text,
        question_text text,
        scenario_reason_text text,
        option_a text,
        option_b text,
        option_c text,
        option_d text,
        correct_answer_key text,
        created_at timestamp default now()
      );

      alter table public.${tableName} enable row level security;

      do $$
      begin
        if not exists (
          select 1 from pg_policies where tablename = '${tableName}' and policyname = 'r4e_read_all'
        ) then
          create policy r4e_read_all on public.${tableName}
          for select to anon, authenticated using (true);
        end if;

        if not exists (
          select 1 from pg_policies where tablename = '${tableName}' and policyname = 'r4e_insert_all'
        ) then
          create policy r4e_insert_all on public.${tableName}
          for insert to anon, authenticated with check (true);
        end if;
      end$$;
    `;

    // Some projects may not have the RPC installed; try/catch it.
    try {
      const { error: ddlErr } = await supabase.rpc("execute_sql", { query: ddl });
      if (ddlErr) console.warn("DDL RPC error (non-fatal):", ddlErr.message);
    } catch (e) {
      console.warn("DDL RPC not available. Skipping DDL.", e?.message || e);
    }

    // Insert
    const { error: insertError } = await supabase.from(tableName).insert(rows);
    if (insertError) throw insertError;

    return res.status(200).json({
      message: `✅ Inserted ${rows.length} rows into ${tableName} (class ${classValue || 9})`,
    });
  } catch (err) {
    console.error("❌ manageSupabase error:", err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
