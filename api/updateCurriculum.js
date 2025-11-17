// /api/updateCurriculum.js
import { Octokit } from "@octokit/rest";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

function updateTableId(curriculumObj, subject, book, chapterTitle, newTableId) {
  for (const subjKey of Object.keys(curriculumObj || {})) {
    if (subject &&
      subjKey.toLowerCase() !== subject.toLowerCase() &&
      !subjKey.toLowerCase().includes(subject.toLowerCase())) continue;

    for (const bookKey of Object.keys(curriculumObj[subjKey] || {})) {
      if (book &&
        bookKey.toLowerCase() !== book.toLowerCase() &&
        !bookKey.toLowerCase().includes(book.toLowerCase())) continue;

      const arr = curriculumObj[subjKey][bookKey];
      if (!Array.isArray(arr)) continue;

      for (let i = 0; i < arr.length; i++) {
        if (
          arr[i]?.chapter_title?.trim().toLowerCase() ===
          chapterTitle.trim().toLowerCase()
        ) {
          const old = arr[i].table_id;
          arr[i].table_id = newTableId;
          return {
            updated: true,
            oldTableId: old,
            newTableId,
            subjectKey: subjKey,
            bookKey,
            index: i
          };
        }
      }
    }
  }
  return { updated: false };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  Object.entries({ ...getCorsHeaders(origin), "Content-Type": "application/json" })
    .forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST required" });

  try {
    const { class_name, subject, book, chapter, new_table_id } =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

    if (!class_name || !chapter || !new_table_id)
      return res.status(400).json({ ok: false, error: "Missing required fields" });

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    if (!token || !owner) throw new Error("GitHub credentials missing");

    const octokit = new Octokit({ auth: token });
    const repo = `ready4exam-${class_name}`;
    const path = "js/curriculum.js";

    const { data } = await octokit.repos.getContent({ owner, repo, path });
    const sha = data.sha;
    const raw = Buffer.from(data.content, "base64").toString("utf-8");

    // Improved regex — supports no semicolon + whitespace + comments
    const regex = /export\s+const\s+curriculum\s*=\s*(\{[\s\S]*?})/m;
    const match = raw.match(regex);
    if (!match) throw new Error("Failed to locate curriculum object in file");

    const jsonLike = match[1];
    const curriculumObj = JSON.parse(jsonLike);

    const info = updateTableId(curriculumObj, subject, book, chapter, new_table_id);
    if (!info.updated)
      return res.status(404).json({ ok: false, error: "Chapter not found" });

    const newObjStr = JSON.stringify(curriculumObj, null, 2);
    const updatedFile = raw.replace(regex, `export const curriculum = ${newObjStr}`);

    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      content: Buffer.from(updatedFile).toString("base64"),
      message: `🔄 curriculum table update: "${chapter}" → ${new_table_id}`,
      sha
    });

    console.log(
      `⭐ Updated curriculum.js in ${repo}: ${info.oldTableId} → ${info.newTableId}`
    );

    return res.status(200).json({
      ok: true,
      message: "Curriculum updated & committed",
      updatedTableId: new_table_id,
      repo
    });

  } catch (err) {
    console.error("❌ updateCurriculum error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
