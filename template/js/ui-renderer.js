// js/ui-renderer.js
// ------------------------------------------------------------
// Phase-3 UI Rendering Layer (Final)
// Supports:
// • Option selection highlight
// • Full results screen
// • Retry buttons (Simple / Medium / Advanced)
// • Back to chapter selection
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
  const el = document.getElementById("status-message");
  el.classList.add("hidden");
}


// ------------------------------------------------------------
// SHOW QUIZ CONTENT
// ------------------------------------------------------------
export function showQuiz() {
  document.getElementById("quiz-content").classList.remove("hidden");
}


// ------------------------------------------------------------
// RENDER QUESTION
// ------------------------------------------------------------
export function renderQuestion(state) {
  const q = state.questions[state.index];
  const wrapper = document.getElementById("question-list");

  if (!wrapper) return;

  wrapper.innerHTML = `
    <div class="bg-white rounded-lg shadow p-6 border border-gray-200">
      <h3 class="text-lg font-bold mb-4">${q.text}</h3>

      ${["A","B","C","D"].map(opt => `
        <label data-option="${opt}"
          class="option-label block border p-3 rounded mb-2 cursor-pointer 
          ${state.answers[q.id] === opt ? "border-blue-600 bg-blue-50" : "border-gray-300"}">
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
// RESULTS SCREEN
// ------------------------------------------------------------
export function renderResultsScreen({ score, total, questions, answers }) {
  // Hide quiz
  document.getElementById("quiz-content").classList.add("hidden");

  // Show results
  const screen = document.getElementById("results-screen");
  screen.classList.remove("hidden");

  // Score
  const scoreBox = document.getElementById("score-display");
  scoreBox.textContent = `${score} / ${total}`;

  // Review
  const review = document.getElementById("review-container");

  review.innerHTML = questions
    .map(q => {
      const userAns = answers[q.id] || "-";
      const isCorrect = userAns === q.correct_answer;

      return `
        <div class="bg-white border p-4 rounded mb-4">
          <p class="font-bold mb-2">${q.text}</p>

          <p><span class="font-semibold">Your Answer:</span> 
            <span class="${isCorrect ? "text-green-600" : "text-red-600"}">
              ${userAns}
            </span>
          </p>

          <p><span class="font-semibold">Correct Answer:</span> 
            <span class="text-green-700">${q.correct_answer}</span>
          </p>

          <p class="mt-2 ${isCorrect ? "text-green-600" : "text-red-600"} font-semibold">
            ${isCorrect ? "✔ Correct" : "✘ Incorrect"}
          </p>
        </div>
      `;
    })
    .join("");

  // Show retry buttons
  document.getElementById("results-actions").classList.remove("hidden");
}


// ------------------------------------------------------------
// BUTTON HANDLERS
// ------------------------------------------------------------
export function registerResultButtons(currentTable) {
  const retrySimple = document.getElementById("retry-simple");
  const retryMedium = document.getElementById("retry-medium");
  const retryAdvanced = document.getElementById("retry-advanced");
  const backBtn = document.getElementById("back-to-chapters-btn");

  // Retry → Simple
  retrySimple.onclick = () => {
    location.href = `quiz-engine.html?table=${currentTable}&difficulty=simple`;
  };

  // Retry → Medium
  retryMedium.onclick = () => {
    location.href = `quiz-engine.html?table=${currentTable}&difficulty=medium`;
  };

  // Retry → Advanced
  retryAdvanced.onclick = () => {
    location.href = `quiz-engine.html?table=${currentTable}&difficulty=advanced`;
  };

  // Back to chapter selection
  backBtn.onclick = () => {
    location.href = "chapter-selection.html";
  };
}
