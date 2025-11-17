// /api/updateCurriculum.js
import { Octokit } from "@octokit/rest";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

// Replace table_id inside curriculum object
function updateTableId(curriculumObj, subject, book, chapterTitle, newTableId) {
  for (const subjKey of Object.keys(curriculumObj)) {
    if (subject && subjKey.toLowerCase() !== subject.toLowerCase()) continue;
    for (const bookKey of Object.keys(curriculumObj[subjKey])) {
      if (book && bookKey.toLowerCase() !== book.toLowerCase()) continue;

      const chapters = curriculumObj[subjKey][bookKey];
      if (!Array.isArray(chapters)) continue;

      for (let i = 0; i < chapters.length; i++) {
        if (
          chapters[i].chapter_title.trim().toLowerCase() ===
          chapterTitle.trim().toLowerCase()
        ) {
          const old = chapters[i].table_id;
          chapters[i].table_id = newTableId;
          console.log("🟢 Chapter updated", { subjKey, bookKey, i, old, newTableId });
          return { updated: true };
        }
      }
    }
  }
  return { updated: false };
}

export default async function handler(req, res) {
  try {
    const origin = req.headers.origin || "*";
    const corsHeaders = getCorsHeaders(origin);
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");

    // Preflight
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST")
      return res.status(405).json({ ok: false, error: "Only POST allowed" });

    console.log("📌 updateCurriculum API triggered");

    const { class_name, subject, book, chapter, new_table_id } = req.body || {};
    if (!class_name || !chapter || !new_table_id) {
      return res.status(400).json({ ok: false, error: "Missing parameters" });
    }

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    if (!token || !owner) throw new Error("GitHub credentials missing");

    const repo = `ready4exam-${class_name}`;
    const path = "js/curriculum.js";

    const octokit = new Octokit({ auth: token });

    // Get curriculum.js
    const contentRes = await octokit.repos.getContent({ owner, repo, path });
    const fileSha = contentRes.data.sha;
    const raw = Buffer.from(contentRes.data.content, "base64").toString("utf-8");

    // Extract JSON object from JS export file
    const match = raw.match(/export\s+const\s+curriculum\s*=\s*(\{[\s\S]*\})\s*;/m);
    if (!match) {
      console.error("❌ curriculum.js format mismatch");
      return res.status(500).json({ ok: false, error: "curriculum.js format invalid" });
    }

    const parsed = JSON.parse(match[1]);

    // Update the table_id for correct chapter
    const result = updateTableId(parsed, subject, book, chapter, new_table_id);
    if (!result.updated) {
      console.warn("⚠️ No matching chapter found", chapter);
      return res.status(404).json({ ok: false, error: "Chapter not found" });
    }

    // Replace in file
    const updatedJson = JSON.stringify(parsed, null, 2);
    const newFileText = raw.replace(match[0], `export const curriculum = ${updatedJson};`);

    // Commit the updated file to GitHub
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: `🔄 Update table_id for "${chapter}" → ${new_table_id}`,
      content: Buffer.from(newFileText).toString("base64"),
      sha: fileSha,
    });

    console.log("✔ Pushed update to GitHub Repo:", repo);

    return res.status(200).json({
      ok: true,
      message: "Curriculum updated successfully 🎯",
      repo,
      new_table_id
    });

  } catch (err) {
    console.error("🔥 updateCurriculum ERROR:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
}
