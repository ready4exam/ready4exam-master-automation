// /api/updateCurriculum.js
import { Octokit } from "@octokit/rest";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

// Replace table_id in curriculum object
function updateTableId(curriculumObj, subject, book, chapterTitle, newTableId) {
  const subjects = Object.keys(curriculumObj || {});
  for (const subjKey of subjects) {
    if (subject &&
      subjKey.toLowerCase() !== subject.toLowerCase() &&
      !subjKey.toLowerCase().includes(subject.toLowerCase())) continue;

    const books = curriculumObj[subjKey];
    if (!books) continue;

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
  console.log("📌 updateCurriculum hit:", {
    method: req.method,
