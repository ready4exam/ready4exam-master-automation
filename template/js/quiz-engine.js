// js/quiz-engine.js

// -----------------------------------------------------------------------------
// Core quiz logic: loading questions, tracking progress, auth state, GA4 logging
// -----------------------------------------------------------------------------
//
// ✅ Final Stable Version (Phase-3 Integration)
// - Uses parameterized Supabase fetch (no schema-cache lookups)
// - Fully compatible with new api.js (table_mappings + _quiz fallback)
// - Preserves UI + flow from Phase-2
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
// Load quiz (calls new API with safe table resolution)
// -------------------------------
async function loadQuiz() {
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
    UI.showStatus(`⚠️ ${err.message}`);
  }
}

// -------------------------------
// Render a question
// -------------------------------
function renderQuestion() {
