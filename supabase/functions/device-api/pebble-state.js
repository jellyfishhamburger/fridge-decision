/* Pure session rules shared by the future device API and its validation tools.
 * Does not access inventory, credentials, network or browser storage. */
(function(root) {
  "use strict";
  function create(id, recipe, now = Date.now()) {
    if (!id || !recipe || !Array.isArray(recipe.steps) || !recipe.steps.length) throw Error("Invalid session");
    const steps = recipe.steps.map(s => {
      if (!s || typeof s.text !== "string" || !Number.isInteger(s.seconds) || s.seconds < 0 || s.seconds > 86400) throw Error("Invalid step");
      return { text: s.text, seconds: s.seconds };
    });
    return { id, recipe_id: recipe.id, steps, step_index: 0, status: "cooking", remaining_ms: steps[0].seconds * 1000, timer_ends_at: null, revision: 0, updated_at: now };
  }
  function remaining(state, now = Date.now()) {
    return state.timer_ends_at === null ? state.remaining_ms : Math.max(0, state.timer_ends_at - now);
  }
  function apply(state, command, now = Date.now()) {
    // Optimistic concurrency prevents delayed/retried button presses from toggling twice.
    if (!command || command.session_id !== state.id) throw Error("Wrong session");
    if (command.revision !== state.revision) throw Error("Stale revision");
    if (state.status !== "cooking") throw Error("Session ended");
    let effectiveNow=now;
    if(command.action==='toggle_timer' && command.occurred_at !== undefined){
      if(!Number.isSafeInteger(command.occurred_at)||command.occurred_at<now-30000||command.occurred_at>now+2000)throw Error('Invalid event time');
      effectiveNow=Math.min(now,Math.max(state.updated_at,command.occurred_at));
    }
    const next = { ...state, remaining_ms: remaining(state, effectiveNow), updated_at: now, revision: state.revision + 1 };
    if (command.action === "set_step") {
      const index = command.step_index;
      if (!Number.isInteger(index) || index < 0 || index >= state.steps.length) throw Error("Invalid step index");
      if (index !== state.step_index) {
        next.step_index = index; next.remaining_ms = state.steps[index].seconds * 1000; next.timer_ends_at = null;
      }
    } else if (command.action === "toggle_timer") {
      next.timer_ends_at = state.timer_ends_at === null && next.remaining_ms > 0 ? effectiveNow + next.remaining_ms : null;
    } else if (command.action === "exit") {
      next.status = "exited"; next.remaining_ms = 0; next.timer_ends_at = null;
    } else throw Error("Unknown action");
    return next;
  }
  const api = { create, remaining, apply };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PEBBLE_STATE = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
