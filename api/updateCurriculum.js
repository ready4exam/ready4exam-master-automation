// -------------------- /api/updateCurriculum.js --------------------
// Updates curriculum.js (or curriculum.json) in the class repo after table creation

import { Octokit } from "@octokit/rest";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { class_name, subject, chapter, new_table_id } = body;
    if (!class_name || !subject || !chapter || !new_table_id)
      return res.status(400).json({ error: "Missing parameters" });

    // GitHub config
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = `ready4exam-${class_name}`;
    const path = "js/curriculum.js";

    const octokit = new Octokit({ auth: token });

    // Fetch current curriculum.js
    const { data } = await octokit.repos.getContent({ owner, repo, path });
    const content = Buffer.from(data.content, "base64").toString("utf-8");

    // Replace chapter id with new table name
    const updatedContent = content.replace(
      new RegExp(`id:\\s*['"\`][^'"\`]+['"\`]([\\s,]+title:\\s*['"\`]${chapter})`, "g"),
      `id: "${new_table_id}"$1`
    );

    // Commit updated file
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: `🔄 Updated table mapping for ${chapter}`,
      content: Buffer.from(updatedContent).toString("base64"),
      sha: data.sha,
    });

    res.status(200).json({
      ok: true,
      message: `✅ Curriculum updated for ${chapter}`,
      repo,
    });
  } catch (err) {
    console.error("❌ updateCurriculum error:", err);
    res.status(500).json({ error: err.message });
  }
}
