// js/api.js
// -----------------------------------------------------------------------------
// Phase-3 Clean API Layer
// - Fetch questions from Supabase (single DB)
// - Save quiz result to Firestore
// -----------------------------------------------------------------------------

import { getInitializedClients, getAuthUser, logAnalyticsEvent } from "./config.js";
import * as UI from "./ui-renderer.js";
import { cleanKatexMarkers } from "./utils.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// -----------------------------------------------------------------------------
// Fetch questions from Supabase
// -----------------------------------------------------------------------------
export async function fetchQuestions({ table, difficulty }) {
  const { supabase } = getInitializedClients();
  if (!supabase) throw new Error("[API] Supabase not initialized.");

  console.log("[API] Fetch → Table:", table, "Difficulty:", difficulty);

  UI.showStatus(`Loading questions...`, "text-blue-600");

  const normalizedDifficulty =
    difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase();

  // 🚀 DIRECT table query — no schema cache fallback
  const { data, error } = await supabase
    .from(table)
    .select(
      "id, question_text, question_type, scenario_reason_text, option_a, option_b, option_c, option_d, correct_answer_key"
    )
    .eq("difficulty", normalizedDifficulty);

  if (error) {
    console.error("[API ERROR] Supabase fetch failed:", error);
    throw new Error(`Supabase Query Failed: ${error.message}`);
  }

  if (!data?.length) {
    throw new Error("No questions found for this difficulty.");
  }

  return data.map((q) => ({
    id: q.id,
    text: cleanKatexMarkers(q.question_text),
    options: {
      A: cleanKatexMarkers(q.option_a),
      B: cleanKatexMarkers(q.option_b),
      C: cleanKatexMarkers(q.option_c),
      D: cleanKatexMarkers(q.option_d),
    },
    scenario_reason: cleanKatexMarkers(q.scenario_reason_text || ""),
    question_type: (q.question_type || "").toLowerCase(),
    correct_answer: (q.correct_answer_key || "").trim().toUpperCase(),
  }));
}

// -----------------------------------------------------------------------------
// Save Results → Firestore + GA4
// -----------------------------------------------------------------------------
export async function saveResult(result) {
  const { db } = getInitializedClients();
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
      chapter: result.topic,
      difficulty: result.difficulty,
      score: result.score,
      total: result.total,
      percentage: Math.round((result.score / result.total) * 100),
      timestamp: serverTimestamp(),
    });

    console.log("[API] Quiz result saved.");

    logAnalyticsEvent("quiz_completed", {
      user_id: user.uid,
      topic: result.topic,
      difficulty: result.difficulty,
      score: result.score,
      total: result.total,
      percentage: Math.round((result.score / result.total) * 100),
    });
  } catch (err) {
    console.error("[API] Failed to save Firestore result:", err);
  }
}
