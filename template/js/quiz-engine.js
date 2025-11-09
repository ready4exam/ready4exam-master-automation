// js/quiz-engine.js
// -----------------------------------------------------------------------------
// Core quiz logic: loading questions, tracking progress, auth state, GA4 logging
// -----------------------------------------------------------------------------

import { initializeServices, getAuthUser } from "./config.js";
import { fetchQuestions, saveResult } from "./api.js";
import * as UI from "./ui-renderer.js";
import { checkAccess, initializeAuthListener, signInWithGoogle, signOut } from "./auth-paywall.js";
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

// -------------------------------
// Parse quiz parameters (no localStorage)
// -------------------------------
function parseUrlParameters() {
  const urlParams = new URLSearchParams(window.location.search);

  quizState.classId = urlParams.get("class") || "class11";
  quizState.subject = urlParams.get("subject") || "Physics";
  quizState.topicSlug = urlParams.get("topic") || "Electric_Charges_and_Fields";
  quizState.difficulty = urlParams.get("difficulty") || "simple";

  if (!quizState.classId.startsWith("class")) quizState.classId = `class${quizState.classId}`;

  const displayTitle =
    findChapterTitle(quizState.classId, quizState.subject, quizState.topicSlug) ||
    quizState.topicSlug.replace(/_/g, " ");

  UI.updateHeader(displayTitle, quizState.difficulty);
  console.log(
    `[ENGINE] Initialized quiz parameters → class=${quizState.classId}, subject=${quizState.subject}, topic=${quizState.topicSlug}, difficulty=${quizState.difficulty}`
  );
}

// -------------------------------
// Safe chapter title resolver
// -------------------------------
function findChapterTitle(classId, subject, topicSlug) {
  try {
    const classBlock = curriculumData?.[classId];
    if (!classBlock) return null;
    const subjectBlock = classBlock[subject];
    if (!subjectBlock) return null;

    if (Array.isArray(subjectBlock)) {
      return subjectBlock.find((ch) => ch.id === topicSlug)?.title || null;
    }

    if (typeof subjectBlock === "object") {
      for (const sub in subjectBlock) {
        const arr = subjectBlock[sub];
        if (Array.isArray(arr)) {
          const match = arr.find((ch) => ch.id === topicSlug);
          if (match) return match.title || null;
        }
      }
    }

    return null;
  } catch (e) {
    console.warn("[ENGINE] findChapterTitle failed:", e);
    return null;
  }
}

// -------------------------------
// Initialize quiz engine
// -------------------------------
async function initQuizEngine() {
  try {
    UI.initializeElements();
    parseUrlParameters();

    UI.showStatus("Initializing services...");
    await initializeServices();
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

// ... rest of the file unchanged ...
