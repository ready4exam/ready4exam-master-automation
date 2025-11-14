// js/ui-renderer.js
// ------------------------------------------------------------
// Phase-3 UI Rendering Layer (Final Synced Version)
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
// HIGHLIGHT SELECTED OPTION (Added to fix errors)
// ------------------------------------------------------------
export function highlightSelectedOption(qid, selectedOpt) {
  const labels = document.querySelectorAll(".option-label");

  labels.forEach(lb => {
    const opt = lb.getAttribute("data-option");

    if (opt === selectedOpt) {
      lb.classList.remove("border-gray-300");
      lb.classList.add("border-blue-600", "bg-blue-50");
    } else {
      lb.classList.remove("border-blue-600", "bg-blue-50");
      lb.classList.add("border-gray-300");
    }
  });
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
  document.getElementById("quiz-content").classList.add("hidden");

  const screen = document.getElementById("results-screen");
  screen.classList.remove("hidden");

  document.getElementById("score-display").textContent = `${score} / ${total}`;

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

  document.getElementById("results-actions").classList.remove("hidden");
}


// ------------------------------------------------------------
// BUTTON HANDLERS FOR RETRY
// ------------------------------------------------------------
export function registerResultButtons(currentTable) {
  document.getElementById("retry-simple").onclick = () =>
    location.href = `quiz-engine.html?table=${currentTable}&difficulty=simple`;

  document.getElementById("retry-medium").onclick = () =>
    location.href = `quiz-engine.html?table=${currentTable}&difficulty=medium`;

  document.getElementById("retry-advanced").onclick = () =>
    location.href = `quiz-engine.html?table=${currentTable}&difficulty=advanced`;

  document.getElementById("back-to-chapters-btn").onclick = () =>
    location.href = "chapter-selection.html";
}
