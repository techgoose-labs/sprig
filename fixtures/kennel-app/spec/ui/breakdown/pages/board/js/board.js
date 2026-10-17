// Extracted verbatim from spec/ui/kennel-prototype/_test-prototype.html — REFERENCE ONLY, not deliverable.
// Unit: board. Full board composition: loading/error states, board render, dog card, router render(), setDemo() fake latency, delegated filter click, hashchange scroll reset, toast().

// _test-prototype.html lines 244-249
const STATUS = {
  "booked":      { label: "Booked",      badge: "badge-info badge-soft",     icon: "calendar-clock" },
  "checked-in":  { label: "Checked in",  badge: "badge-success badge-soft",  icon: "house" },
  "walking":     { label: "Walking",     badge: "badge-accent",              icon: "footprints" },
  "checked-out": { label: "Checked out", badge: "badge-outline", icon: "log-out" },
};

// _test-prototype.html lines 250-250
const ORDER = ["booked", "checked-in", "walking", "checked-out"];

// _test-prototype.html lines 252-252
const params = new URLSearchParams(location.search);

// _test-prototype.html lines 253-259
const ui = {
  demo: params.get("state") || "live",
  failNext: false,
  filter: "all",
  data: null,          // { dog, owner, stay, day } as returned by the read seam
  pendingClose: false,
};

