// js/quiz-engine.js
// -----------------------------------------------------------
// Phase-3 Quiz Engine (Auth-Synced Build)
// -----------------------------------------------------------

import { fetchQuiz } from "./api.js";

let state = {
  questions: [],
  answers: {},
  index: 0,
  table: "",
  difficulty: "",
};

// -----------------------------------------------------------
// AUTH READY EVENT → START QUIZ
// -----------------------------------------------------------
document.addEventListener("r4e-auth-ready", () => {
  console.log("[ENGINE] Auth Ready → Loading quiz now…");
  startQuiz(); 
});

// -----------------------------------------------------------
// MAIN QUIZ LOADER (Runs ONLY after sign-in)
// -----------------------------------------------------------
async function startQuiz() {
  console.log("[ENGINE] Starting Quiz Engine…");

  const params = new URLSearchParams(location.search);
  state.table = params.get("table");
  state.difficulty = params.get("difficulty");

  console.log("[ENGINE] Params:", state);

  // FETCH QUIZ FROM SUPABASE
  const questions = await fetchQuiz({
  table: state.table,
  difficulty: state.difficulty
});
state.questions = questions || [];
  console.log("[ENGINE] Loaded Questions:", state.questions.length);

  if (state.questions.length === 0) {
    document.getElementById("question-list").innerHTML =
      `<p class='text-center text-red-600 font-semibold'>
        ⚠️ No questions found for: ${state.table} (${state.difficulty})
      </p>`;
    return;
  }

  renderCurrentQuestion();
}

// -----------------------------------------------------------
// RENDER CURRENT QUESTION
// -----------------------------------------------------------
function renderCurrentQuestion() {
  const q = state.questions[state.index];
  const wrapper = document.getElementById("question-list");
  if (!wrapper || !q) return;

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

  document.getElementById("difficulty-display").textContent =
    `Difficulty: ${state.difficulty}`;

  setupOptionClickHandlers(q.id);

  if (state.index === state.questions.length - 1) {
    document.getElementById("submit-btn").classList.remove("hidden");
  }
}

// -----------------------------------------------------------
// OPTION CLICK HANDLER
// -----------------------------------------------------------
function setupOptionClickHandlers(qid) {
  document.querySelectorAll(".option-label").forEach((lb) => {
    lb.onclick = () => {
      const selected = lb.getAttribute("data-option");
      state.answers[qid] = selected;

      document.querySelectorAll(".option-label").forEach(button => {
        const opt = button.getAttribute("data-option");
        button.classList.toggle("border-blue-600", opt === selected);
        button.classList.toggle("bg-blue-50", opt === selected);
        button.classList.toggle("border-gray-300", opt !== selected);
      });
    };
  });
}

// -----------------------------------------------------------
// NAVIGATION
// -----------------------------------------------------------
document.getElementById("next-btn").onclick = () => {
  if (state.index < state.questions.length - 1) {
    state.index++;
    renderCurrentQuestion();
  }
};

document.getElementById("prev-btn").onclick = () => {
  if (state.index > 0) {
    state.index--;
    renderCurrentQuestion();
  }
};

// -----------------------------------------------------------
// SUBMIT
// -----------------------------------------------------------
document.getElementById("submit-btn").onclick = () => {
  let score = 0;

  state.questions.forEach((q) => {
    if (state.answers[q.id] === q.correct_answer) score++;
  });

  renderResults({
    score,
    total: state.questions.length,
    questions: state.questions,
    answers: state.answers,
  });
};

// -----------------------------------------------------------
// RESULTS
// -----------------------------------------------------------
function renderResults({ score, total, questions, answers }) {
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

  setupResultButtons(state.table);
}

// -----------------------------------------------------------
// RESULTS BUTTON LOGIC
// -----------------------------------------------------------
function setupResultButtons(currentTable) {
  document.getElementById("retry-simple").onclick = () =>
    location.href = `quiz-engine.html?table=${currentTable}&difficulty=simple`;

  document.getElementById("retry-medium").onclick = () =>
    location.href = `quiz-engine.html?table=${currentTable}&difficulty=medium`;

  document.getElementById("retry-advanced").onclick = () =>
    location.href = `quiz-engine.html?table=${currentTable}&difficulty=advanced`;

  document.getElementById("back-to-chapters-btn").onclick = () =>
    location.href = "chapter-selection.html";
}
