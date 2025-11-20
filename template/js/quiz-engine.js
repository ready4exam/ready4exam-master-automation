// js/quiz-engine.js
// Firebase login → fetch quiz → render quiz
import { initializeServices } from "./config.js";
import { initializeAuthListener, signInWithGoogle } from "./auth-paywall.js";
import { fetchQuestions } from "./api.js";
import * as UI from "./ui-renderer.js";

const LOG = "[ENGINE]";

async function main() {
  await initializeServices();
  await initializeAuthListener(onAuthReady);

  const signBtn = document.getElementById("sign-in-button");
  if (signBtn) signBtn.onclick = () => signInWithGoogle();

  const url = new URL(window.location.href);
  window.__quiz_table = url.searchParams.get("table") || url.searchParams.get("topic") || "relations_functions_quiz";
  window.__quiz_difficulty = url.searchParams.get("difficulty") || "medium";

  console.log(LOG, "Engine ready.");
}

async function onAuthReady(user) {
  if (!user) {
    console.log(LOG, "Waiting for login...");
    return;
  }

  const table = window.__quiz_table;
  const diff = window.__quiz_difficulty;

  UI.showStatus("Loading quiz...");
  try {
    const questions = await fetchQuestions(table, diff);
    UI.renderQuiz(questions);
    console.log(LOG, "Quiz loaded:", questions.length);
  } catch (e) {
    console.error(LOG, "Quiz loading failed:", e);
    UI.showStatus("Failed to load quiz.");
  }
}

document.addEventListener("DOMContentLoaded", main);
