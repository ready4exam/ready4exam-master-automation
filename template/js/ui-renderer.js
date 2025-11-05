// js/ui-renderer.js 
import { cleanKatexMarkers } from './utils.js';

let els = {};
let isInit = false;

function normalizeReasonText(txt) {
  if (!txt) return "";
  return txt.replace(/^\s*(Reasoning|Reason|Context)\s*(\(R\))?\s*:\s*/i, "").trim();
}

/* -----------------------------------
   ELEMENT INITIALIZATION
----------------------------------- */
export function initializeElements() {
  if (isInit) return;
  els = {
    title: document.getElementById("quiz-page-title"),
    diffBadge: document.getElementById("difficulty-display"),
    status: document.getElementById("status-message"),
    list: document.getElementById("question-list"),
    counter: document.getElementById("question-counter"),
    prevButton: document.getElementById("prev-btn"),
    nextButton: document.getElementById("next-btn"),
    submitButton: document.getElementById("submit-btn"),
    reviewScreen: document.getElementById("results-screen"),
    score: document.getElementById("score-display"),
    authNav: document.getElementById("auth-nav-container"),
    paywallScreen: document.getElementById("paywall-screen"),
    paywallContent: document.getElementById("paywall-content"),
    quizContent: document.getElementById("quiz-content"),
    reviewContainer: document.getElementById("review-container"),
    welcomeUser: document.getElementById("welcome-user"),
    miniTitle: document.getElementById("quiz-title"),
    chapterNameDisplay: document.getElementById("chapter-name-display"), // ✅ added
  };

  if (!els.reviewContainer) {
    const rc = document.createElement("div");
    rc.id = "review-container";
    rc.className = "w-full max-w-3xl text-left mb-8";
    const resultsSection = document.getElementById("results-screen");
    if (resultsSection)
      resultsSection.insertBefore(rc, resultsSection.querySelector(".flex") || null);
    els.reviewContainer = document.getElementById("review-container");
  }

  isInit = true;
}

/* -----------------------------------
   STATUS + HEADER
----------------------------------- */
export function showStatus(msg, cls = "text-gray-700") {
  initializeElements();
  if (!els.status) return;
  els.status.innerHTML = msg;
  els.status.className = `p-3 text-center font-semibold ${cls}`;
  els.status.classList.remove("hidden");
}

export function hideStatus() {
  initializeElements();
  if (els.status) els.status.classList.add("hidden");
}

export function updateHeader(topicDisplayTitle, diff) {
  initializeElements();

  // Remove old mini Ready4Exam label
  if (els.miniTitle) els.miniTitle.textContent = "";

  // Update main heading
  if (els.title) {
    const text = topicDisplayTitle ? `${topicDisplayTitle}` : "Ready4Exam Quiz";
    els.title.textContent = text;
  }

  // ✅ New: Also show chapter beside the home button
  if (els.chapterNameDisplay) {
    els.chapterNameDisplay.textContent = topicDisplayTitle || "";
    els.chapterNameDisplay.classList.remove("hidden");
  }

  // Difficulty badge
  if (els.diffBadge) {
    els.diffBadge.textContent = `Difficulty: ${diff || "--"}`;
    els.diffBadge.classList.remove("hidden");
  }
}

/* -----------------------------------
   AUTH UI
----------------------------------- */
export function updateAuthUI(user) {
  initializeElements();
  if (!els.authNav) return;
  const welcomeEl = els.welcomeUser;
  if (user) {
    const name =
      user.displayName?.split(" ")[0] ||
      user.email?.split("@")[0] ||
      "Student";
    if (welcomeEl) {
      welcomeEl.textContent = `Welcome, ${name}!`;
      welcomeEl.classList.remove("hidden");
    }
    document.getElementById("logout-nav-btn")?.classList.remove("hidden");
  } else {
    if (welcomeEl) welcomeEl.classList.add("hidden");
    document.getElementById("logout-nav-btn")?.classList.add("hidden");
  }
}

