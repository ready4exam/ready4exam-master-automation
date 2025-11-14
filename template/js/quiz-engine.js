// js/quiz-engine.js
// ------------------------------------------------------------
// Phase-3 Quiz Engine (Final Stable Build)
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
  topicSlug: "",
  table: ""
};

// ------------------------------------------------------------
// PARAM LOADER
// ------------------------------------------------------------
function readParams() {
  const params = new URLSearchParams(location.search);

  quizState.table =
    params.get("table") ||
    (window.__quiz_table || "").toLowerCase();

  quizState.difficulty = params.get("difficulty") || "simple";

  const topic = params.get("topic") || "";
  quizState.topicSlug = topic.replace(/_/g, " ");

  // update difficulty tag
  const diffTag = document.getElementById("difficulty-display");
  if (diffTag) {
    diffTag.textContent =
      "Difficulty: " +
      quizState.difficulty.charAt(0).toUpperCase() +
      quizState.difficulty.slice(1);
  }

  console.log("[ENGINE] Params loaded:", quizState);
}

// ------------------------------------------------------------
// WAIT FOR AUTH
// ------------------------------------------------------------
function waitForAuth() {
  return new Promise((resolve) => {
    const { auth } = getInitializedClients();
    const unsub = auth.onAuthStateChanged((user) => {
      if (user) {
        console.log("[ENGINE] Auth ready →", user.email);
        unsub();
        resolve(user);
      }
    });
  });
}

// ------------------------------------------------------------
// LOAD QUIZ
// ------------------------------------------------------------
async function loadQuiz() {
  UI.showStatus("Loading your quiz…", "text-blue-600");
  try {
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
    UI.showStatus(
      `<span class='text-red-600'>${err.message}</span>`,
      "text-red-600"
    );
  }
}

// ------------------------------------------------------------
// NAVIGATION
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

  // Save to Firestore
  await saveResult({
    topic: quizState.topicSlug,
    difficulty: quizState.difficulty,
    score,
    total
  });

  UI.renderResultsScreen(score, total, quizState);
}

// ------------------------------------------------------------
// EVENT LISTENERS
// ------------------------------------------------------------
function registerEvents() {
  document.getElementById("next-btn").onclick = next;
  document.getElementById("prev-btn").onclick = prev;
  document.getElementById("submit-btn").onclick = submitQuiz;

  document.body.addEventListener("click", (e) => {
    if (e.target.dataset?.option) {
      const option = e.target.dataset.option;
      const qid = quizState.questions[quizState.index].id;

      // store selected
      quizState.answers[qid] = option;

      // highlight
      UI.highlightSelectedOption(option);
    }
  });
}

// ------------------------------------------------------------
// MAIN BOOT
// ------------------------------------------------------------
async function initQuizEngine() {
  console.log("[ENGINE] Booting Quiz Engine…");

  readParams();
  registerEvents();

  await waitForAuth();
  await loadQuiz();

  console.log("[ENGINE] Quiz Ready.");
}

initQuizEngine();
