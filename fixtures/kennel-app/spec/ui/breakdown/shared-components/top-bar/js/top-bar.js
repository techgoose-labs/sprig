// Verbatim from _test-prototype.html. Reference only. The top bar has no JS of its own; nav/theme wiring lives in main-nav/ and theme-toggle/. Lines 623-624: harness dropdown wiring (prototype-only, not product):
document.getElementById("demo-state").addEventListener("change", (e) => setDemo(e.target.value));
document.getElementById("demo-fail").addEventListener("change", (e) => { ui.failNext = e.target.checked; });
