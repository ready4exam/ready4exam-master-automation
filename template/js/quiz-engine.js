// js/quiz-engine.js
// -----------------------------------------------------------------------------
// Phase-3 Clean Quiz Engine
// No schema-cache, no table guessing, no fallback.
// Uses ONLY window.__quiz_table produced by quiz-engine.html bootloader.
// -----------------------------------------------------------------------------

import { initializeServices, getAuthUser } from "./config.js";
import { fetchQuestions, saveResult } from "./api.js";
import * as UI from "./ui-renderer.js";
import {
  checkAccess,
  initializeAuthListener,
  signInWithGoogle,
  signOut,
} from "./auth-paywall.js";
import curriculumData from "./curriculum.js";

// -----------------------------------------------------------------------------
// Global quiz state
// -----------------------------------------------------------------------------
let quizState = {
  classId: null,
  subject: null,
  topicSlug: null,
  table: null,
  difficulty: null,
  questions: [],
  currentQuestionIndex: 0,
  userAnswers: {},
  isSubmitted: false,
  score: 0,
};

// -----------------------------------------------------------------------------
// Parse URL parameters
// -----------------------------------------------------------------------------
function parseUrlParameters() {
  const p = new URLSearchParams(window.location.search);

  quizState.classId = p.get("class");
  quizState.subject = p.get("subject");
  quizState.topicSlug = p.get("topic");
  quizState.difficulty = p.get("difficulty") || "simple";

  quizState.table = window.__quiz_table; // ⭐ The ONLY source of truth
  console.log("[ENGINE] Table resolved:", quizState.table);

  const readable =
    quizState.topicSlug?.replace(/_/g, " ") ||
    quizState.table?.replace(/_/g, " ");

  UI.updateHeader(readable, quizState.difficulty);

  console.log(
    "[ENGINE] Parameters →",
    quizState.classId,
    quizState.subject,
    quizState.topicSlug,
    quizState.difficulty
  );
}

// -----------------------------------------------------------------------------
// Load quiz
// -----------------------------------------------------------------------------
async function loadQuiz() {
  try {
    UI.showStatus("Loading quiz...");

    quizState.questions = await fetchQuestions({
      table: quizState.table,
      difficulty: quizState.difficulty,
    });

    console.log("[ENGINE] Loaded questions:", quizState.questions.length);

    UI.showView("quiz-content");
    renderQuestion();
  } catch (err) {
    console.error("[ENGINE] loadQuiz failed:", err);
    UI.showStatus(`<b>${err.message}</b>`, "text-red-600");
  }
}

// -----------------------------------------------------------------------------
// Render question
// -----------------------------------------------------------------------------
function renderQuestion() {
  const idx = quizState.currentQuestionIndex;
  const q = quizState.questions[idx];

  if (!q) {
    UI.showStatus("No question available.");
    return;
  }

  UI.renderQuestion(
    q,
    idx + 1,
    quizState.userAnswers[q.id],
    quizState.isSubmitted
  );

  UI.updateNavigation(
    idx,
    quizState.questions.length,
    quizState.isSubmitted
  );

  UI.hideStatus();
}

// -----------------------------------------------------------------------------
// Navigation
// -----------------------------------------------------------------------------
function handleNavigation(dir) {
  const next = quizState.currentQuestionIndex + dir;
  if (next >= 0 && next < quizState.questions.length) {
    quizState.currentQuestionIndex = next;
    renderQuestion();
  }
}

// -----------------------------------------------------------------------------
// Handle answer selection
// -----------------------------------------------------------------------------
function handleAnswerSelection(qid, ans) {
  if (quizState.isSubmitted) return;
  quizState.userAnswers[qid] = ans;
  renderQuestion();
}

// -----------------------------------------------------------------------------
// Submit quiz
// -----------------------------------------------------------------------------
async function handleSubmit() {
  if (quizState.isSubmitted) return;

  quizState.isSubmitted = true;
  quizState.score = 0;

  quizState.questions.forEach((q) => {
    const ua = quizState.userAnswers[q.id];
    if (ua && ua.toUpperCase() === q.correct_answer.toUpperCase()) {
      quizState.score++;
    }
  });

  const user = getAuthUser();

  if (user) {
    try {
      await saveResult({
        classId: quizState.classId,
        subject: quizState.subject,
        topic: quizState.topicSlug,
        difficulty: quizState.difficulty,
        score: quizState.score,
        total: quizState.questions.length,
      });
    } catch (err) {
      console.warn("[ENGINE] saveResult failed:", err);
    }
  }

  UI.showResults(quizState.score, quizState.questions.length, quizState);
}

// -----------------------------------------------------------------------------
// Auth listener
// -----------------------------------------------------------------------------
async function onAuthChange(user) {
  if (!user) {
    UI.updateAuthUI(null);
    UI.showView("paywall-screen");
    return;
  }

  UI.updateAuthUI(user);

  const allowed = await checkAccess(quizState.table);

  if (!allowed) {
    UI.showView("paywall-screen");
    return;
  }

  await loadQuiz();
}

// -----------------------------------------------------------------------------
// Initialize engine
// -----------------------------------------------------------------------------
export async function initQuizEngine() {
  parseUrlParameters();

  initializeServices(); // Only class11 now
  initializeAuthListener(onAuthChange);

  // UI bindings
  document.getElementById("google-signin-btn").onclick = signInWithGoogle;
  document.getElementById("logout-nav-btn").onclick = signOut;

  document.getElementById("prev-btn").onclick = () => handleNavigation(-1);
  document.getElementById("next-btn").onclick = () => handleNavigation(1);
  document.getElementById("submit-btn").onclick = handleSubmit;

  console.log("[ENGINE] Initialization complete.");
}

initQuizEngine();
