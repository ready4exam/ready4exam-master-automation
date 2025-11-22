// js/quiz-engine.js
// Option A: Uploaded-Version Logic (topicSlug + difficulty from internal state)
import { initializeServices } from "./config.js";
import { initializeAuthListener, signInWithGoogle } from "./auth-paywall.js";
import { fetchQuestions } from "./api.js";
import * as UI from "./ui-renderer.js";

const LOG = "[ENGINE]";

/**
 * Reads 'table' (which is the topicSlug) and 'difficulty' from the URL query string.
 * This is crucial because chapter-selection.html passes these parameters via the URL.
 */
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  // 'table' is the parameter passed from chapter-selection.html (as seen in source [4])
  return {
    topic: params.get("table"),
    difficulty: params.get("difficulty")
  };
}

// GLOBAL quizState holder (uploaded version style)
window.quizState = window.quizState || {
  topicSlug: null,
  difficulty: "medium"
};

async function main() {
  // 🔥 FIX START: Initialize topicSlug and difficulty from URL parameters
  const urlParams = getUrlParams();
  
  if (urlParams.topic) {
    // Set the necessary topicSlug (which is the table name used in api.js [5])
    window.quizState.topicSlug = urlParams.topic;
    console.log(LOG, "Set topicSlug from URL:", urlParams.topic);
  }
  
  if (urlParams.difficulty) {
    window.quizState.difficulty = urlParams.difficulty;
    console.log(LOG, "Set difficulty from URL:", urlParams.difficulty);
  }
  // 🔥 FIX END
  
  await initializeServices();
  // Now, initializeAuthListener(onAuthReady) runs, and when onAuthReady fires, 
  // window.quizState.topicSlug will not be null, allowing the quiz to proceed.
  await initializeAuthListener(onAuthReady);
  
  const btn = document.getElementById("google-signin-btn");
  if (btn) btn.onclick = () => signInWithGoogle();
  console.log(LOG, "Engine ready.");
}

// --------------------------
// Called AFTER login
// --------------------------
async function onAuthReady(user) {
  if (!user) return;
  const topic = window.quizState.topicSlug;
  const diff = window.quizState.difficulty || "medium";
  
  // This check now correctly handles the topic slug retrieved from the URL
  if (!topic) {
    console.error(LOG, "Missing topicSlug — quiz cannot load.");
    UI.showStatus("Error: Topic missing.");
    return;
  }
  
  // Assuming 'hidePaywall' was called successfully in auth-paywall.js [6]
  UI.showStatus("Loading quiz...");
  
  try {
    const questions = await fetchQuestions(topic, diff);
    UI.renderQuiz(questions);
    console.log(LOG, "Quiz loaded:", questions.length);
    
    // 🔥 Missing step in source: Unhide quiz content after load
    const quizContent = document.getElementById("quiz-content");
    if (quizContent) quizContent.classList.remove("hidden");
    
  } catch (e) {
    console.error(LOG, "Quiz loading failed:", e);
    UI.showStatus("Failed to load quiz.");
    // Ensure paywall remains hidden if authentication succeeded but loading failed
  }
}
document.addEventListener("DOMContentLoaded", main);
