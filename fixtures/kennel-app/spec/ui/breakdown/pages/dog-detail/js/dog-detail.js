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

// ---- lines 275-282 ----
function toast(msg, kind = "error") {
  const el = document.createElement("div");
  el.className = `alert alert-${kind} shadow-sm max-w-xs`;
  el.innerHTML = `<i data-lucide="${kind === "error" ? "circle-alert" : "circle-check"}" class="size-5 shrink-0"></i><span>${esc(msg)}</span>`;
  document.getElementById("toasts").appendChild(el);
  lucide.createIcons();
  setTimeout(() => el.remove(), 3500);
}

// ---- lines 389-474 ----
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
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <section class="card bg-base-100 border border-base-300">
        <div class="card-body">
          <h2 class="card-title text-2xl"><i data-lucide="paw-print" class="size-5"></i>The dog</h2>
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt class="text-base-content/60">Breed</dt><dd>${esc(d.breed)}</dd>
            <dt class="text-base-content/60">Kennel</dt><dd><span class="badge badge-outline font-mono">${esc(d.kennel)}</span></dd>
            <dt class="text-base-content/60">Arrival</dt><dd class="tabular-nums">${esc(d.arrival)}</dd>
            <dt class="text-base-content/60">Owner</dt><dd>${esc(o.name)}</dd>
            <dt class="text-base-content/60">Phone</dt><dd class="tabular-nums">${esc(o.phone)}</dd>
          </dl>
        </div>
      </section>
      <section class="card bg-base-100 border border-base-300">
        <div class="card-body">
          <h2 class="card-title text-2xl"><i data-lucide="bed-double" class="size-5"></i>The stay</h2>
          ${st ? `
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt class="text-base-content/60">Check-in</dt><dd>${esc(when(st.checkIn))}</dd>
            <dt class="text-base-content/60">Planned check-out</dt><dd>${esc(when(st.plannedCheckOut))}</dd>
            <dt class="text-base-content/60">Nightly rate</dt><dd class="tabular-nums">${money(st.nightlyRate)}</dd>
            <dt class="text-base-content/60">Nights</dt><dd class="tabular-nums">${esc(st.nights)}</dd>
          </dl>
          <div class="divider my-1"></div>
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-sm font-semibold uppercase tracking-wide text-base-content/70">Total due</span>
            <span data-total-due class="text-3xl font-semibold tabular-nums">${money(st.totalDue)}</span>
          </div>` : `<p class="text-base-content/60 italic">No stay on file for this dog.</p>`}
        </div>
      </section>
      <section class="card bg-base-100 border border-base-300">
        <div class="card-body">
          <h2 class="card-title text-2xl"><i data-lucide="list-checks" class="size-5"></i>Actions</h2>
          ${locked ? `<p class="text-sm text-base-content/70">The day is closed — stays are locked.</p>` : ""}
          <div class="flex flex-col sm:flex-row lg:flex-col flex-wrap gap-2">
            ${act("dog.checkIn", "Check in", "log-in", d.status === "booked", d.status === "booked")}
            ${act("dog.startWalk", "Start walk", "footprints", d.status === "checked-in")}
            ${act("dog.endWalk", "End walk", "house", d.status === "walking")}
            ${act("dog.checkOut", "Check out", "log-out", d.status === "checked-in", d.status === "checked-in")}
          </div>
        </div>
      </section>
      <section class="card bg-base-100 border border-base-300 lg:col-span-3">
        <div class="card-body">
          <h2 class="card-title text-2xl"><i data-lucide="notebook-pen" class="size-5"></i>Notes <span class="badge badge-sm">${d.notes.length}</span></h2>
          <ul class="divide-y divide-base-content/10">${notes}</ul>
          <form id="note-form" class="flex flex-col md:flex-row gap-2 mt-2">
            <input name="author" class="input md:w-48" value="Front desk" aria-label="Author" required />
            <input name="text" class="input md:flex-1 w-full" placeholder="Add a handling note…" aria-label="Note" required />
            <button class="btn btn-soft btn-secondary"><i data-lucide="plus" class="size-[1.2em]"></i>Add note</button>
          </form>
        </div>
      </section>
    </div>`;
  $app.querySelectorAll("[data-cmd]").forEach((b) => b.addEventListener("click", () => runStatus(d, b.dataset.cmd)));
  document.getElementById("note-form").addEventListener("submit", (e) => { e.preventDefault(); addNote(d, e.target); });
}

// ---- lines 476-511 ----
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

async function addNote(d, form) {
  const text = form.text.value.trim(), author = form.author.value.trim();
  if (!text) return;
  const temp = { id: "pending", text, author, pending: true };
  d.notes = [...d.notes, temp];
  render();
  try {
    const reply = await window.commands.run("dog.addNote", { id: failId(d.id), text, author });
    d.notes = d.notes.map((n) => (n === temp ? reply : n));
  } catch {
    d.notes = d.notes.filter((n) => n !== temp);
    render();
    document.querySelector('#note-form [name="text"]').value = text;
    toast(`Note for ${d.name} wasn't saved — it's back in the box.`);
    return;
  }
  render();
}

// ---- lines 597-630 ----
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
