// /api/dailyReport.js
// Sends a daily usage summary email based on usage_logs in Supabase_11

import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { getCorsHeaders } from "./_cors.js";

export const config = { runtime: "nodejs" };

function startOfTodayISO() {
  const d = new Date();
  // Use UTC day boundary for consistent cross-timezone reporting
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T00:00:00Z`;
}

export default async function handler(req, res) {
  const origin = req.headers?.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  // Only allow GET or POST (cron will call GET/POST depending on platform)
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!["GET", "POST"].includes(req.method)) {
    return res.status(405).json({ error: "Only GET/POST allowed" });
  }

  try {
    // Validate env
    const SUPABASE_URL = process.env.SUPABASE_URL_11;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY_11;
    const SMTP_HOST = process.env.SMTP_HOST;
    const SMTP_PORT = process.env.SMTP_PORT;
    const SMTP_USER = process.env.SMTP_USER;
    const SMTP_PASS = process.env.SMTP_PASS;
    const TO_EMAIL = process.env.DAILY_REPORT_EMAIL;
    const FROM_EMAIL = process.env.REPORT_FROM_EMAIL || SMTP_USER;

    if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Missing Supabase_11 env vars");
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) throw new Error("Missing SMTP env vars");
    if (!TO_EMAIL) throw new Error("Missing DAILY_REPORT_EMAIL env var");

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Determine date range: today (UTC)
    const since = startOfTodayISO();

    // Query usage_logs for today's entries
    // usage_logs columns: class_name, subject, book, chapter, table_name, inserted_count, refresh, created_at
    const { data: rows, error } = await supabase
      .from("usage_logs")
      .select("class_name,subject,book,chapter,table_name,inserted_count,refresh,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase query error:", error);
      throw error;
    }

    // Aggregate metrics
    const totalRuns = rows.length;
    const distinctTables = new Set(rows.map(r => r.table_name)).size;
    const totalInserted = rows.reduce((s, r) => s + (Number(r.inserted_count) || 0), 0);

    // Top chapters (by inserted_count)
    const top = [...rows]
      .filter(r => r.inserted_count)
      .sort((a, b) => (b.inserted_count || 0) - (a.inserted_count || 0))
      .slice(0, 10);

    // Compose HTML email
    const now = new Date().toISOString();
    const htmlRows = top.length
      ? top.map(r => `<tr>
          <td>${r.class_name}</td>
          <td>${r.subject}</td>
          <td>${r.book || "-"}</td>
          <td>${r.chapter}</td>
          <td>${r.table_name}</td>
          <td style="text-align:right">${r.inserted_count}</td>
        </tr>`).join("\n")
      : `<tr><td colspan="6" style="text-align:center">No inserts recorded today</td></tr>`;

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif; color:#111">
        <h2>Ready4Exam — Daily Supabase Usage Report</h2>
        <p><strong>Date (UTC):</strong> ${since.slice(0,10)}</p>
        <p><strong>Generated at:</strong> ${now}</p>
        <ul>
          <li><strong>Total runs:</strong> ${totalRuns}</li>
          <li><strong>Distinct tables created/updated:</strong> ${distinctTables}</li>
          <li><strong>Total questions inserted:</strong> ${totalInserted}</li>
        </ul>

        <h3>Top Chapters / Recent Activity</h3>
        <table width="100%" cellpadding="6" cellspacing="0" style="border-collapse:collapse; border:1px solid #ddd">
          <thead style="background:#f7f7f7">
            <tr>
              <th>Class</th><th>Subject</th><th>Book</th><th>Chapter</th><th>Table</th><th>Inserted</th>
            </tr>
          </thead>
          <tbody>
            ${htmlRows}
          </tbody>
        </table>

        <p style="margin-top:16px; font-size:12px; color:#666">This is an automated developer report from Ready4Exam master automation.</p>
      </div>
    `;

    // Send email with Nodemailer
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465, // true for 465, false for other ports
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    const mailOptions = {
      from: FROM_EMAIL,
      to: TO_EMAIL,
      subject: `[Ready4Exam] Daily Supabase Usage — ${since.slice(0,10)}`,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info.messageId || info);

    return res.status(200).json({
      ok: true,
      date: since.slice(0,10),
      totalRuns,
      distinctTables,
      totalInserted,
      topCount: top.length,
      emailInfo: info.messageId || info,
    });
  } catch (err) {
    console.error("dailyReport error:", err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
