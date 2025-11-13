// js/quiz-engine.js
// -----------------------------------------------------------------------------
// Phase-3 Quiz Engine — Stable, schema-cache-free, class-11 Supabase only
// -----------------------------------------------------------------------------

import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { initializeAll, getInitializedClients } from "./config.js";
import { fetchQuestions, saveResult } from "./api.js";
import * as UI from "./ui-renderer.js";

// -----------------------------------------------------------------------------
// Boot Parameters
// -----------------------------------------------------------------------------
const url = new URL(window.location.href);
const quizParams = {
  classId: url.searchParams.get("class") || "class11",
  subject: url.searchParams.get("subject") || "",
  topic: url.searchParams.get("topic") || "",
  difficulty: url.searchParams.get("difficulty") || "simple",
};

console.log(
  "[ENGINE] Initialized quiz parameters →",
  quizParams
);

// Expected table name already computed in HTML bootloader
const TABLE_NAME = window.__quiz_table;
console.log("[ENGINE] Using table:", TABLE_NAME);

// -----------------------------------------------------------------------------
// Internal State
// -----------------------------------------------------------------------------
let questions = [];
let currentIndex = 0;
let answers = {}; // track user answers


// -----------------------------------------------------------------------------
// Load Quiz Once Authenticated
// -----------------------------------------------------------------------------
async function loadQuiz() {
  try {
    UI.showStatus("Loading quiz… please wait.", "text-blue-700");

    const data = await fetchQuestions({
      table: TABLE_NAME,
      difficulty: quizParams.difficulty,
    });

    questions = data;
    UI.hideStatus();

    if (!questions.length) {
      UI.showStatus("No questions available for this chapter.", "text-red-600");
      return;
    }

    console.log("[ENGINE] Loaded", questions.length, "questions.");

    renderQuestion();
    UI.showQuizContent();

  } catch (err) {
    console.error("[ENGINE] loadQuiz failed:", err);

    UI.showStatus(
      "No quiz available for this chapter yet. Our system will generate soon.",
      "text-red-600"
    );
  }
}


// -----------------------------------------------------------------------------
// Render Question
// -----------------------------------------------------------------------------
function renderQuestion() {
  if (!questions.length) return;

  const q = questions[currentIndex];
  UI.renderQuestion(q, currentIndex, questions.length, answers[q.id] || null);

  // Show submit when last question
  if (currentIndex === questions.length - 1) {
    UI.showSubmitButton();
  } else {
    UI.hideSubmitButton();
  }
}


// -----------------------------------------------------------------------------
// Event: Record Answer
// -----------------------------------------------------------------------------
window.selectOption = function (qid, optionKey) {
  answers[qid] = optionKey;
};


// -----------------------------------------------------------------------------
// Navigation
// -----------------------------------------------------------------------------
document.getElementById("next-btn").onclick = () => {
  if (currentIndex < questions.length - 1) {
    currentIndex++;
    renderQuestion();
  }
};

document.getElementById("prev-btn").onclick = () => {
  if (currentIndex > 0) {
    currentIndex--;
    renderQuestion();
  }
};


// -----------------------------------------------------------------------------
// Submit Quiz
// -----------------------------------------------------------------------------
document.getElementById("submit-btn").onclick = () => {
  let score = 0;

  questions.forEach((q) => {
    if (answers[q.id] && answers[q.id] === q.correct_answer) {
      score++;
    }
  });

  const summary = {
    topic: quizParams.topic,
    difficulty: quizParams.difficulty,
    total: questions.length,
    score,
  };

  UI.showResultsScreen(summary, questions, answers);

  saveResult(summary);
};


// -----------------------------------------------------------------------------
// Auth Listener → Start Quiz
// -----------------------------------------------------------------------------
function initAuthListener() {
  const auth = getAuth();

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      UI.showPaywall();
      return;
    }

    UI.showUser(user);
    UI.hidePaywall();

    await loadQuiz();
  });
}


// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------
export function initQuizEngine() {
  console.log("[ENGINE] Starting initialization…");

  // Always class11 Supabase (single-instance)
  initializeAll("class11");

  initAuthListener();

  console.log("[ENGINE] Initialization complete.");
}


// Auto-start
initQuizEngine();
