// js/quiz-engine.js
// -----------------------------------------------------------------------------
// UNIVERSAL QUIZ ENGINE (Class 5–12)
// - Uses CLASS_ID injected by automation: {{CLASS}}
// - Curriculum-aware but with safe fallback
// - Integrated with auth-paywall.js (minimal DOM paywall)
// - Compatible with existing Supabase result schema (user_answers)
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

// 📌 Class injected by automation (important)
const CLASS_ID = "{{CLASS}}";

// ===========================================================
// GLOBAL STATE
// ===========================================================
let quizState = {
  classId: CLASS_ID,
  subject: "",
  topicSlug: "",
  difficulty: "",
  questions: [],
  currentQuestionIndex: 0,
  userAnswers: {},
  isSubmitted: false,
  score: 0,
};


// ===========================================================
// SMART CURRICULUM MATCH (supports book + non-book)
// ===========================================================
function findCurriculumMatch(topicSlug) {
  const normalize = (s) =>
    s
      ?.toString()
      .toLowerCase()
      .replace(/quiz/g, "")
      .replace(/[_\s-]/g, "")
      .trim();

  const target = normalize(topicSlug);

  for (const subject in curriculumData) {
    const books = curriculumData[subject];

    for (const book in books) {
      for (const ch of books[book]) {
        const idMatch = normalize(ch.table_id);
        const titleMatch = normalize(ch.chapter_title);

        if (idMatch === target) {
          return { subjectName: subject, chapterTitle: ch.chapter_title };
        }

        if (titleMatch === target) {
          return { subjectName: subject, chapterTitle: ch.chapter_title };
        }

        if (target.includes(titleMatch) || titleMatch.includes(target)) {
          return { subjectName: subject, chapterTitle: ch.chapter_title };
        }
      }
    }
  }

  return null;
}


// ===========================================================
// URL PARSER ★ with AUTO-FALLBACK
// ===========================================================
function parseUrlParameters() {
  const params = new URLSearchParams(location.search);

  quizState.topicSlug = params.get("topic") || "";
  quizState.difficulty = params.get("difficulty") || "simple";

  if (!quizState.topicSlug) {
    throw new Error("Topic not provided in URL");
  }

  const match = findCurriculumMatch(quizState.topicSlug);

  // --------- Fallback: when curriculum mapping is missing ----------
  if (!match) {
    console.warn(
      `⚠ No curriculum mapping found → Fallback used for: ${quizState.topicSlug}`
    );

    quizState.subject = "General";
    const prettyTopic = quizState.topicSlug.replace(/_/g, " ");
    UI.updateHeader(
      `Class ${CLASS_ID} – ${prettyTopic} Quiz`,
      quizState.difficulty
    );
    return;
  }
  // ----------------------------------------------------------------

  quizState.subject = match.subjectName;
  const chapterTitle = match.chapterTitle.replace(/quiz/gi, "").trim();

  const finalHeader = `Class ${CLASS_ID} ${quizState.subject} – ${chapterTitle} Worksheet`;
  UI.updateHeader(finalHeader, quizState.difficulty);
}


// ===========================================================
// RENDER QUESTION
// ===========================================================
function renderQuestion() {
  const i = quizState.currentQuestionIndex;
  const q = quizState.questions[i];
  if (!q) return UI.showStatus("No question to display.");

  UI.renderQuestion(
    q,
    i + 1,
    quizState.userAnswers[q.id],
    quizState.isSubmitted
  );
  UI.updateNavigation?.(i, quizState.questions.length, quizState.isSubmitted);
  UI.hideStatus();
}


// ===========================================================
// NAVIGATION + ANSWER SELECTION
// ===========================================================
function handleNavigation(dir) {
  const i = quizState.currentQuestionIndex + dir;
  if (i >= 0 && i < quizState.questions.length) {
    quizState.currentQuestionIndex = i;
    renderQuestion();
  }
}

function handleAnswerSelection(id, opt) {
  if (!quizState.isSubmitted) {
    quizState.userAnswers[id] = opt;
    renderQuestion();
  }
}


// ===========================================================
// SUBMIT → SCORE → SAVE RESULT
// ===========================================================
async function handleSubmit() {
  if (quizState.isSubmitted) return;
  quizState.isSubmitted = true;

  quizState.score = quizState.questions.filter((q) => {
    const userAns = quizState.userAnswers[q.id];
    const correct = q.correct_answer;
    if (!userAns || !correct) return false;
    return userAns.toUpperCase() === correct.toUpperCase();
  }).length;

  const user = getAuthUser();

  const result = {
    classId: CLASS_ID,
    subject: quizState.subject,
    topic: quizState.topicSlug,
    difficulty: quizState.difficulty,
    score: quizState.score,
    total: quizState.questions.length,
    user_answers: quizState.userAnswers, // ✅ BACKWARD-COMPATIBLE KEY
  };

  if (user) {
    try {
      await saveResult(result);
    } catch (e) {
      console.warn(e);
    }
  }

  quizState.currentQuestionIndex = 0;
  renderQuestion();
  UI.showResults(quizState.score, quizState.questions.length);
  UI.renderAllQuestionsForReview?.(quizState.questions, quizState.userAnswers);
  UI.updateNavigation?.(0, quizState.questions.length, true);
}


// ===========================================================
// LOAD QUIZ
// ===========================================================
async function loadQuiz() {
  try {
    UI.showStatus("Fetching questions...");

    const q = await fetchQuestions(quizState.topicSlug, quizState.difficulty);
    if (!q?.length) throw new Error("No questions found.");

    quizState.questions = q;
    quizState.userAnswers = Object.fromEntries(q.map((x) => [x.id, null]));

    renderQuestion();
    UI.attachAnswerListeners?.(handleAnswerSelection);
    UI.showView?.("quiz-content");
  } catch (e) {
    UI.showStatus(`Error: ${e.message}`, "text-red-600");
  }
}


// ===========================================================
// AUTH + SCREEN FLOW
// ===========================================================
async function onAuthChange(u) {
  if (u) {
    // checkAccess currently just checks login; extra args are safe no-ops
    const ok = await checkAccess(quizState.topicSlug);
    if (ok) {
      loadQuiz();
    } else {
      UI.showView("paywall-screen");
    }
  } else {
    UI.showView("paywall-screen");
  }
}


// ===========================================================
// DOM EVENT LISTENERS
// ===========================================================
function attachDomEvents() {
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button,a");
    if (!b) return;

    if (b.id === "prev-btn") return handleNavigation(-1);
    if (b.id === "next-btn") return handleNavigation(1);
    if (b.id === "submit-btn") return handleSubmit();

    if (
      b.id === "login-btn" ||
      b.id === "google-signin-btn" ||
      b.id === "paywall-login-btn"
    ) {
      return signInWithGoogle();
    }

    if (b.id === "logout-nav-btn") return signOut();
    if (b.id === "back-to-chapters-btn")
      location.href = "chapter-selection.html";
  });
}


// ===========================================================
// INIT
// ===========================================================
async function init() {
  UI.initializeElements();
  parseUrlParameters();
  await initializeServices();
  await initializeAuthListener(onAuthChange);
  attachDomEvents();
  UI.hideStatus();
}

document.addEventListener("DOMContentLoaded", init);