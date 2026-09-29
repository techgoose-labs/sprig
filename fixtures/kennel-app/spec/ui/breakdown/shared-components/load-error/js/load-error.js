// Verbatim from _test-prototype.html. Reference only.
// lines 287-289 — load(): ?state=error forces the error branch
async function load() {
  if (ui.demo === "loading") return "loading";
  if (ui.demo === "error") return "error";
// lines 312-320 — renderError()
function renderError() {
  $app.innerHTML = `
    <div role="alert" class="alert alert-error alert-soft max-w-2xl mx-auto mt-10">
      <i data-lucide="wifi-off" class="size-6 shrink-0"></i>
      <div><h3 class="font-bold">Couldn't load today's board</h3>
        <div class="text-sm">The kennel server didn't answer. Your last check-ins are safe — nothing was lost.</div></div>
      <button class="btn btn-sm" onclick="setDemo('live')">Retry</button>
    </div>`;
}
// lines 597-617 — render() dispatch + setDemo() (Retry -> setDemo('live'): loading skeleton, 450ms fake latency, re-load)
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

async function setDemo(mode) {
  ui.demo = mode;
  document.getElementById("demo-state").value = mode;
  loadState = "loading";
  render();
  await new Promise((r) => setTimeout(r, mode === "loading" ? 0 : 450)); // fake latency
  try { loadState = await load(); } catch { loadState = "error"; }
  render();
}
