// js/api.js
// ------------------------------------------------------------
// Phase-3: Clean API (Supabase fetch + Firestore save)
// ------------------------------------------------------------

import { getInitializedClients, getAuthUser, logAnalyticsEvent } from "./config.js";
import { cleanKatexMarkers } from "./utils.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ------------------------------------------------------------
// NORMALIZATION HELPERS
// ------------------------------------------------------------
function normalizeDifficulty(d) {
  d = (d || "").toLowerCase().trim();

  if (d.includes("simple") || d.includes("easy")) return "simple";
  if (d.includes("medium")) return "medium";
  if (d.includes("hard") || d.includes("advanced")) return "advanced";

  return "simple"; // fallback-safe
}

// ------------------------------------------------------------
// FETCH QUESTIONS (client-side)
// ------------------------------------------------------------
export async function fetchQuestions({ table, difficulty }) {
  const { supabase } = getInitializedClients();
  if (!supabase) throw new Error("Supabase not initialized");

  console.log("[API] Fetch →", table, " | difficulty:", difficulty);

  const diff = normalizeDifficulty(difficulty); // strict normalized

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .ilike("difficulty", diff);   // strict matching

  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("No questions found.");

  return data.map(q => ({
    id: q.id,
    text: cleanKatexMarkers(q.question_text),
    options: {
      A: cleanKatexMarkers(q.option_a),
      B: cleanKatexMarkers(q.option_b),
      C: cleanKatexMarkers(q.option_c),
      D: cleanKatexMarkers(q.option_d),
    },
    correct_answer: q.correct_answer_key?.trim().toUpperCase(),
    question_type: q.question_type,
    scenario_reason: q.scenario_reason_text || ""
  }));
}

// ------------------------------------------------------------
// SAVE RESULT TO FIRESTORE
// ------------------------------------------------------------
export async function saveResult({ topic, difficulty, score, total }) {
  const { db } = getInitializedClients();
  const user = getAuthUser();

  if (!user) return;

  await addDoc(collection(db, "quiz_scores"), {
    action: "Quiz Completed",
    user_id: user.uid,
    email: user.email,
    chapter: topic,
    difficulty,
    score,
    total,
    percentage: Math.round((score / total) * 100),
    timestamp: serverTimestamp()
  });

  logAnalyticsEvent("quiz_completed", { topic, difficulty, score, total });
}
