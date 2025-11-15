// /api/updateCurriculum.js
// Rewritten: reliably update only `table_id` for the matching chapter_title
// Expects POST { class_name, subject, chapter, new_table_id } or { table } alias
// Uses getCorsHeaders from ./cors.js

import { Octokit } from "@octokit/rest";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

function findAndUpdateChapter(curriculumObj, subjectName, chapterTitle, newTableId) {
  // curriculumObj shape:
  // { "SubjectDisplayName": { "BookName": [ { chapter_title, table_id, ... }, ... ] }, ... }
  // We must search for subjectName (best-effort: exact match or contains) and chapterTitle exact match.
  const subjects = Object.keys(curriculumObj);

  // Narrow subject: exact match or case-insensitive or fallback to any subject that contains the subjectName
  let chosenSubjectKey = null;
  if (subjectName) {
    chosenSubjectKey = subjects.find(
      (s) => s.toLowerCase() === subjectName.toLowerCase()
    );
    if (!chosenSubjectKey) {
      chosenSubjectKey = subjects.find((s) => s.toLowerCase().includes(subjectName.toLowerCase()));
    }
  }

  // If still null, try to search across all subjects
  const subjectKeysToSearch = chosenSubjectKey ? [chosenSubjectKey] : subjects;

  for (const subjKey of subjectKeysToSearch) {
    const books = curriculumObj[subjKey];
    if (!books || typeof books !== "object") continue;

    // books is like: { "BookName": [chapters...] , ... }
    for (const [bookName, chapters] of Object.entries(books)) {
      if (!Array.isArray(chapters)) continue;

      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        if (!ch || !ch.chapter_title) continue;

        if (ch.chapter_title.trim().toLowerCase() === chapterTitle.trim().toLowerCase()) {
          // Found the chapter — update table_id only
          const old = ch.table_id;
          ch.table_id = newTableId;
          return {
            updated: true,
            subjectKey: subjKey,
            bookName,
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
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    let { class_name, subject, chapter, new_table_id, table } = body || {};

    if (!class_name || !chapter || !(new_table_id || table)) {
      return res.status(400).json({ error: "Missing parameters. Required: class_name, chapter, new_table_id (or table). Optional: subject." });
    }

    const newTableId = new_table_id || table;

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;

    if (!token || !owner) {
      return res.status(500).json({ error: "Server misconfigured: missing GITHUB_TOKEN or GITHUB_OWNER." });
    }

    const repo = `ready4exam-${class_name}`;
    const path = "js/curriculum.js";

    const octokit = new Octokit({ auth: token });

    // Fetch current curriculum.js
    const { data } = await octokit.repos.getContent({ owner, repo, path });
    const fileSha = data.sha;
    const raw = Buffer.from(data.content, "base64").toString("utf-8");

    // Try to extract the curriculum object literal from the JS file
    // Support two common shapes:
    // 1) export const curriculum = { ... };
    // 2) export default curriculum; (where curriculum is defined earlier)
    // We'll search for "export const curriculum" first
    const exportMarker = /export\s+const\s+curriculum\s*=\s*/m;
    let objText = null;
    if (exportMarker.test(raw)) {
      const idx = raw.search(exportMarker);
      const after = raw.slice(idx);
      const braceStart = after.indexOf("{");
      if (braceStart === -1) throw new Error("Malformed curriculum.js: object not found after export const curriculum");
      // find matching closing brace by scanning
      let open = 0;
      let i = braceStart;
      for (; i < after.length; i++) {
        const ch = after[i];
        if (ch === "{") open++;
        else if (ch === "}") {
          open--;
          if (open === 0) {
            // slice from braceStart to i inclusive
            objText = after.slice(braceStart, i + 1);
            break;
          }
        }
      }
      if (!objText) throw new Error("Failed to extract curriculum object (export const)");
    } else {
      // Fallback: try to locate "export default curriculum" and then find the variable declaration
      const defaultMarker = /export\s+default\s+curriculum\s*;/m;
      if (defaultMarker.test(raw)) {
        // attempt to find "const curriculum = { ... }" earlier
        const constMarker = /(?:const|let|var)\s+curriculum\s*=\s*/m;
        const constIdx = raw.search(constMarker);
        if (constIdx === -1) throw new Error("Malformed curriculum.js: export default found but curriculum declaration not found.");
        const after = raw.slice(constIdx);
        const braceStart = after.indexOf("{");
        if (braceStart === -1) throw new Error("Malformed curriculum.js: object not found after curriculum declaration");
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
        if (!objText) throw new Error("Failed to extract curriculum object (default export path)");
      } else {
        throw new Error("Unsupported curriculum.js format: neither 'export const curriculum' nor 'export default curriculum' found.");
      }
    }

    // Now objText should be a JS object literal using JSON-safe syntax (generator writes JSON.stringify)
    // Parse it via JSON.parse
    let curriculumObj;
    try {
      curriculumObj = JSON.parse(objText);
    } catch (err) {
      // Try to be more forgiving: replace single quotes with double quotes (in case)
      const relaxed = objText.replace(/(['`])((?:\\\1|.)*?)\1/g, function(m, q, content){
        // don't blindly replace - we assume generator uses JSON double quotes; if not, throw
        return m;
      });
      try {
        curriculumObj = JSON.parse(relaxed);
      } catch (err2) {
        throw new Error("Failed to JSON-parse curriculum object: " + err2.message);
      }
    }

    // Find and update
    const resUpdate = findAndUpdateChapter(curriculumObj, subject, chapter, newTableId);
    if (!resUpdate.updated) {
      // Build helpful message with available chapter titles to help debugging
      const chaptersList = [];
      for (const subj of Object.keys(curriculumObj)) {
        const books = curriculumObj[subj];
        for (const [bookName, chapters] of Object.entries(books)) {
          if (!Array.isArray(chapters)) continue;
          for (const ch of chapters) {
            chaptersList.push({ subject: subj, book: bookName, chapter_title: ch.chapter_title, table_id: ch.table_id || null });
          }
        }
      }
      return res.status(404).json({
        ok: false,
        error: `Chapter "${chapter}" not found in repo ${repo}.`,
        suggestions: "Check available chapter_title values.",
        available_chapters_preview: chaptersList.slice(0, 40)
      });
    }

    // Replace the old object in raw file with JSON.stringify(curriculumObj)
    const newObjText = JSON.stringify(curriculumObj, null, 2);
    // Build new file content: keep header comment (if any) before the 'export' marker, then write exports
    const headerSplitIdx = raw.search(/export\s+(?:const\s+curriculum|default\s+curriculum)/m);
    const header = headerSplitIdx === -1 ? "" : raw.slice(0, headerSplitIdx);
    const newFileContent = `${header}// Auto-updated by MasterAutomation on ${new Date().toISOString()}\nexport const curriculum = ${newObjText};\n\nexport default curriculum;\n`;

    // Commit updated file
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: `🔄 Update table_id for chapter "${chapter}" to "${newTableId}"`,
      content: Buffer.from(newFileContent).toString("base64"),
      sha: fileSha
    });

    return res.status(200).json({
      ok: true,
      message: `Curriculum updated for chapter "${chapter}" in ${repo}.`,
      repo,
      updated: resUpdate
    });
  } catch (err) {
    console.error("❌ updateCurriculum error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
