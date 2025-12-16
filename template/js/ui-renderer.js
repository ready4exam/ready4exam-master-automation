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
    chapterNameDisplay: document.getElementById("chapter-name-display"),
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
   STATUS MESSAGE
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

/* -----------------------------------
   🔥 FIXED HEADER DISPLAY
----------------------------------- */
export function updateHeader(topicDisplayTitle, diff) {
  initializeElements();

  const finalHeader = topicDisplayTitle;

  if (els.miniTitle) els.miniTitle.textContent = "";
  if (els.title) els.title.textContent = finalHeader;
  if (els.chapterNameDisplay) {
    els.chapterNameDisplay.textContent = finalHeader;
    els.chapterNameDisplay.classList.remove("hidden");
  }
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
    const name = user.displayName?.split(" ")[0] || user.email?.split("@")[0] || "Student";
    welcomeEl.textContent = `Welcome, ${name}!`;
    welcomeEl.classList.remove("hidden");
    document.getElementById("logout-nav-btn")?.classList.remove("hidden");
  } else {
    welcomeEl.classList.add("hidden");
    document.getElementById("logout-nav-btn")?.classList.add("hidden");
  }
}

/* -----------------------------------
   AUTH LOADING UI
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
  Object.values(views).forEach(v => v?.classList.add("hidden"));
  views[viewName]?.classList.remove("hidden");
}

/* -----------------------------------
   QUESTION RENDERER (AR / CASE / MCQ)
----------------------------------- */
export function renderQuestion(q, idxOneBased, selected, submitted) {
  initializeElements();
  if (!els.list) return;

  // ---------------------------
  // Universal normalizer (safe)
  // maps different field names from DB/backend to UI fields
  // ---------------------------
  const mapped = {
    id: q.id,
    question_type: (q.question_type || q.type || "").toLowerCase(),
    text: q.text || q.question_text || q.prompt || "",
    scenario_reason: q.scenario_reason || q.scenario_reason_text || q.context || q.passage || "",
    explanation: q.explanation || q.explanation_text || q.reason || "",
    correct_answer: q.correct_answer || q.correct_answer_key || q.answer || "",
    options: {
      A: (q.options && (q.options.A || q.options.a)) || q.option_a || q.a || q.opt_a || "",
      B: (q.options && (q.options.B || q.options.b)) || q.option_b || q.b || q.opt_b || "",
      C: (q.options && (q.options.C || q.options.c)) || q.option_c || q.c || q.opt_c || "",
      D: (q.options && (q.options.D || q.options.d)) || q.option_d || q.d || q.opt_d || ""
    }
  };

  // use mapped object for downstream logic
  q = mapped;

  const type = (q.question_type || "").toLowerCase();

  /* ================== ASSERTION-REASON ================== */
  if (type === "ar") {
    const rawQ = cleanKatexMarkers(q.text || "");
    const rawReasonSource = cleanKatexMarkers(q.scenario_reason || q.explanation || "");

    let assertion = "";
    let reason = "";

    const bothMatch = rawQ.match(
      /Assertion\s*\(A\)\s*[:\-]?\s*(.*?)(?:Reason\s*\(R\)\s*[:\-]?\s*(.*))?$/is
    );
    if (bothMatch) {
      assertion = (bothMatch[1] || "").trim();
      if (bothMatch[2]) reason = bothMatch[2].trim();
    }

    if (!assertion) {
      const aOnly = rawQ.match(/Assertion\s*\(A\)\s*[:\-]?\s*(.*)$/is);
      if (aOnly) assertion = aOnly[1].trim();
    }

    if (!assertion) assertion = rawQ.trim();

    if (!reason) {
      const rInline = rawQ.match(/Reason\s*\(R\)\s*[:\-]?\s*(.*)$/is);
      if (rInline?.[1]) reason = rInline[1].trim();
    }

    if (!reason && rawReasonSource) {
      if (/Reason\s*\(R\)/i.test(rawReasonSource)) {
        reason = rawReasonSource.replace(/.*Reason\s*\(R\)\s*[:\-]?\s*/i, "").trim();
      } else {
        reason = rawReasonSource.trim();
      }
    }

    if (!reason) reason = "";

    const arOptionText = {
      A: "Both A and R are true and R is the correct explanation of A.",
      B: "Both A and R are true but R is not the correct explanation of A.",
      C: "A is true but R is false.",
      D: "A is false but R is true.",
    };

    const optionsHtml = ["A", "B", "C", "D"].map(opt => {
      const isSel = selected === opt;
      const isCorrect = submitted && q.correct_answer?.toUpperCase() === opt;
      const isWrong = submitted && isSel && !isCorrect;

      // MODIFIED: Changed p-2 to p-1 for compactness
      let cls = "option-label flex items-start p-1 border-2 rounded-lg cursor-pointer transition";
      if (isCorrect) cls += " border-green-600 bg-green-50";
      else if (isWrong) cls += " border-red-600 bg-red-50";
      else if (isSel) cls += " border-blue-500 bg-blue-50";

      return `
        <label class="block">
          <input type="radio" name="q-${q.id}" value="${opt}" class="hidden" ${isSel ? "checked" : ""} ${submitted ? "disabled" : ""}>
          <div class="${cls}">
            <span class="font-bold mr-3">${opt})</span>
            <span class="text-gray-800">${arOptionText[opt]}</span>
          </div>
        </label>`;
    }).join("");

    els.list.innerHTML = `
      <div class="space-y-4"> // Slightly reduced from space-y-5
        <p class="text-lg font-bold text-gray-900">
          Q${idxOneBased}:
          <span class="font-bold"> Assertion (A):</span> ${assertion}
        </p>
        <p class="text-md text-gray-900">
          <span class="font-bold">Reason (R):</span> ${reason}
        </p>
        <div class="mt-2 text-gray-900 font-semibold"> // Reduced mt-3 to mt-2
          Mark the correct choice as:
        </div>
        <div class="space-y-2"> // Reduced space-y-3 to space-y-2
          ${optionsHtml}
        </div>
      </div>`;

    if (els.counter)
      els.counter.textContent = `${idxOneBased} / ${els._total || "--"}`;
    return;
  }

  /* ================== CASE BASED ================== */
  if (type === "case") {
    const rawQ = cleanKatexMarkers(q.text || "");
    const rawScenario = cleanKatexMarkers(q.scenario_reason || "");

    const isQuestionLike = (txt) => {
      if (!txt) return false;
      return /[?]/.test(txt) ||
             /\bBased on\b/i.test(txt) ||
             /\banswer\b/i.test(txt) ||
             /\bfollowing\b/i.test(txt) ||
             /\b1\./.test(txt) ||
             /\b2\./.test(txt);
    };

    let scenarioText = "";
    let questionText = "";

    if (rawScenario && isQuestionLike(rawScenario)) {
      scenarioText = rawQ;
      questionText = rawScenario;
    } else if (rawScenario) {
      scenarioText = rawScenario;
      questionText = rawQ;
    } else {
      const splitMatch = rawQ.match(/(Based on.*|Considering.*|Answer the following.*)/is);
      if (splitMatch && splitMatch.index > 0) {
        scenarioText = rawQ.slice(0, splitMatch.index).trim();
        questionText = splitMatch[1].trim();
      } else {
        scenarioText = rawQ;
        questionText = "";
      }
    }

    const optionsHtml = ["A", "B", "C", "D"].map(opt => {
      const txt = cleanKatexMarkers(q.options?.[opt] || "");
      const isSel = selected === opt;
      const isCorrect = submitted && q.correct_answer?.toUpperCase() === opt;
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

    let reasonRaw = q.explanation || "";
    const reason = normalizeReasonText(cleanKatexMarkers(reasonRaw));
    const submittedExplanationHtml =
      submitted && reason
        ? `<div class="mt-2 p-2 bg-gray-50 rounded text-gray-700 border border-gray-100"><b>Explanation:</b> ${reason}</div>` // Reduced mt-3 to mt-2, p-3 to p-2
        : "";

    els.list.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-start"> // Reduced gap-6 to gap-4
        <div class="p-3 bg-gray-50 rounded-lg border border-gray-200"> // REMOVED max-h-64 overflow-y-auto and reduced p-4 to p-3
          <h3 class="font-semibold mb-1 text-gray-900">Scenario</h3> // Reduced mb-2 to mb-1
          <p class="text-gray-800 text-sm md:text-base whitespace-pre-line">${scenarioText}</p>
        </div>
        <div class="space-y-3"> // Reduced space-y-4 to space-y-3
          <p class="text-lg font-bold text-gray-900">Q${idxOneBased}: ${questionText || "Based on the scenario, answer this question."}</p>
          <div class="space-y-1">${optionsHtml}</div> // Reduced space-y-2 to space-y-1
          ${submittedExplanationHtml}
        </div>
      </div>`;

    if (els.counter)
      els.counter.textContent = `${idxOneBased} / ${els._total || "--"}`;
    return;
  }

  /* ================== NORMAL MCQ ================== */
  const qText = cleanKatexMarkers(q.text || "");
  let reasonRaw = q.explanation || q.scenario_reason || "";
  const reason = normalizeReasonText(cleanKatexMarkers(reasonRaw));
  const label = type === "case" ? "Context" : "Reasoning (R)";

  const reasonHtml =
    (type === "ar" || type === "case") && reason && !submitted
      ? `<p class="text-gray-700 mt-1 mb-2">${label}: ${reason}</p>` : ""; // Reduced mt-2 mb-3

  const submittedExplanationHtml =
    submitted && (type === "ar" || type === "case") && reason
      ? `<div class="mt-2 p-2 bg-gray-50 rounded text-gray-700 border border-gray-100"><b>${label}:</b> ${reason}</div>` // Reduced mt-3 p-3
      : "";

  const optionsHtml = ["A", "B", "C", "D"].map(opt => {
    const txt = cleanKatexMarkers(q.options?.[opt] || "");
    const isSel = selected === opt;
    const isCorrect = submitted && q.correct_answer?.toUpperCase() === opt;
    const isWrong = submitted && isSel && !isCorrect;

    // MODIFIED: Changed p-3 to p-2 for compactness
    let cls = "option-label flex items-start p-2 border-2 rounded-lg cursor-pointer transition";
    if (isCorrect) cls += " border-green-600 bg-green-50";
    else if (isWrong) cls += " border-red-600 bg-red-50";
    else if (isSel) cls += " border-blue-500 bg-blue-50";

    return `
      <label class="block">
        <input type="radio" name="q-${q.id}" value="${opt}" class="hidden" ${isSel?"checked":""} ${submitted?"disabled":""}>
        <div class="${cls}">
          <span class="font-bold mr-3">${opt}.</span>
          <span class="text-gray-800">${txt}</span>
        </div>
      </label>`;
  }).join("");

  els.list.innerHTML = `
    <div class="space-y-2"> // Reduced space-y-4 to space-y-2 (major compaction)
      <p class="text-lg font-bold text-gray-800">Q${idxOneBased}: ${qText}</p>
      ${reasonHtml}
      <div class="space-y-2">${optionsHtml}</div> // Reduced space-y-3 to space-y-2
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
    if (e.target?.type === "radio" && e.target.name.startsWith("q-")) {
      handler(e.target.name.substring(2), e.target.value);
    }
  };
  els.list.addEventListener("change", listener);
  els._listener = listener;
}

/* -----------------------------------
   NAVIGATION
----------------------------------- */
export function updateNavigation(index, total, submitted) {
  initializeElements();
  els._total = total;
  const show = (btn, cond) => btn && btn.classList.toggle("hidden", !cond);
  show(els.prevButton, index > 0);
  show(els.nextButton, index < total - 1);
  show(els.submitButton, !submitted && index === total - 1);
  if (els.counter) els.counter.textContent = `${index + 1} / ${total}`;
}

/* -----------------------------------
   RESULTS + REVIEW (CLEAN - NO DUPLICATION)
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
    const isCase = q.question_type?.toLowerCase() === "case";
    const label = isCase ? "Context" : "Reasoning (R)";

    const uaOpt = userAnswers[q.id];
    const caOpt = q.correct_answer;

    const uaText = uaOpt
      ? cleanKatexMarkers(q.options?.[uaOpt] || "")
      : "Not Attempted";

    const caText = caOpt
      ? cleanKatexMarkers(q.options?.[caOpt] || "")
      : "-";

    const correct =
      uaOpt && caOpt &&
      uaOpt.toUpperCase() === caOpt.toUpperCase();

    return `
      <div class="mb-5 p-3 bg-white rounded-lg border border-gray-100 shadow-sm"> // Reduced mb-6 p-4
        <p class="font-bold text-base mb-1">Q${i + 1}: ${txt}</p> // Reduced text-lg to text-base
        ${reason ? `<p class="text-gray-700 mb-1">${label}: ${reason}</p>` : ""} // Reduced mb-2 to mb-1
        <p class="text-sm"> // Added text-sm
          Your Answer:
          <span class="${correct ? "text-green-600" : "text-red-600"} font-semibold">
            ${uaOpt ? `(${uaOpt}) ${uaText}` : "Not Attempted"}
          </span>
        </p>
        <p class="text-sm"> // Added text-sm
          Correct Answer:
          <span class="text-green-700 font-semibold">
            (${caOpt}) ${caText}
          </span>
        </p>
      </div>`;
  }).join("");

  els.reviewContainer.innerHTML = html;
  showView("results-screen");
}
/* -----------------------------------
   RESULT FEEDBACK DECISION ENGINE
   (Implements Rules 1, 2, 3, 4 logic)
----------------------------------- */
export function getResultFeedback({ score, total, difficulty }) {
  // Rule 1: Score normalization and percentage calculation
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

  let title = "";
  let message = "";
  let showRequestMoreBtn = false; 

  // Rule 2: Difficulty-aware threshold evaluation
  // ================= SIMPLE =================
  if (difficulty === "Simple") {
    if (percentage >= 90) {
      // Rule 3: Progressive encouragement (Simple -> Medium)
      title = "Excellent Work!";
      message =
        "You have mastered the basics. Try Medium difficulty to strengthen your understanding.";
    } else if (percentage >= 60) {
      title = "Good Progress!";
      message =
        "You are doing well. Practice a bit more to improve your accuracy.";
    } else {
      title = "Keep Practicing!";
      message =
        "Focus on understanding the concepts and try again.";
    }
  }

  // ================= MEDIUM =================
  else if (difficulty === "Medium") {
    if (percentage >= 90) {
      // Rule 3: Progressive encouragement (Medium -> Advanced)
      title = "Great Job!";
      message =
        "You are handling Medium questions confidently. Try Advanced to challenge yourself.";
    } else if (percentage >= 60) {
      title = "Nice Effort!";
      message =
        "Review your mistakes and aim for higher accuracy.";
    } else {
      title = "Don't Give Up!";
      message =
        "Revisit the basics and attempt this level again.";
    }
  }

  // ================= ADVANCED =================
  else if (difficulty === "Advanced") {
    if (percentage >= 90) {
      // Rule 3 & 4: Conditional unlock (Advanced >= 90%)
      title = "Outstanding Performance!";
      message =
        "Scoring above 90% in Advanced shows exceptional understanding. You can now request more challenging questions.";
      showRequestMoreBtn = true;
    } else if (percentage >= 60) {
      title = "Strong Attempt!";
      message =
        "You are close to mastery. Review carefully and try again.";
    } else {
      title = "Advanced Is Tough!";
      message =
        "Advanced questions need precision. Practice more and retry.";
    }
  }

  return {
    title,
    message,
    showRequestMoreBtn,
    percentage,
    context: {
      difficulty,
      percentage,
    },
  };
}
/* -----------------------------------
   RESULT FEEDBACK + UNLOCK UI
   (Updated to support Rule 5 Decoupling)
----------------------------------- */
export function showResultFeedback(feedback, requestMoreHandler) {
  initializeElements();

  if (!els.reviewScreen) return;

  // Remove old feedback if present
  let container = document.getElementById("result-feedback-container");
  if (container) container.remove();

  container = document.createElement("div");
  container.id = "result-feedback-container";
  container.className =
    "w-full max-w-3xl mx-auto mt-6 p-5 rounded-lg border border-gray-200 bg-blue-50 text-center";

  const titleEl = document.createElement("h3");
  titleEl.className = "text-xl font-bold text-blue-800 mb-2";
  titleEl.textContent = feedback.title || "";

  const msgEl = document.createElement("p");
  msgEl.className = "text-gray-800 mb-4";
  msgEl.textContent = feedback.message || "";

  container.appendChild(titleEl);
  container.appendChild(msgEl);

  // Rule 4 check
  if (feedback.showRequestMoreBtn) {
    const btn = document.createElement("button");
    btn.id = "request-more-btn";
    btn.className =
      "bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded transition duration-200 mt-2";
    btn.textContent = "Request More Challenging Questions";

    // Rule 5: Attach the event handler passed from the quiz engine
    if (requestMoreHandler) {
      btn.addEventListener("click", () => requestMoreHandler(feedback.context));
    }

    container.appendChild(btn);
  }
  
  // Insert the feedback container above the results section buttons
  const resultsSection = document.getElementById("results-screen");
  if (resultsSection)
    resultsSection.insertBefore(
      container,
      resultsSection.querySelector(".flex") || null
    );
}
