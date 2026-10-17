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

// ---- lines 389-417 ----
function renderDetail(id) {
  const d = ui.data.dog.find((x) => x.id === id);
  if (!d) {
    $app.innerHTML = `<div class="card bg-base-100 border border-base-300 max-w-xl mx-auto mt-10"><div class="card-body items-center text-center">
      <i data-lucide="dog" class="size-10 text-base-content/40"></i>
      <h1 class="font-display text-3xl">We can't find that dog</h1>
      <p class="text-base-content/70">It may have been removed from today's board.</p>
      <a href="#/board" class="btn btn-sm">Back to the board</a></div></div>`;
    return;
  }
  const o = owner(d.owner);
  const st = stayOf(d.id);
  const locked = ui.data.day.closed;
  const act = (cmd, label, icon, enabled, primary = false) => `
    <button data-cmd="${cmd}" class="btn ${primary ? "btn-primary" : "btn-soft btn-secondary"} w-full sm:w-auto" ${enabled && !locked ? "" : "disabled"}>
      <i data-lucide="${icon}" class="size-[1.2em]"></i>${label}</button>`;
  const notes = d.notes.length === 0
    ? `<li class="text-base-content/60 italic py-3">No notes yet — add the first one below.</li>`
    : d.notes.map((n) => `
      <li class="py-3 ${n.pending ? "opacity-50" : ""}">
        <p class="break-words">${esc(n.text)}</p>
        <p class="text-xs text-base-content/60 mt-1">${esc(n.author)} · ${n.pending ? "saving…" : n.at ? esc(when(n.at)) : "just now"}</p>
      </li>`).join("");
  $app.innerHTML = `
    <a href="#/board" class="btn btn-ghost btn-sm mb-3 -ml-2"><i data-lucide="arrow-left" class="size-[1.2em]"></i>Board</a>
    <div class="flex flex-wrap items-center gap-3 mb-5">
      <h1 class="font-display text-4xl md:text-5xl break-words min-w-0">${esc(d.name)}</h1>
      <div class="flex flex-wrap gap-2">${badge(d.status)} ${overdueBadge(d)}</div>
    </div>

// ---- lines 476-492 ----
// instant feedback: render the intent first, reconcile on the reply, revert + toast on rejection.
const TARGET = { "dog.checkIn": "checked-in", "dog.startWalk": "walking", "dog.endWalk": "checked-in", "dog.checkOut": "checked-out" };
const failId = (id) => { if (!ui.failNext) return id; ui.failNext = false; document.getElementById("demo-fail").checked = false; return id + "-unreachable"; };

async function runStatus(d, cmd) {
  const before = { status: d.status };
  d.status = TARGET[cmd];
  render();
  try {
    const reply = await window.commands.run(cmd, { id: failId(d.id), status: TARGET[cmd] });
    Object.assign(d, reply);
  } catch (err) {
    Object.assign(d, before);
    toast(`${d.name}: ${STATUS[TARGET[cmd]].label.toLowerCase()} didn't go through — reverted.`);
  }
  render();
}

// ---- lines 597-607 ----
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
