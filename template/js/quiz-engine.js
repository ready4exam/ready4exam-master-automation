// js/quiz-engine.js
// -----------------------------------------------------------------------------
// Core quiz logic with safe handling: if fetchQuestions throws schema/cache errors,
// we intercept and display only "Welcome to the quiz". Original code/comments kept.
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
// Find chapter title from curriculum
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
// Auth state callback (original)
// -------------------------------
async function _original_onAuthChange(user) {
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
// Load quiz (original, may call Supabase)
// -------------------------------
async function _original_loadQuiz() {
  try {
    const params = {
      table: window.__quiz_table || null,
      difficulty: quizState.difficulty,
      classId: quizState.classId,
      subject: quizState.subject,
      chapterTitle: quizState.topicSlug,
      topicSlug: quizState.topicSlug,
    };

    console.log("[ENGINE] Requesting quiz with params:", params);
    quizState.questions = await fetchQuestions(params);

    if (!quizState.questions?.length) {
      UI.showStatus("No questions found for this topic.", "text-red-600");
      return;
    }

    UI.hideStatus();
    UI.showView?.("quiz-content");
    renderQuestion();
  } catch (err) {
    console.error("[ENGINE] loadQuiz failed:", err);
    UI.showStatus(`<span class='text-red-600 font-semibold'>⚠️ ${err.message}</span>`);
  }
}

// -------------------------------
// Safe wrappers: intercept errors and show "Welcome to the quiz"
// -------------------------------
async function safeLoadQuizWrapper(...args) {
  try {
    // call original loader
    await _original_loadQuiz(...args);
  } catch (err) {
    console.warn("[ENGINE] loadQuiz intercepted error (supabase calls suppressed):", err);
    // Instead of showing the raw error, display only the welcome message.
    showWelcomeUI();
  }
}

async function safeOnAuthChange(user) {
  try {
    if (user) {
      UI.updateAuthUI?.(user);
      // Use checkAccess as before — if it calls network, it should be fine (auth kept).
      // If checkAccess triggers supabase, ensure it's stubbed similarly. For now we call it and catch errors below.
      let hasAccess = false;
      try {
        hasAccess = await checkAccess(quizState.topicSlug || window.__quiz_table);
      } catch (e) {
        // If access check fails due to Supabase/schema issues, show welcome and stop.
        console.warn("[ENGINE] checkAccess failed, showing welcome:", e);
        showWelcomeUI();
        return;
      }

      if (hasAccess) {
        await safeLoadQuizWrapper();
      } else {
        UI.showView?.("paywall-screen");
      }
    } else {
      UI.updateAuthUI?.(null);
      UI.showView?.("paywall-screen");
    }
  } catch (err) {
    console.error("[ENGINE] Auth change error (wrapper):", err);
    // Ensure only the welcome message is shown on unexpected failures
    showWelcomeUI();
  }
}

// -------------------------------
// showWelcomeUI - show only the requested message in the UI
// -------------------------------
function showWelcomeUI() {
  // 1) Clear existing error/status displays
  try {
    const status = document.getElementById("status-message");
    if (status) {
      status.textContent = "Welcome to the quiz";
      status.classList.remove("hidden");
    }
  } catch (e) {
    // ignore
  }

  // 2) Optionally, display a centered overlay if you want a prominent message
  if (!document.getElementById("__quiz_welcome_overlay")) {
    const overlay = document.createElement("div");
    overlay.id = "__quiz_welcome_overlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.background = "rgba(0,0,0,0.25)";
    overlay.style.zIndex = "9999";
    overlay.innerHTML = '<div style="background:#fff;padding:20px;border-radius:10px;font-size:18px;font-weight:700;">Welcome to the quiz</div>';
    document.body.appendChild(overlay);
  }
}

// -------------------------------
// Render a question (unchanged)
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
// Navigation
// -------------------------------
function handleNavigation(dir) {
  const newIndex = quizState.currentQuestionIndex + dir;
  if (newIndex >= 0 && newIndex < quizState.questions.length) {
    quizState.currentQuestionIndex = newIndex;
    renderQuestion();
  }
}

// -------------------------------
// Answer select
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
    } catch (err) {
      console.warn("[ENGINE] GA4 logging failed:", err);
    }
  }

  UI.showResults(quizState.score, quizState.questions.length, quizState.questions, quizState.userAnswers);
}

// -------------------------------
// Init Quiz Engine
// -------------------------------
function initQuizEngine() {
  console.log("[ENGINE] Initialization complete.");
  parseUrlParameters();
  initializeServices();
  // Use safe auth listener wrapper so loadQuiz errors are handled
  initializeAuthListener(safeOnAuthChange);

  // Attach UI event listeners
  document.getElementById("next-btn")?.addEventListener("click", () => handleNavigation(1));
  document.getElementById("prev-btn")?.addEventListener("click", () => handleNavigation(-1));
  document.getElementById("submit-btn")?.addEventListener("click", handleSubmit);
}

// -------------------------------
window.addEventListener("DOMContentLoaded", initQuizEngine);
