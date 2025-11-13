// js/ui-renderer.js
// -----------------------------------------------------------------------------
// Handles all DOM rendering for Quiz Engine
// Clean Phase-3 version — compatible with new quiz-engine.js
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Show status
// -----------------------------------------------------------------------------
export function showStatus(msg, cls = "text-blue-700") {
  const el = document.getElementById("status-message");
  el.innerHTML = msg;
  el.className = `${cls} text-center p-6 font-semibold`;
  el.style.display = "block";
}

export function hideStatus() {
  const el = document.getElementById("status-message");
  el.style.display = "none";
}

// -----------------------------------------------------------------------------
// View handling
// -----------------------------------------------------------------------------
export function showView(id) {
  ["paywall-screen", "quiz-content", "results-screen"].forEach((v) => {
    document.getElementById(v).style.display = v === id ? "block" : "none";
  });
}

// -----------------------------------------------------------------------------
// Header Update
// -----------------------------------------------------------------------------
export function updateHeader(topicReadable, difficulty) {
  document.getElementById("chapter-name-display").textContent = topicReadable;
  document.getElementById("difficulty-display").textContent =
    `Difficulty: ${difficulty[0].toUpperCase() + difficulty.slice(1)}`;
}

// -----------------------------------------------------------------------------
// Render Single Question
// -----------------------------------------------------------------------------
export function renderQuestion(question, count, selectedAnswer, isSubmitted) {
  const container = document.getElementById("question-list");
  container.innerHTML = "";

  const qBox = document.createElement("div");
  qBox.className =
    "bg-white p-6 rounded-lg shadow border border-gray-200 space-y-4";

  // Question text
  qBox.innerHTML = `
      <div class="text-lg font-semibold text-gray-800 leading-relaxed">
        ${count}. ${question.text}
      </div>
    `;

  // Options
  const opts = document.createElement("div");
  opts.className = "space-y-2";

  Object.entries(question.options).forEach(([key, val]) => {
    const isCorrect = key === question.correct_answer;
    const isSelected = selectedAnswer === key;

    let cls =
      "option-label block border p-3 rounded-lg cursor-pointer bg-white";
    if (isSubmitted) {
      if (isCorrect) cls += " correct";
      else if (isSelected && !isCorrect) cls += " incorrect";
    } else if (isSelected) {
      cls += " border-blue-500 bg-blue-50";
    } else {
      cls += " border-gray-300";
    }

    const label = document.createElement("label");
    label.className = cls;

    label.innerHTML = `
        <input type="radio" name="q${question.id}" value="${key}" class="hidden" />
        <span class="font-semibold mr-2">${key}.</span> ${val}
      `;

    // Clicking option
    label.onclick = () => {
      if (!isSubmitted) {
        const evt = new CustomEvent("optionSelected", {
          detail: { qid: question.id, ans: key },
        });
        window.dispatchEvent(evt);
      }
    };

    opts.appendChild(label);
  });

  qBox.appendChild(opts);
  container.appendChild(qBox);
}

// -----------------------------------------------------------------------------
// Update Navigation UI
// -----------------------------------------------------------------------------
export function updateNavigation(index, total, submitted) {
  document.getElementById("prev-btn").disabled = index === 0;
  document.getElementById("next-btn").disabled = index === total - 1;
  document.getElementById("submit-btn").style.display =
    index === total - 1 && !submitted ? "inline-block" : "none";

  document.getElementById("question-counter").textContent = `${index + 1} / ${total}`;
}

// -----------------------------------------------------------------------------
// Results Screen
// -----------------------------------------------------------------------------
export function showResults(score, total, quizState) {
  showView("results-screen");

  const pct = Math.round((score / total) * 100);
  document.getElementById("score-display").textContent = `${score} / ${total}`;

  const reviewBox = document.getElementById("review-container");
  reviewBox.innerHTML = "";

  quizState.questions.forEach((q, idx) => {
    const ua = quizState.userAnswers[q.id];
    const correct = ua && ua.toUpperCase() === q.correct_answer.toUpperCase();

    const row = document.createElement("div");
    row.className =
      "p-4 mb-3 bg-white shadow rounded border border-gray-200 space-y-1";

    row.innerHTML = `
        <div class="font-semibold text-gray-800">${idx + 1}. ${q.text}</div>
        <div class="text-sm">Your answer: 
          <b class="${correct ? "text-green-600" : "text-red-600"}">
            ${ua || "--"}
          </b>
        </div>
        <div class="text-sm">Correct answer: 
          <b class="text-green-600">${q.correct_answer}</b>
        </div>
      `;

    reviewBox.appendChild(row);
  });
}

// -----------------------------------------------------------------------------
// Auth UI
// -----------------------------------------------------------------------------
export function updateAuthUI(user) {
  const welcome = document.getElementById("welcome-user");
  const logout = document.getElementById("logout-nav-btn");

  if (user) {
    welcome.textContent = `Hi, ${user.email}`;
    welcome.style.display = "inline";
    logout.style.display = "inline-block";
  } else {
    welcome.style.display = "none";
    logout.style.display = "none";
  }
}
