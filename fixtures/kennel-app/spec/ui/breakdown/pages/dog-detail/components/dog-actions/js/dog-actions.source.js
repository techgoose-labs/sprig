// Extracted verbatim from spec/ui/kennel-prototype/_test-prototype.html — actions card: STATUS/helpers, toast(), renderDetail act() + actions section, TARGET/failId/runStatus, demo-fail wiring. Reference only (not deliverable).

// ---- lines 244-250 ----
const STATUS = {
  "booked":      { label: "Booked",      badge: "badge-info badge-soft",     icon: "calendar-clock" },
  "checked-in":  { label: "Checked in",  badge: "badge-success badge-soft",  icon: "house" },
  "walking":     { label: "Walking",     badge: "badge-accent",              icon: "footprints" },
  "checked-out": { label: "Checked out", badge: "badge-outline", icon: "log-out" },
};
const ORDER = ["booked", "checked-in", "walking", "checked-out"];

// ---- lines 266-282 ----
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

// ---- lines 389-404 ----
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

// ---- lines 448-459 ----
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

// ---- lines 472-472 ----
  $app.querySelectorAll("[data-cmd]").forEach((b) => b.addEventListener("click", () => runStatus(d, b.dataset.cmd)));

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

// ---- lines 624-624 ----
document.getElementById("demo-fail").addEventListener("change", (e) => { ui.failNext = e.target.checked; });
