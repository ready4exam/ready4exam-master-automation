// -------------------- /api/updateCurriculum.js -------------------
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
    const { className = "9", chapterTitle, newId } = req.body || {};
    if (!chapterTitle || !newId) return res.status(400).json({ error: "Missing chapterTitle or newId" });

    const owner = process.env.GITHUB_OWNER;
    const repo = String(className) === "11" ? process.env.GITHUB_REPO_11 : process.env.GITHUB_REPO_9;
    const token = process.env.GITHUB_TOKEN;
    const filePath = "js/curriculum.js";
    if (!owner || !repo || !token) return res.status(500).json({ error: "Missing GitHub env vars" });

    // fetch current file
    const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    });
    if (!getRes.ok) return res.status(getRes.status).json({ error: `GitHub fetch failed: ${getRes.statusText}` });

    const fileData = await getRes.json();
    const content = Buffer.from(fileData.content, "base64").toString("utf-8");

    // replace ID for the matching chapter title (loose match on title)
    const normalized = (s) =>
      s.replace(/chapter\s*\d*[:\-]*/i, "").trim().toLowerCase();

    let found = false;
    const updated = content.replace(
      /\{\s*id:\s*["'`][^"'`]+["'`],\s*title:\s*["'`]([^"'`]+)["'`]\s*\}/g,
      (m, t) => {
        if (normalized(t).includes(normalized(chapterTitle))) {
          found = true;
          return m.replace(/id:\s*["'`][^"'`]+["'`]/, `id: "${newId}"`);
        }
        return m;
      }
    );

    if (!found) return res.status(404).json({ error: `Chapter "${chapterTitle}" not found` });

    const putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Auto-update ID for "${chapterTitle}" -> "${newId}"`,
        content: Buffer.from(updated).toString("base64"),
        sha: fileData.sha
      })
    });
    if (!putRes.ok) return res.status(putRes.status).json({ error: `GitHub update failed: ${putRes.statusText}` });

    const putJson = await putRes.json();
    return res.status(200).json({ message: "✅ curriculum.js updated", commit: putJson.commit?.sha });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