// _test-prototype.html lines 262-262
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// _test-prototype.html lines 265-265
const dayLabel = (iso) => new Date(iso + "T12:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });

// _test-prototype.html lines 266-269
const badge = (status, extra = "") => {
  const s = STATUS[status];
  return `<span class="badge ${s.badge} ${extra} whitespace-nowrap"><i data-lucide="${s.icon}" class="size-[1em]"></i>${s.label}</span>`;
};

// _test-prototype.html lines 270-271
const overdueBadge = (d) => d.overdue
  ? `<span class="badge badge-error whitespace-nowrap"><i data-lucide="alarm-clock" class="size-[1em]"></i>Overdue${d.overdueBy ? " · " + esc(d.overdueBy) : ""}</span>` : "";

// _test-prototype.html lines 272-272
const owner = (id) => ui.data.owner.find((o) => o.id === id) || { name: "Unknown owner" };

// _test-prototype.html lines 275-282
function toast(msg, kind = "error") {
  const el = document.createElement("div");
  el.className = `alert alert-${kind} shadow-sm max-w-xs`;
  el.innerHTML = `<i data-lucide="${kind === "error" ? "circle-alert" : "circle-check"}" class="size-5 shrink-0"></i><span>${esc(msg)}</span>`;
  document.getElementById("toasts").appendChild(el);
  lucide.createIcons();
  setTimeout(() => el.remove(), 3500);
}

// _test-prototype.html lines 287-294
async function load() {
  if (ui.demo === "loading") return "loading";
  if (ui.demo === "error") return "error";
  const [dog, owner, stay, day] = await Promise.all(["dog", "owner", "stay", "day"].map((t) => window.objects.all(t)));
  ui.data = { dog, owner, stay, day: day[0] };
  if (ui.demo === "empty") ui.data = { ...ui.data, dog: [], stay: [] };
  return "ok";
}

// _test-prototype.html lines 299-303
const skeletonCards = (n) => Array.from({ length: n }, () => `
  <div class="card bg-base-100 border border-base-300"><div class="card-body gap-3">
    <div class="skeleton h-6 w-2/3"></div><div class="skeleton h-4 w-1/2"></div>
    <div class="flex gap-2"><div class="skeleton h-5 w-20"></div><div class="skeleton h-5 w-14"></div></div>
  </div></div>`).join("");

// _test-prototype.html lines 305-310
function renderLoading() {
  $app.innerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">${Array.from({ length: 4 }, () => `<div class="skeleton h-20 rounded-box"></div>`).join("")}</div>
    <div class="flex items-center gap-2 mb-4 text-base-content/70"><span class="loading loading-spinner loading-sm"></span>Loading today's dogs…</div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">${skeletonCards(8)}</div>`;
}

// _test-prototype.html lines 312-320
function renderError() {
  $app.innerHTML = `
    <div role="alert" class="alert alert-error alert-soft max-w-2xl mx-auto mt-10">
      <i data-lucide="wifi-off" class="size-6 shrink-0"></i>
      <div><h3 class="font-bold">Couldn't load today's board</h3>
        <div class="text-sm">The kennel server didn't answer. Your last check-ins are safe — nothing was lost.</div></div>
      <button class="btn btn-sm" onclick="setDemo('live')">Retry</button>
    </div>`;
}

// _test-prototype.html lines 325-335
function statusStrip() {
  const bs = ui.data.day.byStatus;
  const empty = ui.data.dog.length === 0;
  return `<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">` + ORDER.map((s) => `
    <button data-filter="${s}" class="card bg-base-100 border ${ui.filter === s ? "border-primary" : "border-base-300"} text-left hover:bg-base-200 transition-colors">
      <div class="card-body p-4 gap-1">
        <div class="flex items-center justify-between gap-2">${badge(s, "badge-sm")}</div>
        <div class="text-3xl font-semibold tabular-nums">${empty ? "—" : esc(bs[s])}</div>
      </div>
    </button>`).join("") + `</div>`;
}

// _test-prototype.html lines 337-354
function dogCard(d) {
  const o = owner(d.owner);
  return `
  <a href="#/dog/${esc(d.id)}" class="card bg-base-100 border ${d.overdue ? "border-error" : "border-base-300"} hover:shadow-sm transition-shadow min-w-0">
    <div class="card-body p-4 gap-2">
      <div class="flex items-start justify-between gap-2 min-w-0">
        <h2 class="card-title text-2xl leading-tight min-w-0 break-words">${esc(d.name)}</h2>
        <span class="badge badge-outline font-mono shrink-0">${esc(d.kennel)}</span>
      </div>
      <p class="text-sm text-base-content/70 truncate">${esc(d.breed)}</p>
      <p class="text-sm flex items-center gap-1 min-w-0"><i data-lucide="user" class="size-4 shrink-0"></i><span class="truncate">${esc(o.name)}</span></p>
      <div class="flex flex-wrap items-center gap-2 mt-1">
        ${badge(d.status)} ${overdueBadge(d)}
        <span class="ml-auto text-sm text-base-content/70 flex items-center gap-1 tabular-nums"><i data-lucide="clock" class="size-4"></i>${esc(d.arrival)}</span>
      </div>
    </div>
  </a>`;
}

// _test-prototype.html lines 356-384
function renderBoard() {
  const { day, dog } = ui.data;
  const shown = ui.filter === "all" ? dog : dog.filter((d) => d.status === ui.filter);
  const tabs = ["all", ...ORDER].map((f) => `
    <button role="tab" data-filter="${f}" class="tab whitespace-nowrap ${ui.filter === f ? "tab-active" : ""}">${f === "all" ? "All" : STATUS[f].label}</button>`).join("");
  let list;
  if (dog.length === 0) {
    list = `<div class="card bg-base-100 border border-dashed border-base-300"><div class="card-body items-center text-center py-16">
      <i data-lucide="bone" class="size-10 text-base-content/40"></i>
      <h2 class="font-display text-3xl">No dogs booked today</h2>
      <p class="text-base-content/70 max-w-sm">When a booking lands for today it shows up here, ready to check in.</p></div></div>`;
  } else if (shown.length === 0) {
    list = `<div class="card bg-base-100 border border-dashed border-base-300"><div class="card-body items-center text-center py-12">
      <i data-lucide="search-x" class="size-8 text-base-content/40"></i>
      <p class="text-base-content/70">No dogs are <b>${STATUS[ui.filter].label.toLowerCase()}</b> right now.</p>
      <button class="btn btn-sm btn-ghost" data-filter="all">Show all dogs</button></div></div>`;
  } else {
    list = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">${shown.map(dogCard).join("")}</div>`;
  }
  $app.innerHTML = `
    <div class="flex flex-wrap items-end justify-between gap-2 mb-4">
      <div><h1 class="font-display text-4xl">Today's dogs</h1>
        <p class="text-base-content/70">${esc(dayLabel(day.date))}</p></div>
      ${day.closed ? `<span class="badge badge-neutral"><i data-lucide="lock" class="size-[1em]"></i>Day closed</span>` : ""}
    </div>
    ${statusStrip()}
    <div role="tablist" class="tabs tabs-box mb-4 overflow-x-auto flex-nowrap">${tabs}</div>
    ${list}`;
}

// _test-prototype.html lines 597-597
let loadState = "loading";

// _test-prototype.html lines 598-607
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

// _test-prototype.html lines 609-617
async function setDemo(mode) {
  ui.demo = mode;
  document.getElementById("demo-state").value = mode;
  loadState = "loading";
  render();
  await new Promise((r) => setTimeout(r, mode === "loading" ? 0 : 450)); // fake latency
  try { loadState = await load(); } catch { loadState = "error"; }
  render();
}

// _test-prototype.html lines 619-622
$app.addEventListener("click", (e) => {
  const f = e.target.closest("[data-filter]");
  if (f) { ui.filter = f.dataset.filter === ui.filter && f.dataset.filter !== "all" ? "all" : f.dataset.filter; render(); }
});

// _test-prototype.html lines 629-629
window.addEventListener("hashchange", () => { window.scrollTo(0, 0); render(); });
