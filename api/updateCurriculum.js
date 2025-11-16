import { Octokit } from "@octokit/rest";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

function findAndUpdateChapter(curriculumObj, subject, book, chapterTitle, newTableId) {
  const subjects = Object.keys(curriculumObj || {});
  const subjectLower = (subject || "").toLowerCase();
  const chapterLower = chapterTitle.toLowerCase().trim();

  const subjectKeys = subjects.length
    ? subjects
    : ["default"]; // fallback — non-NCERT structure

  for (const subjKey of subjectKeys) {
    const value = curriculumObj[subjKey];

    // 🧩 CASE 1 → standard structure: subjects → books → chapter[]
    if (value && typeof value === "object") {
      for (const bookKey of Object.keys(value)) {
        const chapters = value[bookKey];

        if (!Array.isArray(chapters)) continue;
        for (let i = 0; i < chapters.length; i++) {
          const ch = chapters[i];
          if (!ch.chapter_title) continue;

          if (ch.chapter_title.toLowerCase().trim() === chapterLower) {
            const old = ch.table_id;
            ch.table_id = newTableId;
            return { updated: true, subjectKey: subjKey, bookKey, chapterIndex: i, old, newTableId };
          }
        }
      }
    }

    // 🧩 CASE 2 → direct: subjects → chapter[]
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        if (!ch?.chapter_title) continue;

        if (ch.chapter_title.toLowerCase().trim() === chapterLower) {
          const old = ch.table_id;
          ch.table_id = newTableId;
          return { updated: true, subjectKey: subjKey, bookKey: null, chapterIndex: i, old, newTableId };
        }
      }
    }
  }

  return { updated: false };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  Object.entries(getCorsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { class_name, subject, book, chapter, new_table_id } = body || {};

    if (!class_name || !chapter || !new_table_id) {
      return res.status(400).json({
        ok: false,
        error: "class_name, chapter and new_table_id are required"
      });
    }

    if (typeof new_table_id !== "string") {
      return res.status(400).json({ ok: false, error: "new_table_id must be string" });
    }

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    if (!token || !owner) throw new Error("GitHub credentials missing");

    const repo = `ready4exam-${class_name}`;
    const path = "js/curriculum.js";

    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.repos.getContent({ owner, repo, path });
    const fileSha = data.sha;
    const fileContent = Buffer.from(data.content, "base64").toString("utf-8");

    const marker = /export\s+const\s+curriculum\s*=\s*/;
    const startIdx = fileContent.search(marker);
    if (startIdx === -1) throw new Error("Cannot locate curriculum object");

    const after = fileContent.slice(startIdx);
    const braceStart = after.indexOf("{");
    if (braceStart < 0) throw new Error("Malformed curriculum.js");

    let open = 0, endIdx = braceStart;
    for (; endIdx < after.length; endIdx++) {
      if (after[endIdx] === "{") open++;
      if (after[endIdx] === "}") {
        open--;
        if (open === 0) break;
      }
    }

    const objText = after.slice(braceStart, endIdx + 1);
    const curriculumObj = JSON.parse(objText);

    const updated = findAndUpdateChapter(curriculumObj, subject, book, chapter, new_table_id);
    if (!updated.updated) {
      return res.status(404).json({
        ok: false,
        error: `Chapter not found: ${chapter}`
      });
    }

    const newObjText = JSON.stringify(curriculumObj, null, 2);
    const newJS =
      `// Auto-updated by MasterAutomation on ${new Date().toISOString()}\n` +
      `export const curriculum = ${newObjText};\n\n` +
      `export default curriculum;\n`;

    const header = fileContent.slice(0, startIdx);

    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: `🔄 Update table_id for chapter: ${chapter}`,
      content: Buffer.from(header + newJS).toString("base64"),
      sha: fileSha
    });

    return res.status(200).json({
      ok: true,
      message: `Updated table_id for "${chapter}"`,
      repo,
      updated
    });

  } catch (err) {
    console.error("❌ updateCurriculum:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
