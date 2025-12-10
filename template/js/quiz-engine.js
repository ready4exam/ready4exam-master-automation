// js/quiz-engine.js
// -----------------------------------------------------------------------------
// UNIVERSAL QUIZ ENGINE (Class 5–12)
// - CLASS_ID auto replaced by automation: {{CLASS}}
// - Uses difficulty exactly: "Simple" | "Medium" | "Advanced"
// -----------------------------------------------------------------------------

import { initializeServices, getAuthUser } from "./config.js";
import { fetchQuestions, saveResult } from "./api.js";
import * as UI from "./ui-renderer.js";
import {
  checkAccess, initializeAuthListener,
  signInWithGoogle, signOut
} from "./auth-paywall.js";
import curriculumData from "./curriculum.js";

// 🔥 Injected at automation time — DO NOT HARD CODE
const CLASS_ID = "{{CLASS}}";

// ===========================================================
// STATE
// ===========================================================
let quizState = {
  classId: CLASS_ID,
  subject: "",
  topicSlug: "",
  difficulty: "",
  questions: [],
  currentQuestionIndex: 0,
  userAnswers: {},
  isSubmitted: false,
  score: 0,
};

// ===========================================================
// ⚡ SMART CASE-BASED NORMALIZATION ENGINE
// ===========================================================
function normalizeQuestion(q) {
  const type = (q.question_type || "").toLowerCase();

  let scenario = q.scenario_reason_text || "";
  let question = q.question_text || "";

  // ---------- AUTO CLEAN ----------
  scenario = scenario.replace(/\s+/g, " ").trim();
  question = question.replace(/\s+/g, " ").trim();

  // ===========================================================
  // ⚡ CASE-BASED SMART PARSER
  // ===========================================================
  if (type === "case-based" || type === "case") {
    
    // if Gemini put everything in one field → combine & split cleanly
    let combined = (scenario + "\n" + question).trim();

    // Patterns that usually indicate question part
    const questionStartRegex =
      /(What|Which|When|Why|How|Calculate|Find|Determine|Choose|Select|Based on|Answer).*$/i;

    let extractedScenario = "";
    let extractedQuestion = "";

    const match = combined.match(questionStartRegex);

    if (match) {
      const index = match.index;
      extractedScenario = combined.substring(0, index).trim();
      extractedQuestion = combined.substring(index).trim();
    } else {
      // Fallback: if no clear question detected, assume last sentence is question
      const lastQmark = combined.lastIndexOf("?");
      if (lastQmark !== -1) {
        extractedScenario = combined.substring(0, lastQmark).trim();
        extractedQuestion = combined.substring(lastQmark).trim();
      } else {
        extractedScenario = combined;
        extractedQuestion = "Based on the above scenario, answer this question.";
      }
    }

    scenario = extractedScenario;
    question = extractedQuestion;

    // Remove trailing question marks from scenario
    if (/\?/.test(scenario)) {
      const last = scenario.lastIndexOf("?");
      scenario = scenario.substring(0, last).trim();
    }
  }

  // ===========================================================
  // RETURN IN FORMAT EXPECTED BY ui-renderer.js
  // ===========================================================
  return {
    id: q.id,
    question_type: type,

    // UI expects:
    text: question,
    scenario_reason: scenario,

    options: {
      A: q.option_a || "",
      B: q.option_b || "",
      C: q.option_c || "",
      D: q.option_d || ""
    },

    correct_answer: q.correct_answer_key || "",
    explanation: q.explanation || ""
  };
}

// ===========================================================
// SMART CHAPTER LOOKUP
// ===========================================================
function findCurriculumMatch(topicSlug) {
  const clean = s =>
    s?.toLowerCase().replace(/quiz/g, "").replace(/[_\s-]/g, "").trim();

  const target = clean(topicSlug);

  for (const subject in curriculumData) {
    for (const book in curriculumData[subject]) {
      for (const ch of curriculumData[subject][book]) {
        if (clean(ch.table_id) === target) return { subject, title: ch.chapter_title };
        if (clean(ch.chapter_title) === target) return { subject, title: ch.chapter_title };
      }
    }
  }
  return null;
}

