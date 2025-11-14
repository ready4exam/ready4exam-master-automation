// js/ui-renderer.js
// ------------------------------------------------------------
// Phase-3 UI Layer (FINAL)
// Handles:
// - Quiz question rendering
// - Option selection highlight
// - Review answers screen
// - Retry buttons + go back
// ------------------------------------------------------------

// ------------------------------------------------------------
// STATUS MESSAGE
// ------------------------------------------------------------
export function showStatus(msg, cls = "") {
  const el = document.getElementById("status-message");
  el.innerHTML = msg;
  el.classList.remove("hidden");
  if (cls) el.className = "text-center p-6 font-semibold " + cls;
}

export function hideStatus() {
  const el = document.getElementById("status-message");
  el.classList.add("hidden");
}

// ------------------------------------------------------------
// QUIZ VISIBILITY
// ------------------------------------------------------------
export function showQuiz() {
  document.getElementById("quiz-content").classList.remove("hidden");
}

// ------------------------------------------------------------
// RENDER A QUESTION
// ------------------------------------------------------------
export function renderQuestion(state) {
  const q = state.questions[state.index];
  const wrapper = document.getElementById("question-list");

  wrapper.innerHTML = `
    <div class="bg-white rounded-lg shadow p-6 border border-gray-200">
      <h3 class="text-lg font-bold mb-4">${q.text}</h3>

      ${["A","B","C","D"].map(opt => `
        <label data-option="${opt}"
          class="option-label block border p-3 rounded mb-2 cursor-pointer">
          <b>${opt}.</b> ${q.options[opt]}
        </label>
      `).join("")}
    </div>
  `;

  // Update counter
  document.getElementById("question-counter").textContent =
    `${state.index + 1} / ${state.questions.length}`;

  // If previously selected, highlight it
  const selected = state.answers[q.id];
  if (selected) highlightSelectedOption(selected);
}

// ------------------------------------------------------------
// HIGHLIGHT SELECTED OPTION
// ------------------------------------------------------------
export function highlightSelectedOption(option) {
  document.querySelectorAll(".option-label").forEach(el => {
    el.classList.remove("bg-blue-100", "border-blue-600");
  });

  const selectedEl = document.querySelector(`[data-option="${option}"]`);
  if (selectedEl) {
    selectedEl.classList.add("bg-blue-100", "border-blue-600");
  }
}

// ------------------------------------------------------------
// SHOW SUBMIT BUTTON
// ------------------------------------------------------------
export function showSubmit() {
  document.getElementById("submit-btn").classList.remove("hidden");
}

// ------------------------------------------------------------
// RESULTS SCREEN
// ------------------------------------------------------------
export function renderResultsScreen(score, total, state) {
  document.getElementById("quiz-content").classList.add("hidden");

  const screen = document.getElementById("results-screen");
  screen.classList.remove("hidden");

  document.getElementById("score-display").textContent = `${score} / ${total}`;

  // REVIEW SECTION
  const review = document.getElementById("review-container");
  review.innerHTML = state.questions
    .map((q) => {
      const userAns = state.answers[q.id] || "-";
      const ok = userAns === q.correct_answer;

      return `
        <div class="bg-white border p-4 rounded mb-4 shadow-sm">
          <p class="font-bold text-gray-800 mb-2">${q.text}</p>

          <p class="text-sm mt-2">
            <span class="font-semibold text-gray-700">Your answer:</span>
            <span class="${ok ? "text-green-700" : "text-red-700"}">
              ${userAns}
            </span>
          </p>

          <p class="text-sm">
            <span class="font-semibold text-gray-700">Correct answer:</span>
            <span class="text-blue-700">${q.correct_answer}</span>
          </p>

          <p class="mt-2 ${ok ? "text-green-600" : "text-red-600"} font-semibold">
            ${ok ? "✔ Correct" : "✘ Incorrect"}
          </p>
        </div>
      `;
    })
    .join("");

  // ------------------------------------------------------------
  // RETRY BUTTONS + GO BACK
  // ------------------------------------------------------------
  review.insertAdjacentHTML(
    "beforeend",
    `
      <div class="mt-8 flex flex-col items-center space-y-4">

        <button onclick="location.href='quiz-engine.html?table=${state.table}&difficulty=simple'"
          class="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700">
          Retry Simple
        </button>

        <button onclick="location.href='quiz-engine.html?table=${state.table}&difficulty=medium'"
          class="px-6 py-3 bg-yellow-500 text-white rounded-lg font-semibold hover:bg-yellow-600">
          Retry Medium
        </button>

        <button onclick="location.href='quiz-engine.html?table=${state.table}&difficulty=advanced'"
          class="px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700">
          Retry Advanced
        </button>

        <button onclick="history.back()"
          class="mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">
          ← Select Another Chapter
        </button>

      </div>
    `
  );
}
