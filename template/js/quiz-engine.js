// js/quiz-engine.js
// -----------------------------------------------------------
// Phase-3 Quiz Engine (Final Synced Build)
// -----------------------------------------------------------

import * as UI from "./ui-renderer.js";
import { checkAccess } from "./auth-paywall.js";
import { fetchQuiz } from "./api.js";

let state = {
  questions: [],
  answers: {},
  index: 0,
  table: "",
  difficulty: "",
};

// -----------------------------------------------------------
// INIT
// -----------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[ENGINE] Starting Quiz Engine…");

  const params = new URLSearchParams(location.search);
  state.table = params.get("table");
  state.difficulty = params.get("difficulty");

  console.log("[ENGINE] Params:", state);

  // AUTH CHECK
  const ok = await checkAccess();
  if (!ok) return;

  console.log("[ENGINE] Auth OK");

  // FETCH QUIZ
  const { questions } = await fetchQuiz(state.table, state.difficulty);
  state.questions = questions;

  console.log("[ENGINE] Loaded Questions:", questions.length);

  UI.showQuiz();
  renderCurrentQuestion();
});

// -----------------------------------------------------------
// RENDER CURRENT QUESTION
// -----------------------------------------------------------
function renderCurrentQuestion() {
  UI.renderQuestion(state);

  const labels = document.querySelectorAll(".option-label");
  labels.forEach((lb) => {
    lb.onclick = () => {
      const selected = lb.getAttribute("data-option");
      const qid = state.questions[state.index].id;

      state.answers[qid] = selected;

      UI.highlightSelectedOption(qid, selected);
    };
  });
}

// -----------------------------------------------------------
// NAVIGATION
// -----------------------------------------------------------
document.getElementById("next-btn").onclick = () => {
  if (state.index < state.questions.length - 1) {
    state.index++;
    renderCurrentQuestion();
  }
};

document.getElementById("prev-btn").onclick = () => {
  if (state.index > 0) {
    state.index--;
    renderCurrentQuestion();
  }
};

// -----------------------------------------------------------
// SUBMIT
// -----------------------------------------------------------
document.getElementById("submit-btn").onclick = () => {
  let score = 0;

  state.questions.forEach((q) => {
    if (state.answers[q.id] === q.correct_answer) score++;
  });

  UI.renderResultsScreen({
    score,
    total: state.questions.length,
    questions: state.questions,
    answers: state.answers,
  });

  UI.registerResultButtons(state.table);
};
