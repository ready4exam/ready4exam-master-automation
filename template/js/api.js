// js/api.js
// -----------------------------------------------------------------------------
// Data layer: Fetch questions (Supabase) + Save results (Firestore + GA4)
// Robust table-resolution: prefer explicit table -> mapping -> <topic>_quiz
// Ensures we NEVER query raw topic (no more public.<topic> schema cache errors)
// -----------------------------------------------------------------------------

import { getInitializedClients, getAuthUser, logAnalyticsEvent } from "./config.js";
import * as UI from "./ui-renderer.js";
import { cleanKatexMarkers } from "./utils.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function getClients() {
  const { supabase, db } = getInitializedClients();
  if (!db) throw new Error("[API] Firestore not initialized.");
  if (!supabase) throw new Error("[API] Supabase not initialized.");
  return { supabase, db };
}

async function resolveTableName({ supabase, classId, subject, chapterTitle, explicitTable, topicSlug }) {
  // 1) explicit table passed by caller
  if (explicitTable && String(explicitTable).trim()) return String(explicitTable).trim();

  // 2) try table_mappings lookup (if table_mappings exists)
  try {
    const lookup = await supabase
      .from("table_mappings")
      .select("table_name")
      .or(
        // attempt a few matching strategies: exact chapter_title, or topicSlug match
        `chapter_title.eq.${chapterTitle},table_name.eq.${topicSlug},class_name.eq.${classId}`
      )
      .limit(1);

    if (!lookup.error && lookup.data && lookup.data.length) {
      const mapped = lookup.data[0].table_name;
      if (mapped) return mapped;
    }
  } catch (e) {
    // ignore mapping errors — mapping table may not exist or permissioned
    console.debug("[API] table_mappings lookup skipped or failed:", e?.message || e);
  }

  // 3) safe canonical fallback: topicSlug -> slugify -> <slug>_quiz
  const slug = (topicSlug || chapterTitle || "unknown")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")   // remove punctuation
    .replace(/\s+/g, "_");      // spaces => underscores
  return `${slug}_quiz`;
}

async function tableExists(supabase, tableName) {
  // Lightweight existence test: try a limit 1 select; catch the PostgREST 'table not found' error
  try {
    const { data, error } = await supabase.from(tableName).select("id").limit(1);
    if (error) {
      // PostgREST returns error.message containing "Could not find the table" for missing tables
      if (/Could not find the table/i.test(error.message || "")) return false;
      // Other errors: rethrow so caller can see
      throw error;
    }
    // If data returned or empty array, table exists (no schema error)
    return true;
  } catch (e) {
    if (e && typeof e.message === "string" && /Could not find the table/i.test(e.message)) return false;
    // rethrow other unexpected errors
    throw e;
  }
}

// -----------------------------------------------------------------------------
// Fetch questions from Supabase (robust, single-call)
// Accepts: { table, difficulty, classId, subject, chapterTitle, topicSlug }
// -----------------------------------------------------------------------------
export async function fetchQuestions({ table: explicitTable = null, difficulty = "Simple", classId = null, subject = null, chapterTitle = null, topicSlug = null }) {
  const { supabase } = getClients();
  UI.showStatus("Resolving quiz table...", "text-blue-600");

  // Resolve table deterministically
  const tableName = await resolveTableName({ supabase, classId, subject, chapterTitle, explicitTable, topicSlug });
  console.log("[API] Resolved table name ->", tableName);

  // Verify table exists (do not attempt other variants)
  const exists = await tableExists(supabase, tableName).catch((err) => {
    // If tableExists threw for a reason other than 'not found', bubble it up
    throw new Error(err?.message || "Failed to verify table existence");
  });

  if (!exists) {
    // Friendly, controlled error — no raw schema-cache calls will be made
    throw new Error(`No quiz table found for this chapter (${tableName}).`);
  }

  UI.showStatus(`Loading questions for <b>${tableName}</b> (${difficulty})...`, "text-blue-600");

  const normalizedDiff =
    difficulty && difficulty.length
      ? difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase()
      : "Simple";

  const { data, error } = await supabase
    .from(tableName)
    .select(`
      id, question_text, question_type, scenario_reason_text,
      option_a, option_b, option_c, option_d, correct_answer_key
    `)
    .eq("difficulty", normalizedDiff);

  if (error) {
    // If a schema-not-found slips through, provide a controlled message
    if (/Could not find the table/i.test(error.message || "")) {
      throw new Error(`No quiz table found for this chapter (${tableName}).`);
    }
    throw new Error(error.message || "Failed to fetch questions");
  }

  if (!data || !data.length) throw new Error("No questions found for this topic & difficulty.");

  return data.map((q) => ({
    id: q.id,
    text: cleanKatexMarkers(q.question_text),
    options: {
      A: cleanKatexMarkers(q.option_a),
      B: cleanKatexMarkers(q.option_b),
      C: cleanKatexMarkers(q.option_c),
      D: cleanKatexMarkers(q.option_d),
    },
    correct_answer: (q.correct_answer_key || "").trim().toUpperCase(),
    scenario_reason: cleanKatexMarkers(q.scenario_reason_text || ""),
    question_type: (q.question_type || "").trim().toLowerCase(),
  }));
}

// -----------------------------------------------------------------------------
// Save results to Firestore + log to GA4
// -----------------------------------------------------------------------------
export async function saveResult(resultData) {
  const { db } = getClients();
  const user = getAuthUser();
  if (!user) {
    console.warn("[API] Not saving — user not authenticated.");
    return;
  }

  try {
    await addDoc(collection(db, "quiz_scores"), {
      action: "Quiz Completed",
      user_id: user.uid,
      email: user.email,
      chapter: resultData.topic,
      difficulty: resultData.difficulty,
      score: resultData.score,
      total: resultData.total,
      percentage: Math.round((resultData.score / resultData.total) * 100),
      timestamp: serverTimestamp(),
    });

    console.log("[API] Quiz result saved to Firestore.");

    logAnalyticsEvent("quiz_completed", {
      user_id: user.uid,
      topic: resultData.topic,
      difficulty: resultData.difficulty,
      score: resultData.score,
      total: resultData.total,
      percentage: Math.round((resultData.score / resultData.total) * 100),
    });
  } catch (err) {
    console.error("[API] Firestore save failed:", err);
  }
}