/* -----------------------------------
   AUTH LOADING OVERLAY
----------------------------------- */
export function showAuthLoading(message = "Signing you in — please wait...") {
  initializeElements();
  let overlay = document.getElementById("auth-loading-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "auth-loading-overlay";
    overlay.className = "fixed inset-0 bg-white/80 flex items-center justify-center z-50";
    overlay.innerHTML = `
      <div class="p-6 rounded-lg shadow-lg text-center max-w-lg bg-white">
        <div class="text-2xl font-bold mb-2">Signing in</div>
        <div class="text-sm text-gray-700 mb-4">${message}</div>
        <div class="w-12 h-12 mx-auto mb-1">
          <svg class="animate-spin w-12 h-12 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
          </svg>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  } else overlay.classList.remove("hidden");
}
export function hideAuthLoading() {
  const overlay = document.getElementById("auth-loading-overlay");
  if (overlay) overlay.remove();
}

/* -----------------------------------
   VIEW CONTROL
----------------------------------- */
export function showView(viewName) {
  initializeElements();
  const views = {
    "quiz-content": els.quizContent,
    "results-screen": els.reviewScreen,
    "paywall-screen": els.paywallScreen,
  };
  Object.values(views).forEach((v) => v && v.classList.add("hidden"));
  if (views[viewName]) views[viewName].classList.remove("hidden");
}

/* -----------------------------------
   QUESTION RENDERING
----------------------------------- */
export function renderQuestion(q, idxOneBased, selected, submitted) {
  initializeElements();
  if (!els.list) return;
  const type = (q.question_type || "").toLowerCase();
  const qText = cleanKatexMarkers(q.text || "");
  let reasonRaw = q.explanation || q.scenario_reason || "";
  const reason = normalizeReasonText(cleanKatexMarkers(reasonRaw));

  let label = "";
  if (type === "ar") label = "Reasoning (R)";
  else if (type === "case") label = "Context";

  const reasonHtml =
    (type === "ar" || type === "case") && reason && !submitted
      ? `<p class="text-gray-700 mt-2 mb-3">${label}: ${reason}</p>` : "";

  const submittedExplanationHtml =
    submitted && (type === "ar" || type === "case") && reason
      ? `<div class="mt-3 p-3 bg-gray-50 rounded text-gray-700 border border-gray-100"><b>${label}:</b> ${reason}</div>` : "";

  const optionsHtml = ["A", "B", "C", "D"]
    .map((opt) => {
      const txt = cleanKatexMarkers(q.options?.[opt] || "");
      const isSel = selected === opt;
      const isCorrect = submitted && (q.correct_answer || "").toUpperCase() === opt;
      const isWrong = submitted && isSel && !isCorrect;

      let cls = "option-label flex items-start p-3 border-2 rounded-lg cursor-pointer transition";
      if (isCorrect) cls += " border-green-600 bg-green-50";
      else if (isWrong) cls += " border-red-600 bg-red-50";
      else if (isSel) cls += " border-blue-500 bg-blue-50";

      return `
        <label class="block">
          <input type="radio" name="q-${q.id}" value="${opt}" class="hidden" ${isSel ? "checked" : ""} ${submitted ? "disabled" : ""}>
          <div class="${cls}">
            <span class="font-bold mr-3">${opt}.</span>
            <span class="text-gray-800">${txt}</span>
          </div>
        </label>`;
    }).join("");

  els.list.innerHTML = `
    <div class="space-y-6">
      <p class="text-lg font-bold text-gray-800">Q${idxOneBased}: ${qText}</p>
      ${reasonHtml}
      <div class="space-y-3">${optionsHtml}</div>
      ${submittedExplanationHtml}
    </div>`;

  if (els.counter)
    els.counter.textContent = `${idxOneBased} / ${els._total || "--"}`;
}

/* -----------------------------------
   ANSWER LISTENERS
----------------------------------- */
export function attachAnswerListeners(handler) {
  initializeElements();
  if (!els.list) return;
  if (els._listener) els.list.removeEventListener("change", els._listener);
  const listener = (e) => {
    if (e.target && e.target.type === "radio" && e.target.name.startsWith("q-")) {
      const qid = e.target.name.substring(2);
      handler(qid, e.target.value);
    }
  };
  els.list.addEventListener("change", listener);
  els._listener = listener;
}

/* -----------------------------------
   NAVIGATION + COUNTER
----------------------------------- */
export function updateNavigation(currentIndexZeroBased, totalQuestions, submitted) {
  initializeElements();
  els._total = totalQuestions;
  const show = (btn, cond) => btn && btn.classList.toggle("hidden", !cond);
  show(els.prevButton, currentIndexZeroBased > 0);
  show(els.nextButton, currentIndexZeroBased < totalQuestions - 1);
  show(els.submitButton, !submitted && currentIndexZeroBased === totalQuestions - 1);
  if (els.counter)
    els.counter.textContent = `${currentIndexZeroBased + 1} / ${totalQuestions}`;
}

/* -----------------------------------
   RESULTS + REVIEW
----------------------------------- */
export function showResults(score, total) {
  initializeElements();
  if (els.score) els.score.textContent = `${score} / ${total}`;
  showView("results-screen");
}

export function renderAllQuestionsForReview(questions, userAnswers = {}) {
  initializeElements();
  if (!els.reviewContainer) return;

  const html = questions.map((q, i) => {
    const txt = cleanKatexMarkers(q.text || "");
    const reason = normalizeReasonText(cleanKatexMarkers(q.explanation || ""));
    const label = (q.question_type || "").toLowerCase() === "case" ? "Context" : "Reasoning (R)";
    const ua = userAnswers[q.id] || "-";
    const ca = q.correct_answer || "-";
    const correct = ua && ua.toUpperCase() === ca.toUpperCase();
    return `
      <div class="mb-6 p-4 bg-white rounded-lg border border-gray-100 shadow-sm">
        <p class="font-bold text-lg mb-1">Q${i + 1}: ${txt}</p>
        ${reason ? `<p class="text-gray-700 mb-2">${label}: ${reason}</p>` : ""}
        <p>Your Answer: <span class="${correct ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}">${ua}</span></p>
        <p>Correct Answer: <b class="text-green-700">${ca}</b></p>
      </div>`;
  }).join("");

  els.reviewContainer.innerHTML = html;

  const retryBlock = document.createElement("div");
  retryBlock.className = "text-center mt-8 space-y-4";
  retryBlock.innerHTML = `
    <h3 class="text-lg font-semibold mb-3">Try Again or Explore</h3>
    <div class="flex justify-center gap-3 flex-wrap">
      <button data-diff="simple" class="px-5 py-2 bg-green-600 text-white rounded hover:bg-green-700">Simple (Easy)</button>
      <button data-diff="medium" class="px-5 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600">Medium</button>
      <button data-diff="advanced" class="px-5 py-2 bg-red-600 text-white rounded hover:bg-red-700">Advanced (Hard)</button>
    </div>
    <button id="back-to-chapters-btn" class="mt-4 px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700">Go Back to Chapter Selection</button>
  `;
  els.reviewContainer.appendChild(retryBlock);

  retryBlock.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-diff]");
    if (btn) {
      const params = new URLSearchParams(window.location.search);
      params.set("difficulty", btn.dataset.diff);
      window.location.href = `quiz-engine.html?${params.toString()}`;
    }
    if (e.target.id === "back-to-chapters-btn") {
      window.location.href = "chapter-selection.html";
    }
  });

  showView("results-screen");
}
