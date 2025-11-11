// js/quiz-engine.js
// -----------------------------------------------------------------------------
// Core quiz logic: loading questions, tracking progress, auth state, GA4 logging
// -----------------------------------------------------------------------------
//
// ✅ Enhanced (non-breaking):
// - Supports Supabase quiz tables via ?table=<table_name>
// - Keeps all existing logic intact
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

    if (typeof subjectBlock === "object" && !Array.isArray(subjectBlock)) {
      for (const sub in subjectBlock) {
        const arr = subjectBlock[sub];
        if (!Array.isArray(arr)) continue;
        for (const ch of arr) {
          if (ch?.id === topicSlug) return ch?.title || null;
        }
      }
    }

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

  if (!quizState.topicSlug && !window.__quiz_table)
    throw new Error("Missing topic parameter.");

  const displayTitle =
    findChapterTitle(quizState.classId, quizState.subject, quizState.topicSlug) ||
    humanizeSlug(quizState.topicSlug) ||
    humanizeSlug(window.__quiz_table);

  UI.updateHeader(displayTitle, quizState.difficulty);
  console.log(
    "[ENGINE] Initialized quiz parameters →",
    `class=${quizState.classId}, subject=${quizState.subject}, topic=${quizState.topicSlug}, difficulty=${quizState.difficulty}`
  );
}

// -------------------------------
// Load quiz from Supabase
// -------------------------------
async function loadQuiz() {
  try {
    const table = window.__quiz_table;
    console.log("[ENGINE] Forcing table:", window.__quiz_table);
    quizState.questions = await fetchQuestions(window.__quiz_table, quizState.difficulty);
    console.log("[ENGINE] Loaded questions:", quizState.questions.length);

    if (quizState.questions.length > 0) {
      quizState.currentQuestionIndex = 0;
      renderQuestion();
      UI.showView?.("quiz-content");
    } else {
      UI.showStatus("No questions found in Supabase.");
    }
  } catch (err) {
    console.error("[ENGINE] loadQuiz failed:", err);
    UI.showStatus("Failed to load quiz. Check console.");
  }
}

// -------------------------------
// Auth state callback
// -------------------------------
async function onAuthChange(user) {
  try {
    if (user) {
      UI.updateAuthUI?.(user);
      const hasAccess = await checkAccess(quizState.topicSlug || window.__quiz_table);
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
          topic: quizState.topicSlug || window.__quiz_table,
          difficulty: quizState.difficulty,
          score: quizState.score,
          total: quizState.questions.length,
          percentage,
          mcq_correct: correctTypeCount.mcq,
          ar_correct: correctTypeCount.ar,
          case_correct: correctTypeCount.case,
        });
      }
    } catch (e) {
      console.warn("[ENGINE] GA4 logging failed:", e);
    }
  }

  UI.showResults(quizState.score, quizState.questions.length);
}

// -------------------------------
// Initialize
// -------------------------------
async function initQuizEngine() {
  try {
    await initializeServices();
    parseUrlParameters();
    initializeAuthListener(onAuthChange);
    UI.bindControls?.({
      onNext: () => handleNavigation(1),
      onPrev: () => handleNavigation(-1),
      onSubmit: handleSubmit,
      onSelect: handleAnswerSelection,
      onRetry: () => loadQuiz(),
      onLogout: signOut,
      onGoogleSignIn: signInWithGoogle,
    });
  } catch (err) {
    console.error("[ENGINE] initQuizEngine failed:", err);
    UI.showStatus("Quiz initialization failed. Check console.");
  }
}

initQuizEngine();
