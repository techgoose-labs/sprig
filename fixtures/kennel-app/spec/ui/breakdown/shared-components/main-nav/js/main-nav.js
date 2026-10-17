// Verbatim from _test-prototype.html. Reference only, not deliverable.
// lines 597-607 — render(): line 600 toggles btn-active by route (dog/* highlights board)
let loadState = "loading";
function render() {
  const [, view = "board", id] = (location.hash.replace(/^#\/?/, "") || "board").match(/^([^/]*)\/?(.*)$/) || [];
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("btn-active", a.dataset.nav === (view === "dog" ? "board" : view)));
  if (loadState === "loading") renderLoading();
  else if (loadState === "error") renderError();
  else if (view === "dog") renderDetail(id);
  else if (view === "summary") renderSummary();
  else renderBoard();
  lucide.createIcons();
}
// line 629 — hashchange: scroll to top + re-render
window.addEventListener("hashchange", () => { window.scrollTo(0, 0); render(); });
