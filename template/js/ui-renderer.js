// js/ui-renderer.js
export function showStatus(text) {
  const el = document.getElementById("status");
  if (el) el.innerHTML = text;
}

export function showView(id) {
  document.querySelectorAll(".view").forEach(v => v.style.display = "none");
  const el = document.getElementById(id);
  if (el) el.style.display = "block";
}

export function showAuthLoading(msg) { showStatus(msg); }
export function hideAuthLoading() { showStatus(""); }

export function renderQuiz(questions) {
  const el = document.getElementById("quiz-container");
  el.innerHTML = questions
    .map((q, i) => `
      <div class="question-card">
        <h3>Q${i+1}. ${q.text}</h3>
      </div>
    `)
    .join("");
}
