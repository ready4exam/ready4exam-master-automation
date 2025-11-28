// js/quiz-engine.js
// Universal version for Class 5–12 automation

import { initializeServices, getAuthUser } from "./config.js";
import { fetchQuestions, saveResult } from "./api.js";
import * as UI from "./ui-renderer.js";
import { checkAccess, initializeAuthListener, signInWithGoogle, signOut } from "./auth-paywall.js";
import curriculumData from "./curriculum.js";

// 📌 Class injected by automation (important fix)
const CLASS_ID = "{{CLASS}}";

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


// ===========================================================
// Smart curriculum match (supports both book/non-book classes)
// ===========================================================
function findCurriculumMatch(topicSlug) {
  const normalize = s => s?.toString().toLowerCase().replace(/quiz/g,"").replace(/[_\s-]/g,"").trim();
  const target = normalize(topicSlug);

  for (const subject in curriculumData) {
    for (const book in curriculumData[subject]) {
      for (const ch of curriculumData[subject][book]) {

        const idMatch = normalize(ch.table_id);
        const titleMatch = normalize(ch.chapter_title);

        if (idMatch === target || titleMatch === target ||
           target.includes(titleMatch) || titleMatch.includes(target)) {
          return { subjectName: subject, chapterTitle: ch.chapter_title };
        }
      }
    }
  }
  return null;
}


// ===========================================================
// URL Parse (now class-safe for 5–12)
// ===========================================================
function parseUrlParameters(){
  const params = new URLSearchParams(location.search);
  quizState.topicSlug = params.get("topic") || "";
  quizState.difficulty = params.get("difficulty") || "simple";

  if(!quizState.topicSlug) throw new Error("Topic not provided in URL");

  const match = findCurriculumMatch(quizState.topicSlug);

  // fallback mode for classes without books (5–10)
  if(!match){
    UI.updateHeader(`Class ${CLASS_ID} – ${quizState.topicSlug.replace(/_/g," ")}`, quizState.difficulty);
    quizState.subject = "General"; 
    return;
  }

  quizState.subject = match.subjectName;
  const chapterName = match.chapterTitle.replace(/quiz/ig,"").trim();
  UI.updateHeader(`Class ${CLASS_ID} – ${quizState.subject} – ${chapterName}`, quizState.difficulty);
}


// ===========================================================
function renderQuestion(){
  const i = quizState.currentQuestionIndex;
  const q = quizState.questions[i];
  if(!q) return UI.showStatus("No questions found");

  UI.renderQuestion(q, i+1, quizState.userAnswers[q.id], quizState.isSubmitted);
  UI.updateNavigation?.(i, quizState.questions.length, quizState.isSubmitted);
  UI.hideStatus();
}


// ===========================================================
function handleNavigation(dir){
  let i = quizState.currentQuestionIndex + dir;
  if(i>=0 && i<quizState.questions.length){
    quizState.currentQuestionIndex=i;
    renderQuestion();
  }
}

function handleAnswerSelection(id,opt){
  if(!quizState.isSubmitted){
    quizState.userAnswers[id]=opt;
    renderQuestion();
  }
}


// ===========================================================
async function handleSubmit(){
  if(quizState.isSubmitted) return;
  quizState.isSubmitted=true;

  quizState.score = quizState.questions.filter(q => 
    quizState.userAnswers[q.id]?.toUpperCase() === q.correct_answer.toUpperCase()
  ).length;

  const result = {
    classId: CLASS_ID,
    subject: quizState.subject,
    topic: quizState.topicSlug,
    difficulty: quizState.difficulty,
    score: quizState.score,
    total: quizState.questions.length,
    answers: quizState.userAnswers
  };

  const user = getAuthUser();
  if(user) try{ await saveResult(result) }catch(e){ console.warn(e) }

  quizState.currentQuestionIndex=0;
  renderQuestion();
  UI.showResults(quizState.score, quizState.questions.length);
  UI.renderAllQuestionsForReview?.(quizState.questions, quizState.userAnswers);
  UI.updateNavigation?.(0, quizState.questions.length,true);
}


// ===========================================================
async function loadQuiz(){
  try{
    UI.showStatus("Fetching questions...");
    const q = await fetchQuestions(quizState.topicSlug, quizState.difficulty);
    quizState.questions=q;
    quizState.userAnswers=Object.fromEntries(q.map(x=>[x.id,null]));
    renderQuestion();
    UI.attachAnswerListeners?.(handleAnswerSelection);
    UI.showView?.("quiz-content");
  }catch(e){
    UI.showStatus("⚠ "+e.message,"text-red-600");
  }
}


// ===========================================================
async function onAuthChange(u){
  if(u){
    if(await checkAccess()) loadQuiz();
    else UI.showView("paywall-screen");
  }else UI.showView("paywall-screen");
}


// ===========================================================
function attachDomEvents(){
  document.addEventListener("click",e=>{
    const b = e.target.closest("button,a"); if(!b) return;

    if(b.id==="prev-btn") return handleNavigation(-1);
    if(b.id==="next-btn") return handleNavigation(1);
    if(b.id==="submit-btn") return handleSubmit();
    if(b.id==="google-signin-btn") return signInWithGoogle();
    if(b.id==="logout-nav-btn") return signOut();
    if(b.id==="back-to-chapters-btn") history.back();
  });
}


// ===========================================================
async function init(){
  UI.initializeElements();
  parseUrlParameters();
  await initializeServices();
  await initializeAuthListener(onAuthChange);
  attachDomEvents();
  UI.hideStatus();
}

document.addEventListener("DOMContentLoaded", init);
