import { cleanKatexMarkers } from './utils.js';

let els = {};
let isInit = false;

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
        curiosityBox: document.getElementById("curiosity-box"),
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
   OPTION HTML GENERATOR
----------------------------------- */
function generateOptionHtml(q, opt, selected, submitted, labelText) {
    const text = labelText || q.options[opt] || "";
    const isSel = selected === opt;
    const isCorrect = submitted && q.correct_answer === opt;
    const isWrong = submitted && isSel && !isCorrect;

    const borderCls =
        isCorrect ? "border-green-600 bg-green-50 shadow-green-100" :
        isWrong ? "border-red-600 bg-red-50 shadow-red-100" :
        selected === opt ? "border-blue-500 bg-blue-50 shadow-blue-100" :
        "border-gray-100 bg-white hover:border-blue-300";

    return `
        <label class="block cursor-pointer group">
            <input type="radio" name="q-${q.id}" value="${opt}" class="hidden" ${isSel ? "checked" : ""} ${submitted ? "disabled" : ""}>
            <div class="flex items-start p-4 border-2 rounded-xl transition-all ${borderCls}">
                <span class="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg bg-gray-100 text-gray-700 font-bold mr-4 group-hover:bg-blue-100">${opt}</span>
                <span class="font-medium pt-1 text-gray-800 leading-snug">${cleanKatexMarkers(text)}</span>
            </div>
        </label>`;
}

/* -----------------------------------
   MAIN QUESTION RENDERER
----------------------------------- */
export function renderQuestion(q, idx, selected, submitted) {
    initializeElements();
    if (!els.list) return;

    const type = (q.question_type || "").toLowerCase();

    /* ===================================================
       ASSERTION–REASON (INTEGRATED AS REQUESTED)
    =================================================== */
    if (type.includes("ar") || type.includes("assertion")) {
        els.list.innerHTML = `
            <div class="space-y-6 text-left animate-fadeIn">
                <div class="text-xl font-extrabold text-gray-900 leading-snug">
                    Q${idx}. Assertion (A): ${q.text}
                </div>
                
                <div class="bg-blue-50 p-6 rounded-2xl border-l-4 border-blue-600 shadow-sm">
                    <span class="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-2 block">Reason (R)</span>
                    <div class="text-lg font-bold text-gray-800">${q.scenario_reason}</div>
                </div>

                <div class="text-sm font-black text-gray-900 italic px-2">
                    Regarding the assertion and reason, choose the correct option.
                </div>
                
                <div class="grid gap-3">
                    ${['A','B','C','D']
                        .map(o => generateOptionHtml(q, o, selected, submitted, AR_LABELS[o]))
                        .join("")}
                </div>
            </div>`;
        return;
    }

    /* -----------------------------------
       CASE STUDY
    ----------------------------------- */
    if (type.includes("case")) {
        els.list.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8 text-left animate-fadeIn">
                <div class="flex flex-col space-y-6 order-first md:order-1">
                    <div class="text-xl font-extrabold text-gray-900 leading-snug">
                        Q${idx}: ${q.text}
                    </div>

                    <div class="p-6 bg-yellow-50 rounded-2xl border border-yellow-100 shadow-inner block md:hidden">
                        <h3 class="font-black mb-3 text-yellow-700 uppercase text-[10px] tracking-widest border-b border-yellow-200 pb-2">
                            💡 Study Hint
                        </h3>
                        <p class="text-yellow-900 leading-relaxed font-medium italic break-words">
                            ${q.scenario_reason}
                        </p>
                    </div>

                    <div class="grid gap-3">
                        ${['A','B','C','D']
                            .map(o => generateOptionHtml(q, o, selected, submitted))
                            .join("")}
                    </div>
                </div>

                <div class="hidden md:block p-6 bg-yellow-50 rounded-2xl border border-yellow-100 shadow-inner h-fit order-2">
                    <h3 class="font-black mb-3 text-yellow-700 uppercase text-xs tracking-widest border-b border-yellow-200 pb-2">
                        💡 Study Hint
                    </h3>
                    <p class="text-yellow-900 leading-relaxed font-medium italic break-words">
                        ${q.scenario_reason}
                    </p>
                </div>
            </div>`;
        return;
    }

    /* -----------------------------------
       STANDARD MCQ
    ----------------------------------- */
    els.list.innerHTML = `
        <div class="max-w-3xl mx-auto space-y-6 text-left animate-fadeIn">
            <div class="text-xl font-extrabold text-gray-900 leading-snug">
                Q${idx}: ${cleanKatexMarkers(q.text)}
            </div>
            <div class="grid gap-3">
                ${['A','B','C','D']
                    .map(o => generateOptionHtml(q, o, selected, submitted))
                    .join("")}
            </div>
        </div>`;
}

/* -----------------------------------
   REMAINING FUNCTIONS (UNCHANGED)
----------------------------------- */
export function hideStatus() { initializeElements(); if (els.status) els.status.classList.add("hidden"); }
export function updateHeader(t, d) { initializeElements(); if (els.header) els.header.textContent = t; if (els.diff) els.diff.textContent = `Difficulty: ${d}`; }
export function showView(v) { initializeElements(); [els.quiz, els.results, els.paywall].forEach(x => x?.classList.add("hidden")); if (v === "quiz-content") els.quiz?.classList.remove("hidden"); if (v === "results-screen") els.results?.classList.remove("hidden"); if (v === "paywall-screen") els.paywall?.classList.remove("hidden"); }
export function showStatus(msg, cls = "text-blue-600") { initializeElements(); if (els.status) { els.status.textContent = msg; els.status.className = `p-4 font-bold ${cls}`; els.status.classList.remove("hidden"); } }
export function updateNavigation(i, t, s) { initializeElements(); els.prev?.classList.toggle("hidden", i === 0); els.next?.classList.toggle("hidden", i === t - 1); els.submit?.classList.toggle("hidden", s || i !== t - 1); if (els.counter) els.counter.textContent = `${String(i + 1).padStart(2, "0")} / ${t}`; }
export function attachAnswerListeners(fn) { initializeElements(); if (els.list) { els.list.onchange = e => { if (e.target.type === "radio") fn(e.target.name.substring(2), e.target.value); }; } }
export function updateAuthUI(user) { initializeElements(); if (els.welcomeUser && user) { els.welcomeUser.textContent = `Welcome, ${user.email.split('@')[0]}`; els.welcomeUser.classList.remove("hidden"); } }
