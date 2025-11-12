// js/api.js
// -----------------------------------------------------------------------------
// Data layer: Fetch questions (Supabase) + Save results (Firestore + GA4)
// This version: preserves original code as comments, but short-circuits all
// Supabase `.from(...)` calls and instead shows "Welcome to the quiz" once.
// -----------------------------------------------------------------------------

import { getInitializedClients, getAuthUser, logAnalyticsEvent } from "./config.js";
import * as UI from "./ui-renderer.js";
import { cleanKatexMarkers } from "./utils.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// -----------------------------------------------------------------------------
// Safety toggle: when true, supabase network calls are stubbed.
// Flip to false (and restore original uncommented lines) to re-enable real calls.
if (typeof window !== "undefined" && window.__USE_STUBBED_SUPABASE === undefined) {
  window.__USE_STUBBED_SUPABASE = true;
}

// Show the welcome message exactly once
function showWelcomeOnce() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.__quiz_welcome_shown) return Promise.resolve();
  window.__quiz_welcome_shown = true;

  try {
    alert("Welcome to the quiz");
  } catch (e) {
    const status = document.getElementById("status-message");
    if (status) status.textContent = "Welcome to the quiz";
  }
  return Promise.resolve();
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function getClients() {
  const { supabase, db } = getInitializedClients();
  if (!db) throw new Error("[API] Firestore not initialized.");
  // NOTE: supabase may be null if not initialized yet; original code expected supabase
  return { supabase, db };
}

async function resolveTableName({ supabase, classId, subject, chapterTitle, explicitTable, topicSlug }) {
  // 1) explicit table passed by caller
  if (explicitTable && String(explicitTable).trim()) return String(explicitTable).trim();

  // 2) try table_mappings lookup (if table_mappings exists)
  try {
    if (window.__USE_STUBBED_SUPABASE) {
      // Short-circuit: do not call Supabase
      await showWelcomeOnce();
      // Fall back to canonical behavior below
    } else {
      // Original network lookup (commented to keep safe)
      /*
      const lookup = await supabase
        .from("table_mappings")
        .select("table_name")
        .or(
          `chapter_title.eq.${chapterTitle},table_name.eq.${topicSlug},class_name.eq.${classId}`
        )
        .limit(1);

      if (!lookup.error && lookup.data && lookup.data.length) {
        const mapped = lookup.data[0].table_name;
        if (mapped) return mapped;
      }
      */
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
    .replace(/[^\w\s-]/g, "") // remove punctuation
    .replace(/\s+/g, "_"); // spaces => underscores
  return `${slug}_quiz`;
}

// Original tableExists implementation (network) preserved below as comment.
// We now provide a short-circuit wrapper that displays welcome and returns false.
async function _original_tableExists(supabase, tableName) {
  // original implementation (commented)
  /*
  try {
    const { data, error } = await supabase.from(tableName).select("id").limit(1);
    if (error) {
      if (/Could not find the table/i.test(error.message || "")) return false;
      throw error;
    }
    return true;
  } catch (e) {
    if (e && typeof e.message === "string" && /Could not find the table/i.test(e.message)) return false;
    throw e;
  }
  */
  throw new Error("Original tableExists implementation is commented out in this stub module.");
}

async function tableExists(supabase, tableName) {
  if (window.__USE_STUBBED_SUPABASE) {
    await showWelcomeOnce();
    // Return safe default: false (no table)
    return false;
  } else {
    return _original_tableExists(supabase, tableName);
  }
}

// -----------------------------------------------------------------------------
// Fetch questions from Supabase (robust, single-call)
// Accepts: { table, difficulty, classId, subject, chapterTitle, topicSlug }
// Original implementation left as comments; this wrapper avoids network calls.
// -----------------------------------------------------------------------------
export async function fetchQuestions({
  table: explicitTable = null,
  difficulty = "Simple",
  classId = null,
  subject = null,
  chapterTitle = null,
  topicSlug = null,
}) {
  if (window.__USE_STUBBED_SUPABASE) {
    // Short-circuit: show welcome once and return safe default.
    await showWelcomeOnce();
    // Safe default: empty array (no questions)
    return [];
    // If your UI requires a placeholder question, return a light stub instead:
    /*
    return [{
      id: 'stub-1',
      text: 'Placeholder question (Supabase disabled).',
      options: { A: 'A', B: 'B', C: 'C', D: 'D' },
      correct_answer: 'A',
      question_type: 'mcq'
    }];
    */
  }

  // If stubbing disabled, run the original implementation (kept below for reference).
  const { supabase } = getClients();
  UI.showStatus("Resolving quiz table...", "text-blue-600");

  // Resolve table deterministically
  const tableName = await resolveTableName({
    supabase,
    classId,
    subject,
    chapterTitle,
    explicitTable,
    topicSlug,
  });
  console.log("[API] Resolved table name ->", tableName);

  // Verify table exists (do not attempt other variants)
  const exists = await tableExists(supabase, tableName).catch((err) => {
    throw new Error(err?.message || "Failed to verify table existence");
  });

  if (!exists) {
    throw new Error(`No quiz table found for this chapter (${tableName}).`);
  }

  UI.showStatus(`Loading questions for <b>${tableName}</b> (${difficulty})...`, "text-blue-600");

  const normalizedDiff =
    difficulty && difficulty.length
      ? difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase()
      : "Simple";

  // ORIGINAL NETWORK CALL (commented for safety):
  /*
  const { data, error } = await supabase
    .from(tableName)
    .select(`
      id, question_text, question_type, scenario_reason_text,
      option_a, option_b, option_c, option_d, correct_answer_key
    `)
    .eq("difficulty", normalizedDiff);

  if (error) {
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
  */

  // If we reach here due to stub-disabled path but no network call available, throw.
  throw new Error("fetchQuestions original implementation is commented out in this stub module.");
}

// -----------------------------------------------------------------------------
// Save results to Firestore + log to GA4
// (This function uses Firestore and GA4 — kept intact, not stubbed.)
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

// -----------------------------------------------------------------------------
// Generic stubs for other network helpers (if present in original file)
// Add equivalents if your original file had more exports that call supabase.
// -----------------------------------------------------------------------------
export async function fetchChapters(/* params */) {
  if (window.__USE_STUBBED_SUPABASE) {
    await showWelcomeOnce();
    return [];
  }
  // Original implementation commented out above; implement real logic here if needed.
  throw new Error("fetchChapters original implementation commented out in stub.");
}

export async function fetchMeta(/* key */) {
  if (window.__USE_STUBBED_SUPABASE) {
    await showWelcomeOnce();
    return null;
  }
  throw new Error("fetchMeta original implementation commented out in stub.");
}
