// Extracted verbatim from spec/ui/kennel-prototype/_test-prototype.html — stay card: helpers + renderDetail (stay section at 431-447). Reference only (not deliverable).

// ---- lines 262-273 ----
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

// ---- lines 389-401 ----
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

// ---- lines 431-447 ----
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
