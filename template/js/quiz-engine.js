// -------------------------------
// Parse quiz parameters (with fallback + localStorage support)
// -------------------------------
function parseUrlParameters() {
  const urlParams = new URLSearchParams(window.location.search);

  // ✅ Pull parameters from URL first
  quizState.classId = urlParams.get("class") || localStorage.getItem("selectedClass") || "class11";
  quizState.subject = urlParams.get("subject") || localStorage.getItem("selectedSubject") || "Physics";
  quizState.topicSlug = urlParams.get("topic") || localStorage.getItem("selectedTopic");
  quizState.difficulty = urlParams.get("difficulty") || "simple";

  // ✅ Normalize classId (add prefix if numeric)
  if (!String(quizState.classId).startsWith("class")) {
    quizState.classId = `class${quizState.classId}`;
  }

  // ✅ Fallback for missing topic (development-safe)
  if (!quizState.topicSlug) {
    console.warn("[ENGINE] Missing topic parameter — using fallback test topic.");
    quizState.topicSlug = "Electric_Charges_and_Fields";
    quizState.subject = quizState.subject || "Physics";
    quizState.classId = quizState.classId || "class11";
  }

  // ✅ Store back to localStorage (so next pages know what’s selected)
  localStorage.setItem("selectedClass", quizState.classId);
  localStorage.setItem("selectedSubject", quizState.subject);
  localStorage.setItem("selectedTopic", quizState.topicSlug);

  // ✅ Resolve chapter title (friendly name)
  const displayTitle =
    findChapterTitle(quizState.classId, quizState.subject, quizState.topicSlug) ||
    humanizeSlug(quizState.topicSlug);

  // ✅ Update quiz header
  UI.updateHeader(displayTitle, quizState.difficulty);

  console.log(
    `[ENGINE] Initialized quiz parameters → class=${quizState.classId}, subject=${quizState.subject}, topic=${quizState.topicSlug}, difficulty=${quizState.difficulty}`
  );
}
