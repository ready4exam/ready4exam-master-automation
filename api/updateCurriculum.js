// /api/updateCurriculum.js
import { Octokit } from "@octokit/rest";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

// Replace table_id inside curriculum object accurately
function updateTableId(curriculumObj, subject, book, chapterTitle, newTableId) {
  const subjects = Object.keys(curriculumObj || {});
  for (const subjKey of subjects) {
    if (subject &&
      subjKey.toLowerCase() !== subject.toLowerCase() &&
      !subjKey.toLowerCase().includes(subject.toLowerCase())) {
      continue;
    }

    const books = curriculumObj[subjKey];
    if (!books) continue;

    const bookKeys = Object.keys(books);
    for (const bookKey of bookKeys) {
      if (book &&
        bookKey.toLowerCase() !== book.toLowerCase() &&
        !bookKey.toLowerCase().includes(book.toLowerCase())) {
        continue;
      }

      const chapters = books[bookKey];
      if (!Array.isArray(chapters)) continue;

      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        if (!ch?.chapter_title) continue;

        if (ch.chapter_title.trim().toLowerCase() === chapterTitle.trim().toLowerCase()) {
          const old = ch.table_id;
          ch.table_id = newTableId;
          console.log("🟢 Updated table_id:", {
            subjectKey: subjKey,
            bookKey,
            chapterIndex: i,
            oldTableId: old,
            newTableId
          });
          return {
            updated: true,
            subjectKey: subjKey,
            bookKey,
            chapterIndex: i,
            oldTableId: old,
            newTableId
          };
        }
      }
    }
  }
  return { updated: false };
}

export default async function handler(req, res) {
  // Apply CORS Headers
  const origin = req.headers.origin || "*";
  const corsHeaders = getCorsHeaders(origin);
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    console.log("🟡 Preflight OK");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Only POST allowed" });
  }

  console.log("📌 updateCurriculum called:", { method: req.method });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { class_name, subject, book, chapter, new_table_id } = body || {};

    if (!class_name || !chapter || !new_table_id) {
      console.error("❌ Missing required params", body);
      return res.status(400).json({ ok: false, error: "Missing required params" });
    }

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    if (!token || !owner) throw new Error("GitHub credentials missing");

    const repo = `ready4exam-${class_name}`;
    const path = "js/curriculum.js";

    console.log("🔐 Using GitHub owner:", owner);
    console.log("📘 Target Repo:", repo);

    // 🔥 The fix: Prefix `token ` to GitHub PAT
    const octokit = new Octokit({
      auth: `token ${token}`
    });

    // Fetch file
    const { data } = await octokit.repos.getContent({ owner, repo, path });
    const fileSha = data.sha;
    const rawJs = Buffer.from(data.content, "base64").toString("utf-8");

    console.log("📥 curriculum.js fetched successfully");

    // Extract and parse object literal
    const exportRegex = /export\s+const\s+curriculum\s*=\s*(\{[\s\S]*?})(\s*;)?/m;
    const match = rawJs.match(exportRegex);
    if (!match) {
      throw new Error("Invalid curriculum.js — missing export");
    }

    const objText = match[1];
    let curriculumObj;
    try {
      curriculumObj = Function('"use strict"; return (' + objText + ");")();
    } catch (err) {
      console.error("❌ Object parse failed:", err);
      throw new Error("Failed to parse curriculum object");
    }

    // Update
    const info = updateTableId(curriculumObj, subject, book, chapter, new_table_id);
    if (!info.updated) {
      return res.status(404).json({ ok: false, error: `Chapter not found: ${chapter}` });
    }

    // Write file back to GitHub
    const updated = JSON.stringify(curriculumObj, null, 2);
    const newFile = rawJs.replace(exportRegex, `export const curriculum = ${updated};`);

    console.log("✍️ Writing update to GitHub…");

    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: `🔄 Update table_id for ${chapter} → ${new_table_id}`,
      content: Buffer.from(newFile).toString("base64"),
      sha: fileSha
    });

    console.log("🎯 SUCCESS: table_id updated on GitHub:", info);

    return res.status(200).json({
      ok: true,
      repo,
      updated: info,
      message: "✔ curriculum.js updated successfully"
    });

  } catch (err) {
    console.error("❌ updateCurriculum error:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Internal Server Error"
    });
  }
}
