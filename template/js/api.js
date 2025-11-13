// js/api.js
// ------------------------------------------------------------
// Phase-3: Clean API (Supabase fetch + Firestore save)
// ------------------------------------------------------------

import { getInitializedClients, getAuthUser, logAnalyticsEvent } from "./config.js";
import { cleanKatexMarkers } from "./utils.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ------------------------------------------------------------
// FETCH QUESTIONS
// ------------------------------------------------------------
export async function fetchQuestions({ table, difficulty }) {
  const { supabase } = getInitializedClients();
  if (!supabase) throw new Error("Supabase not initialized");

  console.log("[API] Fetch →", table);

  const diff = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("difficulty", diff);

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
