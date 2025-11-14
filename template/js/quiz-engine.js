// js/quiz-engine.js
// ------------------------------------------------------------
// Phase-3 Clean Quiz Engine (Final Stable Version)
// ------------------------------------------------------------

import { getInitializedClients } from "./config.js";
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
  chapter: "",
};

// ------------------------------------------------------------
// READ PARAMS
// ------------------------------------------------------------
function readParams() {
  const params = new URLSearchParams(location.search);

  quizState.table = params.get("table") || "";
  quizState.difficulty = params.get("difficulty") || "Simple";
  quizState.chapter = params.get("chapter") || "";

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
// FETCH QUESTIONS FROM BACKEND
// ------------------------------------------------------------
async function loadQuiz() {
  UI.showStatus("Loading your quiz…", "text-blue-600");

  try {
    const url = `https://ready4exam-master-automation.vercel.app/api/fetchQuiz?table=${quizState.table}&difficulty=${quizState.difficulty}`;
    const res = await fetch(url);
    const json = await res.json();

    if (!json.ok) throw new Error(json.error);

    quizState.questions = json.rows;

    console.log("[ENGINE] Loaded questions:", quizState.questions.length);

    if (!quizState.questions.length)
      throw new Error("No questions found.");

    UI.hideStatus();
    UI.showQuiz();
    UI.renderQuestion(quizState);

  } catch (err) {
    console.error("[ENGINE] loadQuiz failed:", err);
    UI.showStatus(`<span class='text-red-600'>${err.message}</span>`);
  }
}

// ------------------------------------------------------------
// NAVIGATION CONTROLS
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
// QUIZ SUBMIT
// ------------------------------------------------------------
function submitQuiz() {
  const total = quizState.questions.length;
  let score = 0;

  for (const q of quizState.questions) {
    const ans = quizState.answers[q.id];
    if (ans && ans === q.correct_answer_key) score++;
  }

  UI.showResults(score, total, quizState);
}

// ------------------------------------------------------------
// OPTION SELECTION HANDLER
// ------------------------------------------------------------
function registerOptionSelection() {
  document.body.addEventListener("click", (e) => {
    if (e.target.dataset && e.target.dataset.option) {
      const option = e.target.dataset.option;
      const qid = quizState.questions[quizState.index].id;

      quizState.answers[qid] = option;

      // highlight selected
      document
        .querySelectorAll(".option-label")
        .forEach((el) => el.classList.remove("selected-option"));

      e.target.classList.add("selected-option");
    }
  });
}

// ------------------------------------------------------------
// EXTRA NAVIGATION BUTTONS
// ------------------------------------------------------------
function registerPostQuizButtons() {
  document.getElementById("retry-level").onclick = () => {
    location.href = `quiz-engine.html?table=${quizState.table}&difficulty=${quizState.difficulty}&chapter=${quizState.chapter}`;
  };

  document.getElementById("retry-other").onclick = () => {
    location.href = `chapter-selection.html?subject=${quizState.subject}`;
  };

  document.getElementById("retry-chapter").onclick = () => {
    location.href = "chapter-selection.html";
  };
}

// ------------------------------------------------------------
// MAIN INIT
// ------------------------------------------------------------
async function initQuizEngine() {
  console.log("[ENGINE] Booting Quiz Engine…");

  readParams();
  registerOptionSelection();

  document.getElementById("next-btn").onclick = next;
  document.getElementById("prev-btn").onclick = prev;
  document.getElementById("submit-btn").onclick = submitQuiz;

  await waitForAuth();
  await loadQuiz();

  registerPostQuizButtons();

  console.log("[ENGINE] Quiz Ready.");
}

initQuizEngine();
