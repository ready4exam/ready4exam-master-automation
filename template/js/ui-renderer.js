import { cleanKatexMarkers } from './utils.js';

let els = {};
let isInit = false;

/* -----------------------------------
   ASSERTION–REASON LABELS
----------------------------------- */
const AR_LABELS = {
  A: "Both A and R are true and R is the correct explanation of A.",
  B: "Both A and R are true but R is not the correct explanation of A.",
  C: "A is true but R is false.",
  D: "A is false but R is true."
};

/* -----------------------------------
   INITIALIZE DOM ELEMENTS
----------------------------------- */
export function initializeElements() {
  if (isInit) return;

  els = {
    list: document.getElementById("question-list"),
    header: document.getElementById("chapter-name-display"),
    diff: document.getElementById("difficulty-display"),
    status: document.getElementById("status-message"),
    quiz: document.getElementById("quiz-content"),
    results: document.getElementById("results-screen"),
    paywall: document.getElementById("paywall-screen"),
    prev: document.getElementById("prev-btn"),
    next: document.getElementById("next-btn"),
    submit: document.getElementById("submit-btn"),
    counter: document.getElementById("question-counter"),
    scoreBox: document.getElementById("score-display"),
    analysisModal: document.getElementById("analysis-modal"),
    analysisContent: document.getElementById("analysis-content"),
    welcomeUser: document.getElementById("user-welcome")
  };

  if (!document.getElementById("review-container") && els.results) {
    const rc = document.createElement("div");
    rc.id = "review-container";
    rc.className = "w-full max-w-4xl text-left mt-10 hidden space-y-6";
    els.results.appendChild(rc);
    els.reviewContainer = rc;
  }

  isInit = true;
}

/* -----------------------------------
   MOTIVATIONAL FEEDBACK
----------------------------------- */
function getMotivationalFeedback(score, total) {
  const p = (score / total) * 100;
  if (p === 100) return "Perfect Score! You are thinking like a subject expert.";
  if (p >= 80) return "Excellent work! You are very close to mastery.";
  if (p >= 50) return "Good Progress! A little more practice and you'll reach the top.";
  return "Every attempt builds understanding. Keep practicing with focus.";
}

/* -----------------------------------
   OPTION HTML
----------------------------------- */
function generateOptionHtml(q, opt, selected, submitted, labelText) {
  const text = labelText || q.options?.[opt] || "";
  const isSel = selected === opt;
  const isCorrect = submitted && q.correct_answer === opt;
  const isWrong = submitted && isSel && !isCorrect;

  const cls =
    isCorrect ? "border-green-600 bg-green-50" :
    isWrong   ? "border-red-600 bg-red-50" :
    isSel     ? "border-blue-500 bg-blue-50" :
                "border-gray-100 bg-white hover:border-blue-300";

  return `
    <label class="block cursor-pointer">
      <input type="radio" name="q-${q.id}" value="${opt}" class="hidden"
        ${isSel ? "checked" : ""} ${submitted ? "disabled" : ""}>
      <div class="flex items-start p-4 border-2 rounded-xl ${cls}">
        <span class="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 font-bold mr-4">${opt}</span>
        <span class="font-medium">${text}</span>
      </div>
    </label>`;
}

/* -----------------------------------
   QUESTION RENDERER (MOBILE SAFE)
----------------------------------- */
export function renderQuestion(q, idx, selected, submitted) {
  initializeElements();

  // ✅ QUICK WIN #2: cache cleaned text (KaTeX cleanup is expensive)
  if (!q._cleanText) {
    q._cleanText = cleanKatexMarkers(q.text || "");
  }

  // ✅ QUICK WIN #1: defer render by one frame (mobile main-thread protection)
  requestAnimationFrame(() => {
    const type = (q.question_type || "").toLowerCase();

    /* ASSERTION–REASON */
    if (type.includes("ar") || type.includes("assertion")) {
      let A = (q.text || "").replace(/Assertion\s*\(A\)\s*:/ig, "").trim();
      let R = (q.scenario_reason || "").replace(/Reason\s*\(R\)\s*:/ig, "").trim();

      els.list.innerHTML = `
        <div class="space-y-6">
          <div class="text-xl font-extrabold">Q${idx}. Assertion (A): ${A}</div>
          <div class="bg-blue-50 p-6 rounded-2xl border-l-4 border-blue-600">
            <span class="text-xs font-black uppercase">Reason (R)</span>
            <div class="text-lg font-bold">${R}</div>
          </div>
          <div class="italic font-bold">Choose the correct option.</div>
          <div class="grid gap-3">
            ${['A','B','C','D'].map(o =>
              generateOptionHtml(q, o, selected, submitted, AR_LABELS[o])
            ).join("")}
          </div>
        </div>`;
      return;
    }

    /* CASE STUDY */
    if (type.includes("case")) {
      els.list.innerHTML = `
        <div class="grid md:grid-cols-2 gap-8">
          <div>
            <div class="text-xl font-extrabold">Q${idx}: ${q._cleanText}</div>
            <div class="grid gap-3 mt-4">
              ${['A','B','C','D'].map(o =>
                generateOptionHtml(q, o, selected, submitted)
              ).join("")}
            </div>
          </div>
          <div class="bg-yellow-50 p-6 rounded-2xl italic">${q.scenario_reason || ""}</div>
        </div>`;
      return;
    }

    /* MCQ */
    els.list.innerHTML = `
      <div class="space-y-6">
        <div class="text-xl font-extrabold">Q${idx}: ${q._cleanText}</div>
        <div class="grid gap-3">
          ${['A','B','C','D'].map(o =>
            generateOptionHtml(q, o, selected, submitted)
          ).join("")}
        </div>
      </div>`;
  });
}

