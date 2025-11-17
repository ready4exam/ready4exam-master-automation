// /api/updateCurriculum.js
import { Octokit } from "@octokit/rest";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

// Replace table_id in curriculum object
function updateTableId(curriculumObj, subject, book, chapterTitle, newTableId) {
  const subjects = Object.keys(curriculumObj || {});
  for (const subjKey of subjects) {
    const books = curriculumObj[subjKey];
    if (!books) continue;

    if (subject &&
      subjKey.toLowerCase() !== subject.toLowerCase() &&
      !subjKey.toLowerCase().includes(subject.toLowerCase())) continue;

    const bookKeys = Object.keys(books);
    for (const bookKey of bookKeys) {
      if (book &&
        bookKey.toLowerCase() !== book.toLowerCase() &&
        !bookKey.toLowerCase().includes(book.toLowerCase())) continue;

      const chapters = books[bookKey];
      if (!Array.isArray(chapters)) continue;

      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        if (!ch?.chapter_title) continue;

        if (ch.chapter_title.trim().toLowerCase() === chapterTitle.trim().toLowerCase()) {
          const old = ch.table_id;
          ch.table_id = newTableId;

          console.log("🟢 Found + Updated table_id:", {
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
  const origin = req.headers.origin || "*";
  const corsHeaders = getCorsHeaders(origin);
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") {
    console.log("🟡 Preflight OK");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Only POST allowed" });
  }

  console.log("📌 updateCurriculum invoked via POST");

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { class_name, subject, book, chapter, new_table_id } = body;

    if (!class_name || !chapter || !new_table_id) {
      console.error("❌ Missing parameters", body);
      return res.status(400).json({ ok: false, error: "Missing params" });
    }

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    if (!token || !owner) throw new Error("GitHub credentials missing");

    const repo = `ready4exam-${class_name}`;
    const path = "js/curriculum.js";

    // FIXED Auth — NO `token ` prefix
    const octokit = new Octokit({
      auth: token,
      userAgent: "Ready4Exam-Automation"
    });

    console.log("📥 Downloading curriculum.js:", { owner, repo, path });

    const { data } = await octokit.repos.getContent({ owner, repo, path });
    const fileSha = data.sha;
    const raw = Buffer.from(data.content, "base64").toString("utf-8");

    const exportRegex =
      /export\s+const\s+curriculum\s*=\s*(\{[\s\S]*?})(\s*;)?/m;
    const match = raw.match(exportRegex);

    if (!match) throw new Error("curriculum.js export pattern missing");

    const objText = match[1];

    // FIX: Evaluate JS object directly — supports trailing commas!
    const curriculumObj = Function(`"use strict"; return (${objText});`)();

    const info = updateTableId(curriculumObj, subject, book, chapter, new_table_id);
    if (!info.updated) return res.status(404).json({ ok: false, error: "Chapter not found" });

    const newObjString = JSON.stringify(curriculumObj, null, 2);
    const newFileContents = raw.replace(exportRegex, `export const curriculum = ${newObjString};`);

    console.log("✍️ Uploading updated curriculum.js to GitHub...");

    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: `🔄 Update table_id for ${chapter} → ${new_table_id}`,
      content: Buffer.from(newFileContents).toString("base64"),
      sha: fileSha
    });

    console.log(`⭐ SUCCESS — Curriculum updated in: ${repo}`);
    return res.status(200).json({
      ok: true,
      updated: info,
      repo,
      message: "table_id updated successfully"
    });

  } catch (err) {
    console.error("❌ updateCurriculum ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: err.message,
      stack: err.stack
    });
  }
}