// ===========================================================
// URL + HEADER FORMAT
// ===========================================================
function parseUrlParameters() {
  const params = new URLSearchParams(location.search);

  const urlClass    = params.get("class")   || CLASS_ID;
  const urlSubject  = params.get("subject") || "";
  const urlBook     = params.get("book")    || null;
  const urlChapter  = params.get("chapter") || "";
  const urlTable    = params.get("table")   || params.get("topic") || "";
  let   urlDiff     = params.get("difficulty") || "Simple";

  const allowed = ["Simple","Medium","Advanced"];
  if (!allowed.includes(urlDiff)) urlDiff = "Simple";

  quizState.classId    = urlClass;
  quizState.subject    = urlSubject;
  quizState.topicSlug  = urlTable;
  quizState.difficulty = urlDiff;

  if (!quizState.topicSlug)
    throw new Error("Topic/table not provided in URL");

  if (urlSubject && urlChapter) {
    UI.updateHeader(
      `Class ${quizState.classId}: ${urlSubject} - ${urlChapter} Worksheet`,
      quizState.difficulty
    );
    return;
  }

  const match = findCurriculumMatch(quizState.topicSlug);
  if (!match) {
    quizState.subject = "General";
    const pretty = quizState.topicSlug
      .replace(/_/g, " ").replace(/quiz/ig, "").replace(/[0-9]/g, "")
      .trim().replace(/\b\w/g, c => c.toUpperCase());

    UI.updateHeader(
      `Class ${quizState.classId}: ${pretty} Worksheet`,
      quizState.difficulty
    );
    return;
  }

  quizState.subject = match.subject;
  const chapter = match.title.replace(/quiz/ig, "").trim();

  UI.updateHeader(
    `Class ${quizState.classId}: ${quizState.subject} - ${chapter} Worksheet`,
    quizState.difficulty
  );
}

// ===========================================================
// RENDER QUESTION
// ===========================================================
function renderQuestion() {
  const i = quizState.currentQuestionIndex;
  const q = quizState.questions[i];
  if (!q) return UI.showStatus("No question to display.");

  UI.renderQuestion(
    q,
    i + 1,
    quizState.userAnswers[q.id],
    quizState.isSubmitted
  );

  UI.updateNavigation?.(i, quizState.questions.length, quizState.isSubmitted);
  UI.hideStatus();
}

// ===========================================================
// NAVIGATION + ANSWERS
// ===========================================================
function handleNavigation(delta) {
  const i = quizState.currentQuestionIndex + delta;
  if (i >= 0 && i < quizState.questions.length) {
    quizState.currentQuestionIndex = i;
    renderQuestion();
  }
}

function handleAnswerSelection(id, opt) {
  if (!quizState.isSubmitted) {
    quizState.userAnswers[id] = opt;
    renderQuestion();
  }
}

// ===========================================================
// SUBMIT
// ===========================================================
async function handleSubmit() {
  if (quizState.isSubmitted) return;

  quizState.isSubmitted = true;

  quizState.score = quizState.questions.filter(
    q => quizState.userAnswers[q.id]?.toUpperCase() === q.correct_answer?.toUpperCase()
  ).length;

  const user = getAuthUser();

  if (user) {
    try {
      await saveResult({
        classId: quizState.classId,
        subject: quizState.subject,
        topic: quizState.topicSlug,
        difficulty: quizState.difficulty,
        score: quizState.score,
        total: quizState.questions.length,
        user_answers: quizState.userAnswers,
      });
    } catch {}
  }

  quizState.currentQuestionIndex = 0;

  renderQuestion();
  UI.showResults(quizState.score, quizState.questions.length);
  UI.renderAllQuestionsForReview?.(quizState.questions, quizState.userAnswers);
  UI.updateNavigation?.(0, quizState.questions.length, true);
}

// ===========================================================
// LOAD QUIZ
// ===========================================================
async function loadQuiz() {
  try {
    UI.showStatus("Fetching questions...");

    const raw = await fetchQuestions(quizState.topicSlug, quizState.difficulty);
    if (!raw?.length) throw new Error("No questions found.");

    quizState.questions = raw.map(normalizeQuestion);
    quizState.userAnswers = Object.fromEntries(
      quizState.questions.map(q => [q.id, null])
    );

    renderQuestion();
    UI.attachAnswerListeners?.(handleAnswerSelection);
    UI.showView?.("quiz-content");

  } catch (e) {
    UI.showStatus(`Error: ${e.message}`, "text-red-600");
  }
}

// ===========================================================
// AUTH LISTENER
// ===========================================================
async function onAuthChange(user) {
  const ok = user && await checkAccess(quizState.topicSlug);
  ok ? loadQuiz() : UI.showView("paywall-screen");
}

// ===========================================================
// INIT
// ==
