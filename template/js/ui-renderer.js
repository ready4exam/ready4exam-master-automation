// js/ui-renderer.js
// ------------------------------------------------------------
// Phase-3 UI Rendering Layer (Results + Automatic Review)
// ------------------------------------------------------------

/*
Functions exported:
- showStatus(msg, cls)
- hideStatus()
- showQuiz()
- renderQuestion(state)
- showSubmit()
- showResults(score, total, state)
*/

export function showStatus(msg, cls = "") {
  const el = document.getElementById("status-message");
  if (!el) return;
  el.innerHTML = msg;
  el.classList.remove("hidden");
  el.className = cls ? "text-center p-6 font-semibold " + cls : "text-center p-6 font-semibold";
}

export function hideStatus() {
  const el = document.getElementById("status-message");
  if (!el) return;
  el.classList.add("hidden");
}

// Reveal main quiz area
export function showQuiz() {
  const q = document.getElementById("quiz-content");
  if (q) q.classList.remove("hidden");
}

// Render a single question based on state
export function renderQuestion(state) {
  const q = state.questions[state.index];
  const wrapper = document.getElementById("question-list");
  if (!q || !wrapper) return;

  const userAns = state.answers[q.id] || null;

  let scenarioBlock = "";
  if (q.question_type === "AR" || q.question_type === "Case-Based") {
    scenarioBlock = `
      <div class="bg-blue-50 border border-blue-200 p-4 rounded mb-4">
        <p class="text-sm font-medium text-blue-800">${q.question_type === "AR" ? "Reason (R):" : "Context:"}</p>
        <p class="text-sm text-blue-900 mt-1">${q.scenario_reason || ""}</p>
      </div>
    `;
  }

  const optionsHtml = ["A","B","C","D"].map(opt => {
    const isSelected = userAns === opt;
    const selClass = isSelected ? "bg-blue-100 border-blue-600" : "border-gray-300";
    const optText = q.options?.[opt] ?? "";
    return `
      <label data-option="${opt}"
             class="option-label block border ${selClass} p-3 rounded mb-2 cursor-pointer transition"
             role="button" aria-pressed="${isSelected}">
        <b>${opt}.</b> ${optText}
      </label>
    `;
  }).join("");

  wrapper.innerHTML = `
    <div class="bg-white rounded-lg shadow p-6 border border-gray-200">
      <h3 class="text-lg font-bold mb-4">${q.text}</h3>
      ${scenarioBlock}
      ${optionsHtml}
    </div>
  `;

  const counter = document.getElementById("question-counter");
  if (counter) counter.textContent = `${state.index + 1} / ${state.questions.length}`;
}

// Show submit button (when last question reached)
export function showSubmit() {
  const btn = document.getElementById("submit-btn");
  if (btn) btn.classList.remove("hidden");
}

// Show results + automatic review list (same page)
export function showResults(score, total, state) {
  // Hide quiz UI
  const quizContent = document.getElementById("quiz-content");
  if (quizContent) quizContent.classList.add("hidden");

  // Status hide
  hideStatus();

  // Prepare results screen container
  const results = document.getElementById("results-screen");
  if (!results) {
    console.error("results-screen element missing");
    return;
  }
  results.classList.remove("hidden");

  // Score header
  const scoreHtml = `
    <div class="bg-white p-6 rounded-lg shadow mb-6 text-center">
      <h2 class="text-3xl font-extrabold text-green-700 mb-2">Quiz Completed</h2>
      <p class="text-xl font-semibold">Score: <span id="score-display">${score}</span> / ${total}</p>
      <p class="text-sm text-gray-600 mt-2">Difficulty: ${state.difficulty}</p>
    </div>
  `;

  // Difficulty buttons (always show all 3)
  const diffButtons = `
    <div class="flex gap-3 justify-center mb-6">
      <button id="btn-simple" class="px-4 py-2 rounded-lg bg-green-600 text-white font-semibold">Retake Simple</button>
      <button id="btn-medium" class="px-4 py-2 rounded-lg bg-yellow-500 text-white font-semibold">Try Medium</button>
      <button id="btn-advanced" class="px-4 py-2 rounded-lg bg-red-600 text-white font-semibold">Try Advanced</button>
    </div>
  `;

  // Choose another chapter button
  const chapterBtn = `
    <div class="text-center mb-8">
      <button id="btn-another-chapter" class="px-6 py-3 bg-gray-700 text-white rounded-lg font-bold">↩ Choose Another Chapter</button>
    </div>
  `;

  // Review list: each question with user's answer and correct answer
  const reviewList = state.questions.map(q => {
    const userAns = (state.answers[q.id] || "-").toString().toUpperCase();
    const correct = ( (q.correct_answer || q.correct_answer_key) || "" ).toString().trim().toUpperCase();
    const ok = userAns === correct && userAns !== "-";
    const options = q.options || {};
    return `
      <div class="bg-white border p-4 rounded mb-3">
        <p class="font-bold mb-2">${q.text}</p>
        ${ q.scenario_reason ? `<p class="text-sm text-blue-700 mb-2">${q.scenario_reason}</p>` : "" }
        <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
          ${["A","B","C","D"].map(opt => {
            const isUser = userAns === opt;
            const isCorrect = correct === opt;
            const cls = isCorrect ? "border-green-600 bg-green-50" : (isUser ? "border-blue-600 bg-blue-50" : "border-gray-200");
            return `<div class="p-2 border ${cls} rounded text-sm"><b>${opt}.</b> ${options[opt] || ""}</div>`;
          }).join("")}
        </div>

        <p class="mt-3">
          <span class="${ok ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}">
            ${ok ? "✔ Correct" : "✘ Incorrect"}
          </span>
          <span class="ml-3 text-sm text-gray-600">Your answer: ${userAns} • Correct: ${correct || "N/A"}</span>
        </p>
      </div>
    `;
  }).join("");

  results.innerHTML = `
    <div class="max-w-4xl mx-auto">
      ${scoreHtml}
      ${diffButtons}
      ${chapterBtn}
      <h3 class="text-2xl font-bold mb-4">Review Answers</h3>
      ${reviewList}
    </div>
  `;

  // Attach handlers for the buttons (quiz-engine will register behavior via events)
}
