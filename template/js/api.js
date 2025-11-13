// js/api.js
// --------------------------------------------------------------
// FINAL CLEAN VERSION (PHASE-3)
// - Fetches quiz from Supabase table resolved in quiz-engine.html
// - No schema-cache issues
// - No old 9th-class mappings
// --------------------------------------------------------------

import { getInitializedClients, getAuthUser, logAnalyticsEvent } from "./config.js";
import * as UI from "./ui-renderer.js";
import { cleanKatexMarkers } from "./utils.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --------------------------------------------------------------
// Fetch questions from Supabase (direct table)
// --------------------------------------------------------------
export async function fetchQuestions({ table, difficulty }) {
  const { supabase } = getInitializedClients();

  if (!supabase) throw new Error("Supabase client not initialized.");

  console.log("[API] Fetching from table:", table, "difficulty:", difficulty);

  UI.showStatus(`Loading questions…`, "text-blue-600");

  const normalizedDiff =
    difficulty.charAt(0).toUpperCase() +
    difficulty.slice(1).toLowerCase();

  const { data, error } = await supabase
    .from(table)
    .select(`
      id,
      question_text,
      question_type,
      scenario_reason_text,
      option_a,
      option_b,
      option_c,
      option_d,
      correct_answer_key
    `)
    .eq("difficulty", normalizedDiff);

  if (error) {
    console.error("[API] Supabase error:", error);
    throw new Error(error.message);
  }

  if (!data?.length) {
    throw new Error("No questions found in table: " + table);
  }

  console.log("[API] Loaded questions:", data.length);

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

// --------------------------------------------------------------
// Save results to Firestore + GA4
// --------------------------------------------------------------
export async function saveResult(resultData) {
  const { db } = getInitializedClients();
  const user = getAuthUser();

  if (!user) {
    console.warn("[API] Not saving — user not logged in.");
    return;
  }

  try {
    await addDoc(collection(db, "quiz_scores"), {
      user_id: user.uid,
      email: user.email,
      chapter: resultData.topic,
      difficulty: resultData.difficulty,
      score: resultData.score,
      total: resultData.total,
      percentage: Math.round((resultData.score / resultData.total) * 100),
      timestamp: serverTimestamp(),
    });

    console.log("[API] Result saved to Firestore");

    logAnalyticsEvent("quiz_completed", {
      user_id: user.uid,
      chapter: resultData.topic,
      difficulty: resultData.difficulty,
      score: resultData.score,
    });
  } catch (e) {
    console.error("[API] Failed to save result:", e);
  }
}
