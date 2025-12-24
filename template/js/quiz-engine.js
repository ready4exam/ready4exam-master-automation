// template/js/quiz-engine.js
import { initializeServices, getInitializedClients } from "./config.js"; 
import { fetchQuestions, saveResult } from "./api.js";
import * as UI from "./ui-renderer.js";
import { initializeAuthListener, requireAuth } from "./auth-paywall.js";
// FIX 1: Removed checkClassAccess from imports (since we define it below)
import { showExpiredPopup } from "./firebase-expiry.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/* -----------------------------------
    STRICT GATEKEEPER FUNCTION
----------------------------------- */
export async function checkClassAccess(classId, subject) {
    try {
        // FIX 2: Get initialized instances safely
        const { auth, db } = getInitializedClients(); 
        
        const user = auth.currentUser;
        if (!user) return { allowed: false, reason: "no_user" };

        // 1. Force Fetch Latest Data (Bypasses Cache)
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
            return { allowed: false, reason: "no_record" };
        }

        const data = snap.data();
        
        // 2. Admin Bypass
        const ADMIN_EMAILS = ["keshav.karn@gmail.com", "ready4urexam@gmail.com"];
        if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
            return { allowed: true };
        }

        // 3. Check Locked Classes
        const paidClasses = data.paidClasses || {};
        const isClassActive = paidClasses[classId.toString()] === true; 

        // CHECK: Is the student already locked to ANY OTHER class?
        const lockedClasses = Object.keys(paidClasses).filter(key => paidClasses[key] === true);
        const isLockedToSomething = lockedClasses.length > 0;

        if (isClassActive) {
            // SCENARIO A: They own this class. ALLOW.
            return { allowed: true };
        } 
        else if (isLockedToSomething) {
            // SCENARIO B: They own a DIFFERENT class. BLOCK.
            console.log(`User is locked to Class ${lockedClasses[0]}, but requested Class ${classId}`);
            return { allowed: false, reason: "exclusive_member" };
        } 
        else {
            // SCENARIO C: New Student. AUTO-LOCK.
            try {
                await updateDoc(userRef, {
                    [`paidClasses.${classId}`]: true
                });
                console.log(`Auto-locked user to Class ${classId}`);
                return { allowed: true };
            } catch (err) {
                console.error("Auto-lock failed:", err);
                return { allowed: false, reason: "write_error" };
            }
        }

    } catch (error) {
        console.error("Access Check Failed:", error);
        return { allowed: false, reason: "error" };
    }
}

let quizState = {
    classId: "",
    subject: "",
    topicSlug: "",
    difficulty: "",
    questions: [],
    currentQuestionIndex: 0,
    userAnswers: {},
    isSubmitted: false
};

// Global promise to hold question data while Auth is processing
let questionsPromise = null;

/* -----------------------------------
    PARSE URL PARAMETERS (Fully Dynamic)
----------------------------------- */
function parseUrlParameters() {
    const params = new URLSearchParams(location.search);
    quizState.topicSlug = params.get("table") || params.get("topic") || "";
    quizState.difficulty = params.get("difficulty") || "Simple";
    quizState.classId = params.get("class") || "11";
    quizState.subject = params.get("subject") || "Physics";

    // 1. Dynamic Cleanup
    let cleanChapter = quizState.topicSlug
        .replace(/[_\d]/g, " ")
        .replace(/quiz/ig, "")
        .trim();

    // 2. Dynamic Subject Stripping
    const subjectRegex = new RegExp(`^${quizState.subject}\\s*`, "i");
    cleanChapter = cleanChapter.replace(subjectRegex, "").trim();

    // 3. Dynamic Title Casing
    cleanChapter = cleanChapter.replace(/\b\w/g, c => c.toUpperCase());

    // 4. Grammar Refinement
    cleanChapter = cleanChapter.replace(/And/g, "and"); 
    if (cleanChapter.toLowerCase().includes("acids bases salts")) {
        cleanChapter = "Acid, Bases and Salts";
    }

    const fullTitle = `Class ${quizState.classId}: ${quizState.subject} - ${cleanChapter} Worksheet`;
    UI.updateHeader(fullTitle, quizState.difficulty);
}

