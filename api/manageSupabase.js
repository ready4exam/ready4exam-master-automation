// -------------------- /api/manageSupabase.js --------------------
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "./_cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const headers = corsHeaders(origin);
  res.setHeader("Access-Control-Allow-Origin", headers["Access-Control-Allow-Origin"]);
  res.setHeader("Access-Control-Allow-Methods", headers["Access-Control-Allow-Methods"]);
  res.setHeader("Access-Control-Allow-Headers", headers["Access-Control-Allow-Headers"]);
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const { class: classValue = "9", tableName, rows } = req.body || {};
    if (!tableName || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    // choose supabase project by class
    const is11 = String(classValue) === "11";
    const supabaseUrl = is11 ? process.env.SUPABASE_URL_11 : process.env.SUPABASE_URL_9;
    const supabaseKey = is11 ? process.env.SUPABASE_SERVICE_KEY_11 : process.env.SUPABASE_SERVICE_KEY_9;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: `Missing Supabase creds for class ${classValue}` });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // create table, enable rls, add permissive policy (server-side batch writes)
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
          select 1 from pg_policies where tablename='${tableName}' and policyname='allow_all_read'
        ) then
          create policy "allow_all_read" on public.${tableName}
          for select to public using (true);
        end if;
        if not exists (
          select 1 from pg_policies where tablename='${tableName}' and policyname='server_insert'
        ) then
          create policy "server_insert" on public.${tableName}
          for insert to authenticated, anon with check (true);
        end if;
      end $$;
    `;
    const { error: ddlErr } = await supabase.rpc("execute_sql", { query: ddl });
    if (ddlErr) return res.status(500).json({ error: ddlErr.message });

    const { error: insertErr } = await supabase.from(tableName).insert(rows);
    if (insertErr) return res.status(500).json({ error: insertErr.message });

    return res.status(200).json({ message: `✅ ${rows.length} rows inserted into ${tableName} (class ${classValue})` });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
