// js/quiz-engine.js (DIAGNOSTIC VERSION)
// -----------------------------------------------------------------------------
// Purpose: Identify which script still calls public.thermodynamics
// Displays "Welcome to the quiz!" instead of loading actual questions
// Logs every network fetch URL for inspection
// -----------------------------------------------------------------------------

console.clear();
console.log("%c[DEBUG] Quiz Engine Loaded", "color: green; font-weight: bold;");

// Intercept all fetch calls
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  console.log("%c[FETCH-INTERCEPT]", "color: orange; font-weight: bold;", args[0]);
  return originalFetch(...args);
};

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

function humanizeSlug(slug) {
  if (!slug) return "";
  return slug
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

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

function parseUrlParameters() {
  const urlParams = new URLSearchParams(window.location.search);
  quizState.classId = urlParams.get("class");
  quizState.subject = urlParams.get("subject");
  quizState.topicSlug = urlParams.get("topic");
  quizState.difficulty = urlParams.get("difficulty");

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

async function onAuthChange(user) {
  try {
    if (user) {
      UI.updateAuthUI?.(user);
      getInitializedClients();
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

// 🚨 Diagnostic LoadQuiz — only display welcome text and intercept fetches
async function loadQuiz() {
  console.log("%c[ENGINE] loadQuiz() triggered", "color: cyan; font-weight: bold;");
  const table = window.__quiz_table || `${quizState.topicSlug?.toLowerCase()}_quiz`;
  console.log("[ENGINE] Expected table →", table);

  // 🧩 STOP QUIZ LOADING (diagnostic mode)
  UI.showStatus("<b>Welcome to the quiz!</b> (Debug Mode — quiz loading paused)");
  console.log("%c[ENGINE] Quiz loading intentionally stopped (debug mode)", "color: yellow;");
  return; // ⛔ Prevent Supabase calls
}

function renderQuestion() {}
function handleNavigation() {}
function handleAnswerSelection() {}
async function handleSubmit() {}

async function initQuizEngine() {
  console.log("[Config] Initializing services...");
  initializeServices();
  parseUrlParameters();
  initializeAuthListener(onAuthChange);
  console.log("[ENGINE] Initialization complete (Diagnostic Mode).");
}

initQuizEngine();
