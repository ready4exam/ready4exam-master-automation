// -------------------- /api/updateCurriculum.js --------------------
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
    const { className, chapterTitle, newId } = req.body || {};
    if (!className || !chapterTitle || !newId) {
      return res
        .status(400)
        .json({ error: "Missing className, chapterTitle or newId" });
    }

    // Choose which repo to commit to
    const owner = process.env.GITHUB_OWNER;
    const token = process.env.GITHUB_TOKEN;

    const repo =
      String(className) === "11"
        ? process.env.GITHUB_REPO_11 || process.env.GITHUB_REPO
        : process.env.GITHUB_REPO_9 || process.env.GITHUB_REPO;

    if (!owner || !token || !repo) {
      return res
        .status(500)
        .json({ error: "Missing GITHUB_OWNER / GITHUB_TOKEN / GITHUB_REPO(_9/_11)" });
    }

    const filePath = "js/curriculum.js";

    // Fetch file metadata + contents
    const fileRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!fileRes.ok) {
      return res
        .status(fileRes.status)
        .json({ error: `GitHub fetch failed: ${fileRes.statusText}` });
    }

    const fileData = await fileRes.json();
    const content = Buffer.from(fileData.content, "base64").toString("utf8");

    // Normalize titles (remove "Chapter X" prefixes and punctuation/spaces)
    const norm = (s) =>
      String(s)
        .toLowerCase()
        .replace(/chapter\s*\d+[:\-]?\s*/i, "")
        .replace(/[^\w]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const want = norm(chapterTitle);
    let found = false;

    // Replace id in objects like: { id: "...", title: "..." }
    const updated = content.replace(
      /\{\s*id\s*:\s*["'`](.*?)["'`]\s*,\s*title\s*:\s*["'`]([^"'`]+)["'`]\s*\}/g,
      (m, id, title) => {
        if (norm(title) === want || norm(title).includes(want) || want.includes(norm(title))) {
          found = true;
          return m.replace(/id\s*:\s*["'`](.*?)["'`]/, `id: "${newId}"`);
        }
        return m;
      }
    );

    if (!found) {
      return res.status(404).json({
        error: `Chapter title not found in curriculum.js: "${chapterTitle}"`,
      });
    }

    // Commit back
    const putRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Auto-update curriculum: "${chapterTitle}" → "${newId}"`,
          content: Buffer.from(updated, "utf8").toString("base64"),
          sha: fileData.sha,
        }),
      }
    );

    if (!putRes.ok) {
      return res
        .status(putRes.status)
        .json({ error: `GitHub update failed: ${putRes.statusText}` });
    }

    const result = await putRes.json();
    return res.status(200).json({
      message: "✅ curriculum.js updated",
      commitSHA: result?.commit?.sha || null,
      repo,
    });
  } catch (err) {
    console.error("❌ updateCurriculum error:", err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
