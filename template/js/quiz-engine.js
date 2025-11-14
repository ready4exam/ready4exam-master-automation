// js/quiz-engine.js
// ------------------------------------------------------------
// Phase-3 Quiz Engine — Final (Option A: Results + Review shown inline)
// ------------------------------------------------------------

import { getInitializedClients } from "./config.js";
import * as UI from "./ui-renderer.js";

// STATE
const quizState = {
  questions: [],       // array of question objects (normalized)
  index: 0,
  answers: {},         // map: qid -> "A"/"B"/"C"/"D"
  difficulty: "Simple",
  table: "",
  chapter: "",
  subject: ""
};

// Read URL params
function readParams() {
  const params = new URLSearchParams(location.search);
  quizState.table = params.get("table") || (window.__quiz_table || "");
  quizState.difficulty = (params.get("difficulty") || "Simple");
  quizState.chapter = params.get("chapter") || "";
  quizState.subject = params.get("subject") || "";
  console.log("[ENGINE] Params loaded:", quizState);
}

// Wait for Firebase auth to be ready
function waitForAuth() {
  return new Promise(resolve => {
    const { auth } = getInitializedClients();
    const unsub = auth.onAuthStateChanged(user => {
      if (user) {
        console.log("[ENGINE] Auth ready →", user.email);
        unsub();
        resolve(user);
      }
    });
  });
}

// Normalize server row -> client question object
function normalizeRow(row) {
  return {
    id: row.id,
    text: row.question_text || row.text || "",
    options: {
      A: row.option_a || row.options?.A || "",
      B: row.option_b || row.options?.B || "",
      C: row.option_c || row.options?.C || "",
      D: row.option_d || row.options?.D || ""
    },
    correct_answer: (row.correct_answer_key || row.correct_answer || "").toString().trim().toUpperCase(),
    correct_answer_key: (row.correct_answer_key || row.correct_answer || "").toString().trim().toUpperCase(),
    question_type: row.question_type || "",
    scenario_reason: row.scenario_reason_text || row.scenario_reason || ""
  };
}

// Load questions from backend fetchQuiz
async function loadQuiz() {
  UI.showStatus("Loading your quiz…", "text-blue-600");
  try {
    const url = `${location.origin}/api/fetchQuiz?table=${encodeURIComponent(quizState.table)}&difficulty=${encodeURIComponent(quizState.difficulty)}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Failed to fetch questions");

    const rows = json.rows || [];
    quizState.questions = rows.map(normalizeRow);
    if (!quizState.questions.length) throw new Error("No questions found.");

    UI.hideStatus();
    UI.showQuiz();
    UI.renderQuestion(quizState);
    console.log("[ENGINE] Loaded", quizState.questions.length, "questions");

  } catch (err) {
    console.error("[ENGINE] loadQuiz failed:", err);
    UI.showStatus(`<span class='text-red-600'>${err.message}</span>`);
  }
}

// Navigation
function next() {
  if (quizState.index < quizState.questions.length - 1) {
    quizState.index++;
    UI.renderQuestion(quizState);
  } else {
    // show submit button if at end
    UI.showSubmit();
  }
}

function prev() {
  if (quizState.index > 0) {
    quizState.index--;
    UI.renderQuestion(quizState);
  }
}

// Submit quiz -> compute score and call UI.showResults
function submitQuiz() {
  const total = quizState.questions.length;
  let score = 0;
  for (const q of quizState.questions) {
    const user = (quizState.answers[q.id] || "").toString().toUpperCase();
    const correct = (q.correct_answer || q.correct_answer_key || "").toString().toUpperCase();
    if (user && correct && user === correct) score++;
  }

  UI.showResults(score, total, {
    questions: quizState.questions,
    answers: quizState.answers,
    difficulty: quizState.difficulty,
    table: quizState.table,
    subject: quizState.subject,
    chapter: quizState.chapter
  });

  // attach action handlers for the three difficulty buttons and chapter button
  attachResultButtons();
}

// Option selection handler (delegated)
function attachOptionHandler() {
  document.body.addEventListener("click", (e) => {
    const el = e.target.closest && e.target.closest("[data-option]");
    if (!el) return;
    const option = el.getAttribute("data-option");
    const q = quizState.questions[quizState.index];
    if (!q) return;

    quizState.answers[q.id] = option;
    // re-render to show highlight
    UI.renderQuestion(quizState);
  });
}

// Attach handlers for result screen buttons (Retake Simple/Medium/Advanced, Choose Another Chapter)
function attachResultButtons() {
  const btnSimple = document.getElementById("btn-simple");
  const btnMedium = document.getElementById("btn-medium");
  const btnAdvanced = document.getElementById("btn-advanced");
  const btnAnother = document.getElementById("btn-another-chapter");

  if (btnSimple) {
    btnSimple.onclick = () => {
      location.href = `quiz-engine.html?table=${encodeURIComponent(quizState.table)}&difficulty=simple&chapter=${encodeURIComponent(quizState.chapter)}&subject=${encodeURIComponent(quizState.subject)}`;
    };
  }
  if (btnMedium) {
    btnMedium.onclick = () => {
      location.href = `quiz-engine.html?table=${encodeURIComponent(quizState.table)}&difficulty=medium&chapter=${encodeURIComponent(quizState.chapter)}&subject=${encodeURIComponent(quizState.subject)}`;
    };
  }
  if (btnAdvanced) {
    btnAdvanced.onclick = () => {
      location.href = `quiz-engine.html?table=${encodeURIComponent(quizState.table)}&difficulty=advanced&chapter=${encodeURIComponent(quizState.chapter)}&subject=${encodeURIComponent(quizState.subject)}`;
    };
  }
  if (btnAnother) {
    btnAnother.onclick = () => {
      // go back to chapter selection, preserve subject param
      const url = `chapter-selection.html${quizState.subject ? `?subject=${encodeURIComponent(quizState.subject)}` : ""}`;
      location.href = url;
    };
  }
}

// Register navigation buttons in DOM
function registerNavButtons() {
  const nextBtn = document.getElementById("next-btn");
  const prevBtn = document.getElementById("prev-btn");
  const submitBtn = document.getElementById("submit-btn");

  if (nextBtn) nextBtn.onclick = next;
  if (prevBtn) prevBtn.onclick = prev;
  if (submitBtn) submitBtn.onclick = submitQuiz;
}

// Main init
async function init() {
  console.log("[ENGINE] Booting Quiz Engine…");
  readParams();
  attachOptionHandler();
  registerNavButtons();

  // Wait for auth (firebase) to be ready before loading quiz
  await waitForAuth();
  await loadQuiz();
  console.log("[ENGINE] Quiz Ready.");
}

init();
