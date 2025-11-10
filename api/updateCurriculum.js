import fetch from "cross-fetch";
import { getCorsHeaders } from "./cors.js";

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  Object.entries({ ...getCorsHeaders(origin), "Content-Type": "application/json" })
    .forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { className, subject, book, chapter, tableName } =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const githubRepo = `ready4exam-${className}`;
    const githubToken = process.env.GITHUB_TOKEN;
    const filePath = `js/curriculum.js`;

    const resp = await fetch(`https://api.github.com/repos/ready4exam/${githubRepo}/contents/${filePath}`, {
      headers: { Authorization: `token ${githubToken}` },
    });
    const fileData = await resp.json();
    const content = Buffer.from(fileData.content, "base64").toString("utf-8");

    const updated = content.replace(
      new RegExp(`("chapter_title"\\s*:\\s*"${chapter}".*?"table_id"\\s*:\\s*")([^"]*)"`, "s"),
      `$1${tableName}"`
    );

    await fetch(`https://api.github.com/repos/ready4exam/${githubRepo}/contents/${filePath}`, {
      method: "PUT",
      headers: {
        Authorization: `token ${githubToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `Auto-update table_id → ${tableName}`,
        content: Buffer.from(updated).toString("base64"),
        sha: fileData.sha,
      }),
    });

    res.status(200).json({ ok: true, message: "Curriculum updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
