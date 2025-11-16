import { Octokit } from "@octokit/rest";
import { getCorsHeaders } from "./cors.js";
// ---- CORS preflight handling ----
const origin = req.headers.origin || "*";
const headers = getCorsHeaders(origin);
Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

if (req.method === "OPTIONS") {
  return res.status(200).end();
}


export const config = { runtime: "nodejs" };

function findAndUpdateChapter(curriculumObj, subject, book, chapterTitle, newTableId) {
  // Try hinted subject/book first, then fallback to full search
  const subjects = Object.keys(curriculumObj || {});
  const candidates = [];

  if (subject) {
    const exact = subjects.find((s) => s.toLowerCase() === subject.toLowerCase());
    if (exact) candidates.push(exact);
    else {
      const loose = subjects.find((s) => s.toLowerCase().includes(subject.toLowerCase()));
      if (loose) candidates.push(loose);
    }
  }
  for (const s of subjects) {
    if (!candidates.includes(s)) candidates.push(s);
  }

  for (const subjKey of candidates) {
    const books = curriculumObj[subjKey];
    if (!books || typeof books !== "object") continue;

    const bookKeys = Object.keys(books);
    const bookCandidates = [];

    if (book) {
      const exactB = bookKeys.find((b) => b.toLowerCase() === book.toLowerCase());
      if (exactB) bookCandidates.push(exactB);
      else {
        const looseB = bookKeys.find((b) => b.toLowerCase().includes(book.toLowerCase()));
        if (looseB) bookCandidates.push(looseB);
      }
    }
    for (const bk of bookKeys) {
      if (!bookCandidates.includes(bk)) bookCandidates.push(bk);
    }

    for (const bk of bookCandidates) {
      const chapters = books[bk];
      if (!Array.isArray(chapters)) continue;
      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        if (!ch || !ch.chapter_title) continue;
        if (ch.chapter_title.trim().toLowerCase() === chapterTitle.trim().toLowerCase()) {
          const old = ch.table_id;
          ch.table_id = newTableId;
          return {
            updated: true,
            subjectKey: subjKey,
            bookKey: bk,
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
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    let { class_name, subject, book, chapter, new_table_id } = body || {};

    if (!class_name || !chapter || !new_table_id) {
      return res.status(400).json({
        ok: false,
        error: "Missing parameters. Required: class_name, chapter, new_table_id. Optional: subject, book."
      });
    }

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    if (!token || !owner) {
      return res.status(500).json({ ok: false, error: "Server misconfigured: missing GITHUB_TOKEN or GITHUB_OWNER." });
    }

    const repo = `ready4exam-${class_name}`;
    const path = "js/curriculum.js";
    const octokit = new Octokit({ auth: token });

    const { data } = await octokit.repos.getContent({ owner, repo, path });
    const fileSha = data.sha;
    const raw = Buffer.from(data.content, "base64").toString("utf-8");

    // Extract object literal after "export const curriculum ="
    const exportMarker = /export\s+const\s+curriculum\s*=\s*/m;
    let objText = null;

    if (exportMarker.test(raw)) {
      const idx = raw.search(exportMarker);
      const after = raw.slice(idx);
      const braceStart = after.indexOf("{");
      if (braceStart === -1) throw new Error("Malformed curriculum.js: object not found after export const curriculum");
      let open = 0;
      let i = braceStart;
      for (; i < after.length; i++) {
        const ch = after[i];
        if (ch === "{") open++;
        else if (ch === "}") {
          open--;
          if (open === 0) {
            objText = after.slice(braceStart, i + 1);
            break;
          }
        }
      }
      if (!objText) throw new Error("Failed to extract curriculum object");
    } else {
      throw new Error("Unsupported curriculum.js format: expected 'export const curriculum = ...'");
    }

    let curriculumObj;
    try {
      curriculumObj = JSON.parse(objText);
    } catch (err) {
      throw new Error("Failed to JSON-parse curriculum object: " + err.message);
    }

    const updateInfo = findAndUpdateChapter(curriculumObj, subject, book, chapter, new_table_id);
    if (!updateInfo.updated) {
      return res.status(404).json({
        ok: false,
        error: `Chapter "${chapter}" not found in repo ${repo}.`,
        subject_hint: subject || null,
        book_hint: book || null
      });
    }

    const newObjText = JSON.stringify(curriculumObj, null, 2);
    const headerSplitIdx = raw.search(exportMarker);
    const header = headerSplitIdx === -1 ? "" : raw.slice(0, headerSplitIdx);
    const newFileContent =
      `${header}// Auto-updated by MasterAutomation on ${new Date().toISOString()}\n` +
      `export const curriculum = ${newObjText};\n\n` +
      `export default curriculum;\n`;

    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: `🔄 Update table_id for chapter "${chapter}" to "${new_table_id}"`,
      content: Buffer.from(newFileContent).toString("base64"),
      sha: fileSha
    });

    return res.status(200).json({
      ok: true,
      message: `Curriculum updated for chapter "${chapter}" in ${repo}.`,
      repo,
      updated: updateInfo
    });
  } catch (err) {
    console.error("❌ updateCurriculum error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Internal error" });
  }
}
