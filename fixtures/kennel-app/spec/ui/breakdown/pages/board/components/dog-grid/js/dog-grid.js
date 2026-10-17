// Verbatim excerpts from spec/ui/kennel-prototype/_test-prototype.html (reference only, not deliverable).

// ---- lines 244-273 ----
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

// ---- lines 337-354 ----
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

// ---- lines 356-384 ----
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

// ---- lines 619-622 ----
$app.addEventListener("click", (e) => {
  const f = e.target.closest("[data-filter]");
  if (f) { ui.filter = f.dataset.filter === ui.filter && f.dataset.filter !== "all" ? "all" : f.dataset.filter; render(); }
});
