// js/quiz-engine.js
// -----------------------------------------------------------------------------
// Core quiz logic: loading questions, tracking progress, auth state, GA4 logging
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
import curriculumData from "./curriculum.js"; // Maps slug -> full chapter title

// -------------------------------
// Global quiz state
// -------------------------------
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

// -------------------------------
// Utility: Hash email for GA4
// -------------------------------
async function hashEmail(email) {
  const encoder = new TextEncoder();
  const data = encoder.encode(email.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// -------------------------------
// Convert slug to readable fallback
// -------------------------------
function humanizeSlug(slug) {
  if (!slug) return "";
  return slug
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// -------------------------------
// Find chapter title from curriculum (safe search)
// -------------------------------
function findChapterTitle(classId, subject, topicSlug) {
  try {
    if (!classId || !subject || !topicSlug) return null;
    const classBlock = curriculumData?.[classId];
    if (!classBlock) return null;

    const subjectBlock = classBlock[subject];
    if (!subjectBlock) return null;

    // Search nested subjects
    if (typeof subjectBlock === "object" && !Array.isArray(subjectBlock)) {
      for (const sub in subjectBlock) {
        const arr = subjectBlock[sub];
        if (!Array.isArray(arr)) continue;
        for (const ch of arr) {
          if (ch?.id === topicSlug) return ch?.title || null;
        }
      }
    }

    // Direct array
    if (Array.isArray(subjectBlock)) {
      for (const ch of subjectBlock) {
        if (ch?.id === topicSlug) return ch?.title || null;
      }
    }
    return null;
  } catch (e) {
    console.warn("[ENGINE] findChapterTitle failed:", e);
    return null;
  }
}

// -------------------------------
// Parse URL parameters
// -------------------------------
function parseUrlParameters() {
  const urlParams = new URLSearchParams(window.location.search);
  quizState.classId = urlParams.get("class");
  quizState.subject = urlParams.get("subject");
  quizState.topicSlug = urlParams.get("topic");
  quizState.difficulty = urlParams.get("difficulty");

  if (!quizState.topicSlug) throw new Error("Missing topic parameter.");

  const displayTitle =
    findChapterTitle(quizState.classId, quizState.subject, quizState.topicSlug) ||
    humanizeSlug(quizState.topicSlug);

  UI.updateHeader(displayTitle, quizState.difficulty);
  console.log(
    "[ENGINE] Initialized quiz parameters →",
    `class=${quizState.classId}, subject=${quizState.subject}, topic=${quizState.topicSlug}, difficulty=${quizState.difficulty}`
  );
}

// -------------------------------
// Auth state callback (must be defined before initialization)
// -------------------------------
async function onAuthChange(user) {
  try {
    if (user) {
      UI.updateAuthUI?.(user);
      const hasAccess = await checkAccess(quizState.topicSlug);
      if (hasAccess) {
        await loadQuiz();
      } else {
        UI.showView?.("paywall-screen");
      }
    } else {
      UI.updateAuthUI?.(null);
      UI.showView?.("paywall-screen");
    }
  } catch (err) {
    console.error("[ENGINE] Auth change error:", err);
  }
}

// -------------------------------
// Render a question
// -------------------------------
function renderQuestion() {
  const idx = quizState.currentQuestionIndex;
  const q = quizState.questions[idx];
  if (!q) {
    UI.showStatus("<span>No question to display.</span>");
    return;
  }

  UI.renderQuestion(q, idx + 1, quizState.userAnswers[q.id], quizState.isSubmitted);
  UI.updateNavigation?.(idx, quizState.questions.length, quizState.isSubmitted);
  UI.hideStatus();
}

// -------------------------------
// Navigation controls
// -------------------------------
function handleNavigation(dir) {
  const newIndex = quizState.currentQuestionIndex + dir;
  if (newIndex >= 0 && newIndex < quizState.questions.length) {
    quizState.currentQuestionIndex = newIndex;
    renderQuestion();
  }
}

// -------------------------------
// Answer selection handler
// -------------------------------
function handleAnswerSelection(questionId, selectedOption) {
  if (quizState.isSubmitted) return;
  quizState.userAnswers[questionId] = selectedOption;
  renderQuestion();
}

// -------------------------------
// Submit quiz
// -------------------------------
async function handleSubmit() {
  if (quizState.isSubmitted) return;
  quizState.isSubmitted = true;
  quizState.score = 0;

  const questionTypeCount = { mcq: 0, ar: 0, case: 0 };
  const correctTypeCount = { mcq: 0, ar: 0, case: 0 };

  quizState.questions.forEach((q) => {
    const type = (q.question_type || "").toLowerCase();
    if (questionTypeCount[type] !== undefined) questionTypeCount[type]++;
    const ans = quizState.userAnswers[q.id];
    if (ans && ans.toUpperCase() === (q.correct_answer || "").toUpperCase()) {
      quizState.score++;
      if (correctTypeCount[type] !== undefined) correctTypeCount[type]++;
    }
  });

  const percentage = Math.round((quizState.score / quizState.questions.length) * 100);
  const user = getAuthUser();

  const result = {
    classId: quizState.classId,
    subject: quizState.subject,
    topic: quizState.topicSlug,
    difficulty: quizState.difficulty,
    score: quizState.score,
    total: quizState.questions.length,
    percentage,
    user_answers: quizState.userAnswers,
  };

  if (user) {
    try {
      await saveResult(result);
    } catch (e) {
      console.warn("[ENGINE] Save failed:", e);
    }

    try {
      const emailHash = await hashEmail(user.email || "");
      if (typeof gtag === "function") {
        gtag("event", "quiz_completed", {
          email_hash: emailHash,
          topic: quizState.topicSlug,
          difficulty: quizState.difficulty,
          score: quizState.score,
          total: quizState.questions.length,
          percentage,
          mcq_correct: correctTypeCount.mcq,
          ar_correct: correctTypeCount.ar,
          case_correct: correctTypeCount.case,
        });
      }
    } catch (err) {
      console.warn("[GA4] Logging failed:", err);
    }
  }

  renderQuestion();
  UI.showResults(quizState.score, quizState.questions.length);
  UI.renderAllQuestionsForReview?.(quizState.questions, quizState.userAnswers);
  UI.updateNavigation?.(quizState.currentQuestionIndex, quizState.questions.length, true);
}

// -------------------------------
// Load quiz questions
// -------------------------------
async function loadQuiz() {
  try {
    UI.showStatus("Fetching questions...");
    const questions = await fetchQuestions(quizState.topicSlug, quizState.difficulty);
    if (!questions?.length) throw new Error("No questions found.");

    quizState.questions = questions;
    quizState.userAnswers = Object.fromEntries(questions.map((q) => [q.id, null]));
    quizState.currentQuestionIndex = 0;
    quizState.isSubmitted = false;

    renderQuestion();
    UI.attachAnswerListeners?.(handleAnswerSelection);
    UI.showView?.("quiz-content");
  } catch (err) {
    console.error("[ENGINE] loadQuiz failed:", err);
    UI.showStatus(`<span class="text-red-600">Error:</span> ${err.message}`);
  }
}

// -------------------------------
// DOM event handlers
// -------------------------------
function attachDomEventHandlers() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button, a");
    if (!btn) return;

    if (btn.id === "prev-btn") return handleNavigation(-1);
    if (btn.id === "next-btn") return handleNavigation(1);
    if (btn.id === "submit-btn") return handleSubmit();

    if (btn.id === "login-btn" || btn.id === "google-signin-btn" || btn.id === "paywall-login-btn")
      return signInWithGoogle();

    if (btn.id === "logout-nav-btn") return signOut();

    if (btn.id === "back-to-chapters-btn")
      return (window.location.href = "chapter-selection.html");
  });
}

// -------------------------------
// Initialize quiz engine
// -------------------------------
async function initQuizEngine() {
  try {
    UI.initializeElements();
    parseUrlParameters();

    console.log("[Config] Initializing services...");
    await initializeServices(quizState.classId);

    await initializeAuthListener(onAuthChange);
    attachDomEventHandlers();

    UI.hideStatus();
    console.log("[ENGINE] Initialization complete.");
  } catch (err) {
    console.error("[ENGINE FATAL] Initialization failed:", err);
    UI.showStatus(`<span class="text-red-600">Critical error:</span> ${err.message}`);
  }
}

document.addEventListener("DOMContentLoaded", initQuizEngine);
