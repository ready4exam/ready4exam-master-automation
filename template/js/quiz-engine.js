// js/quiz-engine.js
// -----------------------------------------------------------
// Phase-3 Updated Final (Synced with ui-renderer.js)
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
  topicSlug: ""
};


// ------------------------------------------------------------
// INIT
// ------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[ENGINE] Booting Quiz Engine…");

  // parse URL params
  const params = new URLSearchParams(location.search);
  state.table = params.get("table");
  state.difficulty = params.get("difficulty");

  console.log("[ENGINE] Params loaded:", state);

  // Auth + paywall check
  const ok = await checkAccess();
  if (!ok) return; // user not logged in → paywall stays

  console.log("[ENGINE] Auth ready");

  // fetch quiz
  const { questions } = await fetchQuiz(state.table, state.difficulty);
  state.questions = questions;

  console.log("[ENGINE] Loaded:", state.questions.length);

  UI.showQuiz();
  renderCurrentQuestion();
});


// ------------------------------------------------------------
// RENDER CURRENT QUESTION
// ------------------------------------------------------------
function renderCurrentQuestion() {
  UI.renderQuestion(state);

  const opts = document.querySelectorAll(".option-label");
  opts.forEach(label => {
    label.onclick = () => {
      const opt = label.getAttribute("data-option");
      const qid = state.questions[state.index].id;

      state.answers[qid] = opt;

      UI.highlightSelectedOption(qid, opt);
    };
  });
}


// ------------------------------------------------------------
// NAVIGATION
// ------------------------------------------------------------
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


// ------------------------------------------------------------
// SUBMIT
// ------------------------------------------------------------
document.getElementById("submit-btn").onclick = () => {
  let correct = 0;

  state.questions.forEach(q => {
    if (state.answers[q.id] === q.correct_answer) correct++;
  });

  UI.renderResultsScreen({
    score: correct,
    total: state.questions.length,
    questions: state.questions,
    answers: state.answers
  });

  UI.registerResultButtons(state.table);
};
