// js/quiz-engine.js
// ------------------------------------------------------------
// Phase-3 Stable Quiz Engine (with Review Mode + Retry Buttons)
// ------------------------------------------------------------

import { getInitializedClients } from "./config.js";
import { fetchQuestions, saveResult } from "./api.js";
import * as UI from "./ui-renderer.js";

// ------------------------------------------------------------
// STATE
// ------------------------------------------------------------
const quizState = {
  questions: [],
  index: 0,
  answers: {},
  difficulty: "",
  table: "",
  topicSlug: "",
  chapterName: ""
};

// ------------------------------------------------------------
// READ URL PARAMS
// ------------------------------------------------------------
function readParams() {
  const params = new URLSearchParams(location.search);

  quizState.table = params.get("table") || "";
  quizState.difficulty = params.get("difficulty") || "simple";
  quizState.topicSlug = params.get("topic") || "";
  quizState.chapterName = params.get("chapter") || "";

  console.log("[ENGINE] Params loaded:", quizState);

  const diffBadge = document.getElementById("difficulty-display");
  if (diffBadge)
    diffBadge.textContent =
      "Difficulty: " +
      quizState.difficulty.charAt(0).toUpperCase() +
      quizState.difficulty.slice(1);

  const title = document.getElementById("chapter-name-display");
  if (title)
    title.textContent = quizState.chapterName || quizState.topicSlug || "";
}

// ------------------------------------------------------------
// WAIT FOR AUTH
// ------------------------------------------------------------
function waitForAuth() {
  return new Promise((resolve) => {
    const { auth } = getInitializedClients();

    auth.onAuthStateChanged((user) => {
      if (user) {
        console.log("[ENGINE] Auth ready →", user.email);
        resolve(user);
      }
    });
  });
}

// ------------------------------------------------------------
// LOAD QUIZ
// ------------------------------------------------------------
async function loadQuiz() {
  try {
    UI.showStatus("Loading your quiz…");

    quizState.questions = await fetchQuestions({
      table: quizState.table,
      difficulty: quizState.difficulty
    });

    console.log("[ENGINE] Loaded:", quizState.questions.length);

    UI.hideStatus();
    UI.showQuiz();
    UI.renderQuestion(quizState);

  } catch (err) {
    console.error("[ENGINE] loadQuiz failed:", err);
    UI.showStatus(`<span class='text-red-600'>${err.message}</span>`);
  }
}

// ------------------------------------------------------------
// NEXT / PREVIOUS
// ------------------------------------------------------------
function next() {
  if (quizState.index < quizState.questions.length - 1) {
    quizState.index++;
    UI.renderQuestion(quizState);
  } else {
    UI.showSubmit();
  }
}

function prev() {
  if (quizState.index > 0) {
    quizState.index--;
    UI.renderQuestion(quizState);
  }
}

// ------------------------------------------------------------
// SUBMIT QUIZ
// ------------------------------------------------------------
async function submitQuiz() {
  const total = quizState.questions.length;
  let score = 0;

  for (const q of quizState.questions) {
    const userAns = quizState.answers[q.id];
    if (userAns && userAns === q.correct_answer) score++;
  }

  await saveResult({
    topic: quizState.topicSlug,
    difficulty: quizState.difficulty,
    score,
    total,
  });

  UI.renderResultsScreen(score, total, quizState);
}

// ------------------------------------------------------------
// OPTION CLICK HANDLER
// ------------------------------------------------------------
function registerAnswerHandler() {
  document.body.addEventListener("click", (e) => {
    if (!e.target.dataset.option) return;

    const option = e.target.dataset.option;
    const currentQ = quizState.questions[quizState.index];

    quizState.answers[currentQ.id] = option;

    UI.highlightSelectedOption(option);
  });
}

// ------------------------------------------------------------
// INIT ENGINE
// ------------------------------------------------------------
async function initQuizEngine() {
  console.log("[ENGINE] Booting Quiz Engine…");

  readParams();
  registerAnswerHandler();

  document.getElementById("next-btn").onclick = next;
  document.getElementById("prev-btn").onclick = prev;
  document.getElementById("submit-btn").onclick = submitQuiz;

  await waitForAuth();
  await loadQuiz();

  console.log("[ENGINE] Quiz Ready.");
}

initQuizEngine();
