// Verbatim from _test-prototype.html lines 625-628 (theme toggle wiring; ?theme= is the prototype's initial-theme param; no persistence). Reference only.
const themeToggle = document.getElementById("theme-toggle");
const setTheme = (t) => { document.documentElement.dataset.theme = t; themeToggle.checked = t === "brand-dark"; };
themeToggle.addEventListener("change", () => setTheme(themeToggle.checked ? "brand-dark" : "brand"));
setTheme(params.get("theme") || "brand");
