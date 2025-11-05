// js/api.js
// -----------------------------------------------------------------------------
// Data layer: Fetch questions (Supabase) + Save results (Firestore + GA4)
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
  return { supabase, db };
}

function getTableName(topic) {
  const key = topic.toLowerCase().replace(/\s+/g, "_").trim();
  const map = {
    motion: "motion",
    force: "force",
    gravitation: "gravitation",
    work_energy: "work_energy",
    sound: "sound",
    matter_surroundings: "matter_surroundings",
    matter_pure: "matter_pure",
    atom_molecules: "atom_molecules",
    structure_atom: "structure_atom",
    tissues: "tissues",
    food_resources: "food_resources",
  };
  return map[key] || key;
}

// -----------------------------------------------------------------------------
// Fetch questions from Supabase
// -----------------------------------------------------------------------------
export async function fetchQuestions(topic, difficulty) {
  const { supabase } = getClients();
  if (!supabase) throw new Error("Supabase not initialized.");

  const table = getTableName(topic);
  UI.showStatus(`Loading questions for <b>${topic}</b> (${difficulty})...`, "text-blue-600");

  const normalizedDiff =
    difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase();

  const { data, error } = await supabase
    .from(table)
    .select(`
      id, question_text, question_type, scenario_reason_text,
      option_a, option_b, option_c, option_d, correct_answer_key
    `)
    .eq("difficulty", normalizedDiff);

  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("No questions found.");

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
    // ✅ Ensure field name matches Firestore rules (user_id)
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

    // ✅ Also log event to GA4
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
