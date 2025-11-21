// js/quiz-engine.js
// Option A: Uploaded-Version Logic (topicSlug + difficulty from internal state)

import { initializeServices } from "./config.js";
import { initializeAuthListener, signInWithGoogle } from "./auth-paywall.js";
import { fetchQuestions } from "./api.js";
import * as UI from "./ui-renderer.js";

const LOG = "[ENGINE]";

// GLOBAL quizState holder (uploaded version style)
window.quizState = window.quizState || {
  topicSlug: null,
  difficulty: "medium"
};

async function main() {
  await initializeServices();
  await initializeAuthListener(onAuthReady);

  const btn = document.getElementById("google-signin-btn");
  if (btn) btn.onclick = () => signInWithGoogle();

  console.log(LOG, "Engine ready.");
}

// --------------------------
// Called AFTER login
// --------------------------
async function onAuthReady(user) {
  if (!user) return;

  const topic = window.quizState.topicSlug;
  const diff = window.quizState.difficulty || "medium";

  if (!topic) {
    console.error(LOG, "Missing topicSlug — quiz cannot load.");
    UI.showStatus("Error: Topic missing.");
    return;
  }

  UI.showStatus("Loading quiz...");

  try {
    const questions = await fetchQuestions(topic, diff);
    UI.renderQuiz(questions);
    console.log(LOG, "Quiz loaded:", questions.length);
  } catch (e) {
    console.error(LOG, "Quiz loading failed:", e);
    UI.showStatus("Failed to load quiz.");
  }
}

document.addEventListener("DOMContentLoaded", main);
