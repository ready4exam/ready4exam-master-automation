
console.log("[ENGINE] mock version loaded " + new Date().toISOString());
// js/quiz-engine.js
// -----------------------------------------------------------------------------
// Ready4Exam Quiz Engine – Mock-Mode (No Supabase calls)
// -----------------------------------------------------------------------------
// This version only verifies the frontend flow up to the “Welcome to the Quiz!”
// screen. Once confirmed, Supabase queries can be re-enabled.
// -----------------------------------------------------------------------------

import { initializeAll, getInitializedClients } from "./config.js";
import { getAuthUser } from "./config.js";

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------
const quizState = {
  classId: null,
  subject: null,
  topic: null,
  topicSlug: null,
  difficulty: null,
  questions: [],
  currentIndex: 0,
};

// -----------------------------------------------------------------------------
// Init
// -----------------------------------------------------------------------------
export async function initQuizEngine() {
  console.log("[ENGINE] Initializing Quiz Engine…");

  // Parse URL params
  const p = new URLSearchParams(window.location.search);
  quizState.classId = p.get("class") || "class11";
  quizState.subject = p.get("subject") || "Physics";
  quizState.topic = p.get("topic") || "Default";
  quizState.difficulty = (p.get("difficulty") || "simple").toLowerCase();
  quizState.topicSlug = quizState.topic.toLowerCase().replace(/\s+/g, "_");

  console.log(
    `[ENGINE] Initialized quiz parameters → class=${quizState.classId}, subject=${quizState.subject}, topic=${quizState.topic}, difficulty=${quizState.difficulty}`
  );

  // Initialize Firebase + Supabase safely
  initializeAll(quizState.classId);
  console.log("[ENGINE] Initialization complete.");

  // Simulate login ready and load quiz
  onAuthChange();
}

// -----------------------------------------------------------------------------
// Mock Auth Listener
// -----------------------------------------------------------------------------
function onAuthChange() {
  console.log("[ENGINE] Auth mock listener triggered (skipping real auth).");
  loadQuiz();
}

// -----------------------------------------------------------------------------
// Mock Quiz Loader (displays “Welcome to the Quiz!”)
// -----------------------------------------------------------------------------
async function loadQuiz() {
  console.log("[ENGINE] loadQuiz() called — mock mode active.");

  const paywall = document.getElementById("paywall-screen");
  const quizContent = document.getElementById("quiz-content");
  const resultsScreen = document.getElementById("results-screen");
  const statusMsg = document.getElementById("status-message");

  // Hide other screens
  paywall.style.display = "none";
  resultsScreen.style.display = "none";
  statusMsg.style.display = "none";

  // Show quiz content with mock message
  quizContent.style.display = "flex";
  quizContent.innerHTML = `
    <div class="text-center py-20 w-full">
      <h2 class="text-3xl font-bold text-cbse-blue mb-4">Welcome to the Quiz!</h2>
      <p class="text-gray-600 text-lg">
        The quiz system is successfully initialized in mock mode.<br/>
        Supabase fetch will be re-enabled after connection verification.
      </p>
    </div>
  `;
}

// -----------------------------------------------------------------------------
// Auto-initialize when loaded
// -----------------------------------------------------------------------------
window.addEventListener("DOMContentLoaded", initQuizEngine);
