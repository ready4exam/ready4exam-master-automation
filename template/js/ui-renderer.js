// js/ui-renderer.js
// ------------------------------------------------------------
// Phase-3 UI Rendering Layer (Clean + Option Highlight)
// ------------------------------------------------------------

// ------------------------------------------------------------
// STATUS
// ------------------------------------------------------------
export function showStatus(msg, cls = "") {
  const el = document.getElementById("status-message");
  el.innerHTML = msg;
  el.classList.remove("hidden");
  if (cls) el.className = "text-center p-6 font-semibold " + cls;
}

export function hideStatus() {
  document.getElementById("status-message").classList.add("hidden");
}

// ------------------------------------------------------------
// SHOW QUIZ
// ------------------------------------------------------------
export function showQuiz() {
  document.getElementById("quiz-content").classList.remove("hidden");
}

// ------------------------------------------------------------
// RENDER QUESTION (MCQ / AR / CASE-BASED)
// ------------------------------------------------------------
export function renderQuestion(state) {
  const q = state.questions[state.index];
  const wrapper = document.getElementById("question-list");

  const userAns = state.answers[q.id] || null;

  let scenarioBlock = "";
  if (q.question_type === "AR" || q.question_type === "Case-Based") {
    scenarioBlock = `
      <div class="bg-blue-50 border border-blue-200 p-4 rounded mb-4">
        <p class="text-sm text-blue-800 font-medium">
          ${q.question_type === "AR" ? "Reason (R):" : "Context:"}
        </p>
        <p class="text-sm text-blue-900 mt-1">
          ${q.scenario_reason}
        </p>
      </div>
    `;
  }

  wrapper.innerHTML = `
    <div class="bg-white rounded-lg shadow p-6 border border-gray-200">
      <h3 class="text-lg font-bold mb-4">${q.text}</h3>
      ${scenarioBlock}

      ${["A","B","C","D"].map(opt => `
        <label data-option="${opt}"
          class="option-label block border p-3 rounded mb-2 cursor-pointer
            ${userAns === opt ? "bg-blue-100 border-blue-600" : "border-gray-300"}">
          <b>${opt}.</b> ${q.options[opt]}
        </label>
      `).join("")}
    </div>
  `;

  document.getElementById("question-counter").textContent =
    `${state.index + 1} / ${state.questions.length}`;
}

// ------------------------------------------------------------
// SHOW SUBMIT BUTTON
// ------------------------------------------------------------
export function showSubmit() {
  document.getElementById("submit-btn").classList.remove("hidden");
}

// ------------------------------------------------------------
// SHOW RESULTS + REVIEW PAGE
// ------------------------------------------------------------
export function showResults(score, total, state) {
  document.getElementById("quiz-content").classList.add("hidden");

  const screen = document.getElementById("results-screen");
  screen.classList.remove("hidden");

  document.getElementById("score-display").textContent = `${score} / ${total}`;

  const review = document.getElementById("review-container");

  review.innerHTML = state.questions
    .map(q => {
      const userAns = state.answers[q.id] || "-";
      const ok = userAns === q.correct_answer;

      return `
        <div class="bg-white border p-4 rounded mb-3">
          <p class="font-bold">${q.text}</p>

          ${
            q.scenario_reason
              ? `<p class="text-sm text-blue-700 mt-2">${q.scenario_reason}</p>`
              : ""
          }

          <p class="mt-2">
            <span class="font-semibold">Your answer:</span>
            ${userAns}
          </p>

          <p class="text-green-700 font-semibold">
            Correct: ${q.correct_answer}
          </p>

          <p class="mt-2 ${ok ? "text-green-600" : "text-red-600"}">
            ${ok ? "✔ Correct" : "✘ Incorrect"}
          </p>
        </div>
      `;
    })
    .join("");
}
