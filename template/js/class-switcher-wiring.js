// class-switcher-wiring.js
// Wires the class selector UI to your config + auth initialization
// -----------------------------------------------------------------------------
// Expects:
// - initializeServices(classId) exported from js/config.js
// - initializeAuthListener(callback) exported from js/auth-paywall.js
// - An existing <select id="class-select"> in the DOM
// -----------------------------------------------------------------------------

import { initializeServices } from "./config.js";
import { initializeAuthListener } from "./auth-paywall.js";

const LOG = "[CLASS-SWITCHER]";

/**
 * Initialize everything for the given classId:
 *  - initializeServices(classId) sets firebase (via switcher) and supabase
 *  - initializeAuthListener() attaches auth state listener for the selected firebase auth
 */
async function initForClass(classId) {
  try {
    console.log(LOG, "Initializing services for", classId);
    // initializeServices will switch firebase project when classId provided
    await initializeServices(classId);

    // initializeAuthListener attaches onAuthStateChanged on the current auth instance
    // pass a callback for optional local handling (we just re-dispatch the event)
    await initializeAuthListener((user) => {
      // auth-paywall already triggers auth change events; this callback is a hook if needed
      window.dispatchEvent(new CustomEvent("r4e:auth-init", { detail: { user, classId } }));
    });

    // Dispatch a class-changed event for other modules
    window.dispatchEvent(new CustomEvent("r4e:class-changed", { detail: { classId } }));
    console.log(LOG, "Initialization complete for", classId);
  } catch (err) {
    console.error(LOG, "Failed to init for", classId, err);
  }
}

/* DOM wiring */
function wireSelector() {
  const classSelect = document.getElementById("class-select");
  if (!classSelect) {
    console.warn(LOG, "No #class-select element found in DOM. Skipping selector wiring.");
    return;
  }

  // On change: re-init services + auth listener
  classSelect.addEventListener("change", async (ev) => {
    const newClass = ev.target.value;
    console.log(LOG, "Class changed to", newClass);
    // initializeServices + auth listener for the new class
    await initForClass(newClass);
  });

  // Initialize for the currently selected option on load
  const initial = classSelect.value || "class9";
  // Defer to DOMContentLoaded completion if necessary
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", () => initForClass(initial));
  } else {
    initForClass(initial);
  }
}

/* Auto-run wiring */
wireSelector();

/* Export for manual control if other modules want to call */
export { initForClass };
