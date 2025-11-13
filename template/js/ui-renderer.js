// js/ui-renderer.js
// -----------------------------------------------------------
// FINAL CLEAN VERSION (PHASE-3)
// Pure UI renderer for quiz-engine.js
// No DB logic, no schema, no switching.
// -----------------------------------------------------------

// -----------------------------------------------------------
// Simple helper: toggle views
// -----------------------------------------------------------
export function showView(viewId) {
  document.getElementById("paywall-screen").style.display = "none";
  document.getElementById("quiz-content").style.display = "none";
  document.getElementById("results-screen").style.display = "none";

  document.getElementById(viewId).style.display = "block";
}

// -----------------------------------------------------------
// Status messages (top blue/red info messages)
// -----------------------------------------------------------
export function showStatus(msg, color = "text-blue-600") {
  const el = document.getElementById("status-message");
  el.innerHTML = msg;
  el.className = `text-center p-6 font-semibold ${color}`;
  el.style.display = "block";
}

export function hideStatus() {
  const el = document.getElementById("status-message");
  el.style.display = "none";
}

// -----------------------------------------------------------
// Update header title + difficulty
// -----------------------------------------------------------
export function updateHeader(topicSlug, difficulty) {
  const chapterName = topicSlug?.replace(/_/g, " ") || "Chapter";

  document.getElementById("chapter-name-display").textContent = chapterName;
  document.getElementById("difficulty-display").textContent =
    `Difficulty: ${difficulty}`;
}

// -----------------------------------------------------------
// After login, show welcome + logout button
// -----------------------------------------------------------
export function updateAuthUI(user) {
  const welcome = document.getElementById("welcome-user");
  const logout = document.getElementById("logout-nav-btn");

  welcome.textContent = `Hi, ${user.displayName}`;
  welcome.style.display = "inline";
  logout.style.display = "inline-block";
}

// -----------------------------------------------------------
// Render a single question
// -----------------------------------------------------------
export function renderQuestion(q, number, selected, isSubmitted) {
  const container = document.getElementById("question-list");
  container.innerHTML = ""; // clear old

  const wrap = document.createElement("div");
  wrap.className = "bg-white p-6 rounded-xl shadow";

  wrap.innerHTML = `
    <p class="text-lg font-semibold mb-4">${number}. ${q.text}</p>

    <div class="space-y-3">
      ${renderOption("A", q, selected, isSubmitted)}
      ${renderOption("B", q, selected, isSubmitted)}
      ${renderOption("C", q, selected, isSubmitted)}
      ${renderOption("D", q, selected, isSubmitted)}
    </div>
  `;

  container.appendChild(wrap);

  // Bind answer clicks
  wrap.querySelectorAll("[data-option]").forEach((btn) => {
    btn.onclick = () => {
      window.__onAnswer(q.id, btn.dataset.option);
    };
  });
}

// -----------------------------------------------------------
// Render each option block
// -----------------------------------------------------------
function renderOption(key, q, selected, isSubmitted) {
  const value = q.options[key] || "";
  const correct = q.correct_answer;

  let classes = "option-label border rounded-lg p-3 cursor-pointer";

  if (isSubmitted) {
    if (key === correct) classes += " correct";
    else if (selected === key) classes += " incorrect";
  } else {
    if (selected === key) classes += " border-blue-500 bg-blue-50";
    else classes += " border-gray-300";
  }

  return `
    <div class="${classes}" data-option="${key}">
      <b>${key}.</b> ${value}
    </div>
  `;
}

// -----------------------------------------------------------
// Next / Prev + Submit button visibility
// -----------------------------------------------------------
export function updateNavigation(index, total, submitted) {
  const prev = document.getElementById("prev-btn");
  const next = document.getElementById("next-btn");
  const submit = document.getElementById("submit-btn");
  const counter = document.getElementById("question-counter");

  counter.textContent = `${index + 1} / ${total}`;

  prev.style.visibility = index === 0 ? "hidden" : "visible";
  next.style.display = submitted ? "none" : "inline-block";
  submit.style.display =
    !submitted && index === total - 1 ? "inline-block" : "none";
}

// -----------------------------------------------------------
// Show results screen
// -----------------------------------------------------------
export function showResults(score, total, quizState) {
  showView("results-screen");

  document.getElementById("score-display").textContent = `${score} / ${total}`;

  const review = document.getElementById("review-container");
  review.innerHTML = quizState.questions
    .map((q, i) => {
      const userAns = quizState.userAnswers[q.id] || "-";
      const correct = q.correct_answer;

      return `
        <div class="bg-white p-4 mb-4 rounded-lg shadow border">
          <p class="font-semibold mb-2">${i + 1}. ${q.text}</p>
          <p><b>Your answer:</b> <span class="${userAns === correct ? 'text-green-600' : 'text-red-600'}">${userAns}</span></p>
          <p><b>Correct answer:</b> <span class="text-green-700">${correct}</span></p>
        </div>
      `;
    })
    .join("");
}

// -----------------------------------------------------------
// Allow quiz-engine to register answer handler
// -----------------------------------------------------------
window.__onAnswer = (id, option) => {};
export function registerAnswerHandler(fn) {
  window.__onAnswer = fn;
}
