// Extracted verbatim from spec/ui/kennel-prototype/_test-prototype.html lines 244-250,252-283,285-321,477-478,513-592,594-631 (reference only, not deliverable).
const STATUS = {
  "booked":      { label: "Booked",      badge: "badge-info badge-soft",     icon: "calendar-clock" },
  "checked-in":  { label: "Checked in",  badge: "badge-success badge-soft",  icon: "house" },
  "walking":     { label: "Walking",     badge: "badge-accent",              icon: "footprints" },
  "checked-out": { label: "Checked out", badge: "badge-outline", icon: "log-out" },
};
const ORDER = ["booked", "checked-in", "walking", "checked-out"];
const params = new URLSearchParams(location.search);
const ui = {
  demo: params.get("state") || "live",
  failNext: false,
  filter: "all",
  data: null,          // { dog, owner, stay, day } as returned by the read seam
  pendingClose: false,
};

const $app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const when = (iso) => new Date(iso + "Z").toLocaleString("en-US", { timeZone: "UTC", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const dayLabel = (iso) => new Date(iso + "T12:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
const badge = (status, extra = "") => {
  const s = STATUS[status];
  return `<span class="badge ${s.badge} ${extra} whitespace-nowrap"><i data-lucide="${s.icon}" class="size-[1em]"></i>${s.label}</span>`;
};
const overdueBadge = (d) => d.overdue
  ? `<span class="badge badge-error whitespace-nowrap"><i data-lucide="alarm-clock" class="size-[1em]"></i>Overdue${d.overdueBy ? " · " + esc(d.overdueBy) : ""}</span>` : "";
const owner = (id) => ui.data.owner.find((o) => o.id === id) || { name: "Unknown owner" };
const stayOf = (dogId) => ui.data.stay.find((s) => s.dog === dogId);

function toast(msg, kind = "error") {
  const el = document.createElement("div");
  el.className = `alert alert-${kind} shadow-sm max-w-xs`;
  el.innerHTML = `<i data-lucide="${kind === "error" ? "circle-alert" : "circle-check"}" class="size-5 shrink-0"></i><span>${esc(msg)}</span>`;
  document.getElementById("toasts").appendChild(el);
  lucide.createIcons();
  setTimeout(() => el.remove(), 3500);
}


// Loading (with the demo-state overrides — faked in the view layer only).
// ---------------------------------------------------------------------------
async function load() {
  if (ui.demo === "loading") return "loading";
  if (ui.demo === "error") return "error";
  const [dog, owner, stay, day] = await Promise.all(["dog", "owner", "stay", "day"].map((t) => window.objects.all(t)));
  ui.data = { dog, owner, stay, day: day[0] };
  if (ui.demo === "empty") ui.data = { ...ui.data, dog: [], stay: [] };
  return "ok";
}

// ---------------------------------------------------------------------------
// Unglamorous states.
// ---------------------------------------------------------------------------
const skeletonCards = (n) => Array.from({ length: n }, () => `
  <div class="card bg-base-100 border border-base-300"><div class="card-body gap-3">
    <div class="skeleton h-6 w-2/3"></div><div class="skeleton h-4 w-1/2"></div>
    <div class="flex gap-2"><div class="skeleton h-5 w-20"></div><div class="skeleton h-5 w-14"></div></div>
  </div></div>`).join("");

function renderLoading() {
  $app.innerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">${Array.from({ length: 4 }, () => `<div class="skeleton h-20 rounded-box"></div>`).join("")}</div>
    <div class="flex items-center gap-2 mb-4 text-base-content/70"><span class="loading loading-spinner loading-sm"></span>Loading today's dogs…</div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">${skeletonCards(8)}</div>`;
}

function renderError() {
  $app.innerHTML = `
    <div role="alert" class="alert alert-error alert-soft max-w-2xl mx-auto mt-10">
      <i data-lucide="wifi-off" class="size-6 shrink-0"></i>
      <div><h3 class="font-bold">Couldn't load today's board</h3>
        <div class="text-sm">The kennel server didn't answer. Your last check-ins are safe — nothing was lost.</div></div>
      <button class="btn btn-sm" onclick="setDemo('live')">Retry</button>
    </div>`;
}


const TARGET = { "dog.checkIn": "checked-in", "dog.startWalk": "walking", "dog.endWalk": "checked-in", "dog.checkOut": "checked-out" };
const failId = (id) => { if (!ui.failNext) return id; ui.failNext = false; document.getElementById("demo-fail").checked = false; return id + "-unreachable"; };

// ---------------------------------------------------------------------------
// Screen 3 — Day summary.
// ---------------------------------------------------------------------------
function renderSummary() {
  const { day, dog } = ui.data;
  const overdue = dog.filter((d) => d.overdue);   // server-decided flag — no date math here
  const byStatus = ORDER.map((s) => `
    <li class="flex items-center gap-3 py-2">
      <span class="w-32 shrink-0">${badge(s, "badge-sm")}</span>
      <progress class="progress ${s === "walking" ? "progress-accent" : s === "checked-in" ? "progress-success" : s === "booked" ? "progress-info" : ""} flex-1" value="${esc(day.byStatus[s])}" max="${esc(day.kennelsTotal)}"></progress>
      <span class="w-8 text-right tabular-nums font-semibold">${esc(day.byStatus[s])}</span>
    </li>`).join("");
  const overdueList = overdue.length === 0
    ? `<p class="text-base-content/60 italic py-3">No overdue pickups — every owner is on time.</p>`
    : `<ul class="divide-y divide-base-content/10">${overdue.map((d) => `
        <li class="py-3 flex flex-wrap items-center gap-2">
          <a href="#/dog/${esc(d.id)}" class="font-semibold link link-hover min-w-0 break-words">${esc(d.name)}</a>
          <span class="badge badge-outline font-mono">${esc(d.kennel)}</span>
          <span class="text-sm text-base-content/70 min-w-0">${esc(owner(d.owner).name)} · <span class="tabular-nums">${esc(owner(d.owner).phone)}</span></span>
          <span class="ml-auto">${overdueBadge(d)}</span>
        </li>`).join("")}</ul>`;
  $app.innerHTML = `
    <div class="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div><h1 class="font-display text-4xl">Day summary</h1>
        <p class="text-base-content/70">${esc(dayLabel(day.date))}</p></div>
      ${day.closed
        ? `<span class="badge badge-neutral badge-lg"><i data-lucide="lock" class="size-[1em]"></i>Day closed</span>`
        : `<button id="close-day" class="btn btn-primary" ${ui.pendingClose ? "disabled" : ""}>
             ${ui.pendingClose ? `<span class="loading loading-spinner loading-sm"></span>Closing the day…` : `<i data-lucide="lock" class="size-[1.2em]"></i>Close the day`}
           </button>`}
    </div>
    ${day.closed ? `<div role="alert" class="alert alert-soft alert-success mb-5"><i data-lucide="circle-check" class="size-5 shrink-0"></i><span>Today's ledger is locked. Revenue below is final.</span></div>` : ""}
    <div class="stats stats-vertical md:stats-horizontal w-full bg-base-100 border border-base-300 mb-5">
      <div class="stat">
        <div class="stat-figure text-secondary"><i data-lucide="warehouse" class="size-8"></i></div>
        <div class="stat-title">Occupancy</div>
        <div class="stat-value tabular-nums">${esc(day.kennelsUsed)}<span class="text-base font-normal text-base-content/60"> of ${esc(day.kennelsTotal)} kennels</span></div>
        <div class="stat-desc"><progress class="progress progress-secondary w-40" value="${esc(day.occupancyPct)}" max="100"></progress> ${esc(day.occupancyPct)}%</div>
      </div>
      <div class="stat">
        <div class="stat-figure text-success"><i data-lucide="banknote" class="size-8"></i></div>
        <div class="stat-title">Revenue today</div>
        <div class="stat-value tabular-nums">${money(day.revenueToday)}</div>
        <div class="stat-desc">${day.closed ? "Final" : "Settles when the day closes"}</div>
      </div>
      <div class="stat">
        <div class="stat-figure text-error"><i data-lucide="alarm-clock" class="size-8"></i></div>
        <div class="stat-title">Overdue pickups</div>
        <div class="stat-value tabular-nums">${esc(day.overdueCount)}</div>
        <div class="stat-desc">Past their planned check-out</div>
      </div>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section class="card bg-base-100 border border-base-300"><div class="card-body">
        <h2 class="card-title text-2xl"><i data-lucide="dog" class="size-5"></i>Dogs by status</h2>
        <ul>${byStatus}</ul>
      </div></section>
      <section class="card bg-base-100 border border-base-300"><div class="card-body">
        <h2 class="card-title text-2xl"><i data-lucide="alarm-clock" class="size-5"></i>Overdue pickups</h2>
        ${overdueList}
      </div></section>
    </div>`;
  const btn = document.getElementById("close-day");
  if (btn) btn.addEventListener("click", closeDay);
}

// confirmed feedback: pending state until the reply, then render the server's day.
async function closeDay() {
  ui.pendingClose = true;
  render();
  try {
    const reply = await window.commands.run("day.close", { id: failId(ui.data.day.id), closed: true });
    ui.data.day = { ...ui.data.day, ...reply };
    toast("Day closed — ledger locked.", "success");
  } catch {
    toast("The day couldn't be closed — nothing changed.");
  }
  ui.pendingClose = false;
  render();
}

// ---------------------------------------------------------------------------
// Router + wiring.
// ---------------------------------------------------------------------------
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

$app.addEventListener("click", (e) => {
  const f = e.target.closest("[data-filter]");
  if (f) { ui.filter = f.dataset.filter === ui.filter && f.dataset.filter !== "all" ? "all" : f.dataset.filter; render(); }
});
document.getElementById("demo-state").addEventListener("change", (e) => setDemo(e.target.value));
document.getElementById("demo-fail").addEventListener("change", (e) => { ui.failNext = e.target.checked; });
const themeToggle = document.getElementById("theme-toggle");
const setTheme = (t) => { document.documentElement.dataset.theme = t; themeToggle.checked = t === "brand-dark"; };
themeToggle.addEventListener("change", () => setTheme(themeToggle.checked ? "brand-dark" : "brand"));
setTheme(params.get("theme") || "brand");
window.addEventListener("hashchange", () => { window.scrollTo(0, 0); render(); });
setDemo(ui.demo);
</script>
