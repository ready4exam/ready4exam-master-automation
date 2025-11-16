import { Octokit } from "@octokit/rest";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

// Helper to locate & update chapter table_id
function findAndUpdateChapter(curriculumObj, subject, book, chapterTitle, newTableId) {
  const subjects = Object.keys(curriculumObj || {});
  const subjCandidates = [];

  if (subject) {
    const exact = subjects.find((s) => s.toLowerCase() === subject.toLowerCase());
    if (exact) subjCandidates.push(exact);
    else {
      const loose = subjects.find((s) => s.toLowerCase().includes(subject.toLowerCase()));
      if (loose) subjCandidates.push(loose);
    }
  }
  for (const s of subjects) if (!subjCandidates.includes(s)) subjCandidates.push(s);

  for (const subjKey of subjCandidates) {
    const books = curriculumObj[subjKey];
    if (!books) continue;

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
    for (const bk of bookKeys) if (!bookCandidates.includes(bk)) bookCandidates.push(bk);

    for (const bk of bookCandidates) {
      const chapters = books[bk];
      if (!Array.isArray(chapters)) continue;

      for (let i = 0; i < chapters.length; i++) {
        if (
          chapters[i]?.chapter_title?.trim().toLowerCase() ===
          chapterTitle.trim().toLowerCase()
        ) {
          const old = chapters[i].table_id;
          chapters[i].table_id = newTableId;
          return { updated: true, subjectKey: subjKey, bookKey: bk, chapterIndex: i, oldTableId: old, newTableId };
        }
      }
    }
  }
  return { updated: false };
}

export default async function handler(req, res) {
  // CORS must run now — inside handler
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { class_name, subject, book, chapter, new_table_id } = body || {};

    if (!class_name || !chapter || !new_table_id)
      return res.status(400).json({ ok: false, error: "Missing class_name, chapter or new_table_id" });

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    if (!token || !owner) throw new Error("GitHub credentials missing");

    const repo = `ready4exam-${class_name}`;
    const path = "js/curriculum.js";
    const octokit = new Octokit({ auth: token });

    const { data } = await octokit.repos.getContent({ owner, repo, path });
    const fileSha = data.sha;
    const raw = Buffer.from(data.content, "base64").toString("utf-8");

    const marker = /export\s+const\s+curriculum\s*=\s*/m;
    const startIdx = raw.search(marker);
    if (startIdx === -1) throw new Error("curriculum.js format incorrect");

    const after = raw.slice(startIdx);
    const braceStart = after.indexOf("{");
    let open = 0, endIdx = braceStart;

    for (; endIdx < after.length; endIdx++) {
      if (after[endIdx] === "{") open++;
      else if (after[endIdx] === "}") {
        open--;
        if (open === 0) break;
      }
    }

    const objText = after.slice(braceStart, endIdx + 1);
    const curriculumObj = JSON.parse(objText);

    const updateInfo = findAndUpdateChapter(curriculumObj, subject, book, chapter, new_table_id);
    if (!updateInfo.updated)
      return res.status(404).json({ ok: false, error: `Chapter not found: ${chapter}` });

    const newObj = JSON.stringify(curriculumObj, null, 2);
    const newFile =
`${raw.slice(0, startIdx)}// Auto-updated by MasterAutomation
export const curriculum = ${newObj};

export default curriculum;
`;

    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: `🔄 Update table_id for "${chapter}" → ${new_table_id}`,
      content: Buffer.from(newFile).toString("base64"),
      sha: fileSha
    });

    return res.status(200).json({
      ok: true,
      repo,
      updated: updateInfo
    });

  } catch (err) {
    console.error("❌ updateCurriculum error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