/* -----------------------------------
   RESULTS + COGNITIVE FEEDBACK
----------------------------------- */
export function renderResults(stats) {
  initializeElements();

  requestAnimationFrame(() => showView("results-screen"));

  const motivation = getMotivationalFeedback(stats.correct, stats.total);

  els.scoreBox.innerHTML = `
    <div class="text-4xl font-black text-slate-900">
      ${stats.correct} / ${stats.total}
    </div>
    <div class="mt-3 px-4 py-3 bg-blue-50 rounded-2xl
                text-sm font-bold text-blue-800
                leading-relaxed text-center">
      ${motivation}
    </div>
  `;
}

/* -----------------------------------
   REVIEW MY MISTAKES
----------------------------------- */
export function renderAllQuestionsForReview(qs, ua) {
  initializeElements();
  if (!els.reviewContainer) return;

  els.reviewContainer.innerHTML = "";
  els.reviewContainer.classList.remove("hidden");

  els.reviewContainer.innerHTML = `
    <div class="mb-10 text-center">
      <h3 class="text-3xl font-black">The Learning Map</h3>
      <p class="italic text-sm">Understanding grows by comparison.</p>
    </div>

    ${qs.map((q, i) => {
      const userAns = ua[q.id];
      const correctAns = q.correct_answer;
      const isCorrect = userAns === correctAns;
      const isAR = q.question_type.toLowerCase().includes("ar");
      const getText = k => isAR ? AR_LABELS[k] : q.options?.[k];

      return `
      <div class="p-6 bg-white rounded-2xl border mb-6 relative">
        <div class="absolute top-0 right-0 px-3 py-1 text-xs font-black text-white ${isCorrect ? "bg-green-500" : "bg-amber-400"}">
          ${isCorrect ? "Mastered" : "Growing"}
        </div>

        <p class="font-bold mb-4">Q${i + 1}. ${q._cleanText || cleanKatexMarkers(q.text)}</p>

        <div class="grid md:grid-cols-2 gap-4">
          <div class="p-3 bg-slate-50 rounded-xl">
            <span class="text-xs font-black">Your Thought</span>
            <p class="text-sm">${userAns ? getText(userAns) : "Skipped"}</p>
          </div>
          <div class="p-3 bg-indigo-50 rounded-xl">
            <span class="text-xs font-black">The Golden Key</span>
            <p class="text-sm">${getText(correctAns)}</p>
          </div>
        </div>
      </div>`;
    }).join("")}
  `;

  els.reviewContainer.scrollIntoView();
}

/* -----------------------------------
   UI HELPERS
----------------------------------- */
export function hideStatus() {
  els.status?.classList.add("hidden");
}

export function updateHeader(title, diff) {
  els.header.textContent = title;
  els.diff.textContent = `Difficulty: ${diff}`;
}

export function showView(view) {
  [els.quiz, els.results, els.paywall].forEach(x => x?.classList.add("hidden"));
  (view === "quiz-content" ? els.quiz :
   view === "results-screen" ? els.results :
   els.paywall)?.classList.remove("hidden");
}

export function showStatus(msg, cls = "") {
  els.status.textContent = msg;
  els.status.className = cls;
  els.status.classList.remove("hidden");
}

export function updateNavigation(i, total, submitted) {
  els.prev?.classList.toggle("hidden", i === 0);
  els.next?.classList.toggle("hidden", i === total - 1);
  els.submit?.classList.toggle("hidden", submitted || i !== total - 1);
  els.counter.textContent = `${i + 1}/${total}`;
}

export function attachAnswerListeners(fn) {
  els.list.onchange = e => {
    if (e.target.type === "radio") {
      fn(e.target.name.slice(2), e.target.value);
    }
  };
}

export function updateAuthUI(user) {
  if (user && els.welcomeUser) {
    els.welcomeUser.textContent = `Welcome, ${user.email.split("@")[0]}`;
    els.welcomeUser.classList.remove("hidden");
  }
}
