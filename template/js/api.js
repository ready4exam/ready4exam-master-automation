/**
 * js/api.js
 * Patched "short-circuit" API module that prevents any Supabase / PostgREST/schema calls.
 * - Exports the same function names expected by the app.
 * - Shows "Welcome to the quiz" once (per requirement) whenever a network fetch would have happened.
 * - Returns safe defaults so app doesn't break.
 *
 * To re-enable real network behavior, replace this file with your original api implementation
 * or set window.__USE_STUBBED_SUPABASE = false and provide implementations that call Supabase.
 */

/* Toggle: keep true to stub Supabase calls. Set to false only if you restore real implementations. */
if (typeof window !== 'undefined' && window.__USE_STUBBED_SUPABASE === undefined) {
  window.__USE_STUBBED_SUPABASE = true;
}

/* Internal helper: show welcome message exactly once (or per page load) */
function showWelcomeOnce() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.__quiz_welcome_shown) return Promise.resolve();
  window.__quiz_welcome_shown = true;

  // Show minimal message per your request. Using alert() so it's guaranteed visible.
  // If you prefer in-app UI, replace with DOM creation logic here.
  try {
    alert('Welcome to the quiz');
  } catch (e) {
    // If alert fails, fallback to console and update a visible status if present.
    try {
      const status = document.getElementById('status-message');
      if (status) status.textContent = 'Welcome to the quiz';
    } catch (ee) {
      // no-op
    }
  }
  return Promise.resolve();
}

/* ---------- Exported stubbed API functions ---------- */

/**
 * Pretend to check whether a table exists.
 * Return false and show welcome message once.
 */
export async function tableExists(/* tableName */) {
  if (!window.__USE_STUBBED_SUPABASE) {
    // In case someone toggles the flag to false, throw to indicate real implementation missing.
    throw new Error('Real Supabase implementation is disabled in this stub module.');
  }
  await showWelcomeOnce();
  return false;
}

/**
 * Main function that other modules call to fetch questions.
 * Short-circuited: shows welcome and returns an empty array (safe default).
 *
 * Keep the same signature your app expects; params are ignored by the stub.
 */
export async function fetchQuestions(/* { chapters, filters } */) {
  if (!window.__USE_STUBBED_SUPABASE) {
    throw new Error('Real Supabase implementation is disabled in this stub module.');
  }
  await showWelcomeOnce();

  // Safe default: empty array.
  // If your UI requires at least one question to render, return a light stub instead (commented below).
  return [];

  // Example stub question (uncomment if you need UI to show one question):
  /*
  return [{
    id: 'stub-1',
    text: 'This is a placeholder question (Supabase disabled).',
    options: { A: 'Option A', B: 'Option B', C: 'Option C', D: 'Option D' },
    correct_answer: 'A',
    question_type: 'mcq',
  }];
  */
}

/**
 * Fetch chapters (e.g., list of chapter metadata).
 * Stub returns an empty array (the page has static fallback list).
 */
export async function fetchChapters(/* params */) {
  if (!window.__USE_STUBBED_SUPABASE) {
    throw new Error('Real Supabase implementation is disabled in this stub module.');
  }
  // NOTE: showing welcome here would duplicate the message if fetchQuestions called first,
  // but showWelcomeOnce() guards against duplicates.
  await showWelcomeOnce();
  return [];
}

/**
 * Generic fetch meta helper stub — returns safe defaults.
 */
export async function fetchMeta(/* key */) {
  if (!window.__USE_STUBBED_SUPABASE) {
    throw new Error('Real Supabase implementation is disabled in this stub module.');
  }
  await showWelcomeOnce();
  return null;
}

/* If there are other specific exported functions in your real api.js (e.g., fetchUserProgress),
   add stubs following the same pattern: call showWelcomeOnce() then return a safe default. */
