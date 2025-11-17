// /api/updateCurriculum.js
import { Octokit } from "@octokit/rest";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

// Replace table_id in curriculum object
function updateTableId(curriculumObj, subject, book, chapterTitle, newTableId) {
  const subjects = Object.keys(curriculumObj || {});
  for (const subjKey of subjects) {
    if (
      subject &&
      subjKey.toLowerCase() !== subject.toLowerCase() &&
      !subjKey.toLowerCase().includes(subject.toLowerCase())
    ) {
      continue;
    }

    const books = curriculumObj[subjKey];
    if (!books) continue;

    const bookKeys = Object.keys(books);
    for (const bookKey of bookKeys) {
      if (
        book &&
        bookKey.toLowerCase() !== book.toLowerCase() &&
        !bookKey.toLowerCase().includes(book.toLowerCase())
      ) {
        continue;
      }

      const chapters = books[bookKey];
      if (!Array.isArray(chapters)) continue;

      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        if (!ch?.chapter_title) continue;

        if (
          ch.chapter_title.trim().toLowerCase() ===
          chapterTitle.trim().toLowerCase()
        ) {
          const old = ch.table_id;
          ch.table_id = newTableId;
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
  // 🔴 CORS MUST BE SET FOR EVERY REQUEST (INCLUDING OPTIONS)
  const origin = req.headers.origin || "*";
  const corsHeaders = getCorsHeaders(origin);

  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    // Preflight response – CORS headers already set above
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ ok: false, error: "Only POST allowed" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { class_name, subject, book, chapter, new_table_id } = body;

    if (!class_name || !chapter || !new_table_id) {
      return res.status(400).json({
        ok: false,
        error: "Missing class_name, chapter or new_table_id"
      });
    }

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    if (!token || !owner) {
      throw new Error("GitHub credentials missing");
    }

    const repo = `ready4exam-${class_name}`;
    const path = "js/curriculum.js";

    const octokit = new Octokit({ auth: token });

    const { data } = await octokit.repos.getContent({ owner, repo, path });
    const fileSha = data.sha;
    const raw = Buffer.from(data.content, "base64").toString("utf-8");

    // tolerate absence of semicolon; just grab object after export const
    const regex = /export\s+const\s+curriculum\s*=\s*(\{[\s\S]*?})/m;
    const match = raw.match(regex);
    if (!match) {
      throw new Error("Invalid curriculum.js format — missing export");
    }

    const objText = match[1];
    const curriculumObj = JSON.parse(objText);

    const info = updateTableId(
      curriculumObj,
      subject,
      book,
      chapter,
      new_table_id
    );
    if (!info.updated) {
      return res
        .status(404)
        .json({ ok: false, error: `Chapter not found: ${chapter}` });
    }

    const newObjString = JSON.stringify(curriculumObj, null, 2);
    const newFile = raw.replace(
      regex,
      `export const curriculum = ${newObjString}`
    );

    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: `🔄 Update table_id for "${chapter}" → ${new_table_id}`,
      content: Buffer.from(newFile).toString("base64"),
      sha: fileSha
    });

    console.log(
      `⭐ table_id updated in curriculum of class ${class_name} repo:`,
      info.oldTableId,
      "→",
      info.newTableId
    );

    return res.status(200).json({
      ok: true,
      repo,
      updated: info,
      message: "table_id updated in curriculum of respective class repo"
    });
  } catch (err) {
    console.error("❌ updateCurriculum error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