/* -----------------------------------
    LOAD QUIZ
----------------------------------- */
async function loadQuiz() {
    try {
        UI.showStatus("Preparing worksheet...", "text-blue-600 font-bold");

        const processedQuestions = await questionsPromise;
        quizState.questions = processedQuestions;

        if (quizState.questions.length > 0) {
            UI.hideStatus();
            renderQuestion();
            UI.showView("quiz-content");
        }
    } catch (e) {
        UI.showStatus(`Error: ${e.message}`, "text-red-600");
    }
}

/* -----------------------------------
    RENDER QUESTION
----------------------------------- */
function renderQuestion() {
    const q = quizState.questions[quizState.currentQuestionIndex];
    UI.renderQuestion(
        q,
        quizState.currentQuestionIndex + 1,
        quizState.userAnswers[q.id],
        quizState.isSubmitted
    );
    UI.updateNavigation(
        quizState.currentQuestionIndex,
        quizState.questions.length,
        quizState.isSubmitted
    );
}

/* -----------------------------------
    ANSWER HANDLERS
----------------------------------- */
function handleAnswerSelection(id, opt) {
    if (!quizState.isSubmitted) {
        quizState.userAnswers[id] = opt;
        renderQuestion();
    }
}

function handleNavigation(delta) {
    quizState.currentQuestionIndex += delta;
    renderQuestion();
}

/* -----------------------------------
    SUBMIT QUIZ
----------------------------------- */
async function handleSubmit() {
    quizState.isSubmitted = true;

    const stats = {
        total: quizState.questions.length,
        correct: 0,
        mcq: { c: 0, w: 0, t: 0 },
        ar:  { c: 0, w: 0, t: 0 },
        case:{ c: 0, w: 0, t: 0 }
    };

    quizState.questions.forEach(q => {
        const type = q.question_type.toLowerCase();
        const isCorrect = quizState.userAnswers[q.id] === q.correct_answer;
        const cat = type.includes("ar") ? "ar" : type.includes("case") ? "case" : "mcq";

        stats[cat].t++;
        if (isCorrect) {
            stats.correct++;
            stats[cat].c++;
        } else {
            stats[cat].w++;
        }
    });

    UI.renderResults(stats, quizState.difficulty);
    saveResult({ 
        ...quizState, 
        score: stats.correct, 
        total: stats.total,
        topic: quizState.topicSlug 
    });
}

/* -----------------------------------
    DOM EVENTS
----------------------------------- */
function attachDomEvents() {
    document.addEventListener("click", e => {
        const btn = e.target.closest("button, a");
        if (!btn) return;

        if (btn.id === "prev-btn") handleNavigation(-1);
        if (btn.id === "next-btn") handleNavigation(1);
        if (btn.id === "submit-btn") handleSubmit();
        if (btn.id === "btn-review-errors") {
            UI.renderAllQuestionsForReview(quizState.questions, quizState.userAnswers);
        }
        if (btn.id === "back-to-chapters-btn") {
            const subject = quizState.subject || "Physics";
            window.location.href = `chapter-selection.html?subject=${encodeURIComponent(subject)}`;
        }
    });
}

/* -----------------------------------
    GOOGLE LOGIN WIRE
----------------------------------- */
function wireGoogleLogin() {
    const btn = document.getElementById("google-signin-btn");
    if (btn) {
        btn.onclick = async () => {
            await requireAuth();
            location.reload();
        };
    }
}

/* -----------------------------------
    INIT
----------------------------------- */
async function init() {
    UI.initializeElements();
    parseUrlParameters();
    attachDomEvents();
    UI.attachAnswerListeners(handleAnswerSelection);

    try {
        await initializeServices();
        wireGoogleLogin();

        // Handle Auth and Access while data fetches in background
        await initializeAuthListener(async user => {
            if (user) {
                UI.updateAuthUI(user);

                const access = await checkClassAccess(quizState.classId, quizState.subject);
                
                if (access.allowed) {
                    questionsPromise = fetchQuestions(quizState.topicSlug, quizState.difficulty);
                    await loadQuiz(); 
                } else {
                    UI.hideStatus();
                    UI.showView("paywall-screen"); 
                    showExpiredPopup(access.reason);
                }
            } else {
                UI.showView("paywall-screen");
            }
        });
    } catch (err) {
        console.error("Initialization failed:", err);
        UI.showStatus("System error during startup.", "text-red-600");
    }
}

document.addEventListener("DOMContentLoaded", init);
