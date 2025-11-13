// js/quiz-engine.js
// -----------------------------------------------------------
// FINAL CLEAN VERSION (PHASE-3)
// • Loads quiz from Supabase table resolved in quiz-engine.html
// • DOES NOT use schema cache
// • No 9th-class fallback
// • Stable Google login integration
// -----------------------------------------------------------

import { initializeAll, getAuthUser } from "./config.js";
import { fetchQuestions, saveResult } from "./api.js";
import * as UI from "./ui-renderer.js";
import { initializeAuthListener, signInWithGoogle, signOut } from "./auth-paywall.js";

// -----------------------------------------------------------
// Global quiz state
// -----------------------------------------------------------
let quizState = {
  classId: null,
  subject: null,
  topicSlug: null,
  difficulty: null,
  questions: [],
  currentQuestionIndex: 0,
  userAnswers: {},
  isSubmitted: false,
  score: 0,
};

// -----------------------------------------------------------
// Parse URL parameters
// -----------------------------------------------------------
function parseUrl() {
  const p = new URLSearchParams(location.search);

  quizState.classId = p.get("class");
  quizState.subject = p.get("subject");
  quizState.topicSlug = p.get("topic");
  quizState.difficulty = p.get("difficulty");

  if (!window.__quiz_table) {
    console.error("No table name provided.");
  }

  UI.updateHeader(quizState.topicSlug, quizState.difficulty);

  console.log("[ENGINE] Initialized quiz parameters →", quizState);
}

// -----------------------------------------------------------
// Load quiz from Supabase
// -----------------------------------------------------------
async function loadQuiz() {
  try {
    UI.showStatus("Loading quiz…", "text-blue-600");

    const table = window.__quiz_table;

    console.log("[ENGINE] Loading table:", table);

    quizState.questions = await fetchQuestions({
      table,
      difficulty: quizState.difficulty,
    });

    console.log("[ENGINE] Quiz loaded:", quizState.questions.length);

    UI.showView("quiz-content");
    renderQuestion();
  } catch (err) {
    console.error("[ENGINE] loadQuiz failed:", err);
    UI.showStatus("Unable to load quiz. " + err.message, "text-red-600");
  }
}

// -----------------------------------------------------------
// Rendering the question
// -----------------------------------------------------------
function renderQuestion() {
  const idx = quizState.currentQuestionIndex;
  const q = quizState.questions[idx];

  if (!q) {
    UI.showStatus("No question available.", "text-red-600");
    return;
  }

  UI.renderQuestion(q, idx + 1, quizState.userAnswers[q.id], quizState.isSubmitted);
  UI.updateNavigation(idx, quizState.questions.length, quizState.isSubmitted);
  UI.hideStatus();
}

// -----------------------------------------------------------
// Answer selection
// -----------------------------------------------------------
function onAnswer(questionId, option) {
  if (quizState.isSubmitted) return;
  quizState.userAnswers[questionId] = option;
  renderQuestion();
}

// -----------------------------------------------------------
// Submit quiz
// -----------------------------------------------------------
async function submitQuiz() {
  if (quizState.isSubmitted) return;

  quizState.isSubmitted = true;
  quizState.score = 0;

  quizState.questions.forEach((q) => {
    const userAns = quizState.userAnswers[q.id];
    if (userAns && userAns === q.correct_answer) {
      quizState.score++;
    }
  });

  const user = getAuthUser();

  await saveResult({
    classId: quizState.classId,
    subject: quizState.subject,
    topic: quizState.topicSlug,
    difficulty: quizState.difficulty,
    score: quizState.score,
    total: quizState.questions.length,
    user_answers: quizState.userAnswers,
  });

  UI.showResults(quizState.score, quizState.questions.length, quizState);
}

// -----------------------------------------------------------
// Navigation
// -----------------------------------------------------------
function goNext() {
  if (quizState.currentQuestionIndex < quizState.questions.length - 1) {
    quizState.currentQuestionIndex++;
    renderQuestion();
  }
}

function goPrev() {
  if (quizState.currentQuestionIndex > 0) {
    quizState.currentQuestionIndex--;
    renderQuestion();
  }
}

// -----------------------------------------------------------
// Init
// -----------------------------------------------------------
export function initQuizEngine() {
  console.log("[ENGINE] Starting initialization…");

  parseUrl();

  initializeAll(quizState.classId);
  initializeAuthListener(async (user) => {
    if (user) {
      UI.updateAuthUI(user);
      await loadQuiz();
    } else {
      UI.showView("paywall-screen");
    }
  });

  // Button bindings
  document.getElementById("google-signin-btn")?.addEventListener("click", signInWithGoogle);
  document.getElementById("logout-nav-btn")?.addEventListener("click", signOut);

  document.getElementById("next-btn")?.addEventListener("click", goNext);
  document.getElementById("prev-btn")?.addEventListener("click", goPrev);
  document.getElementById("submit-btn")?.addEventListener("click", submitQuiz);

  console.log("[ENGINE] Initialization complete.");
}

// -----------------------------------------------------------
// Auto-run
// -----------------------------------------------------------
initQuizEngine();
