// Extracted verbatim from spec/ui/kennel-prototype/_test-prototype.html lines 244-250 (STATUS/ORDER), 262 (esc), 266-269 (badge), 516-524 (byStatus), 566-569 (card markup) (reference only, not deliverable).
const STATUS = {
  "booked":      { label: "Booked",      badge: "badge-info badge-soft",     icon: "calendar-clock" },
  "checked-in":  { label: "Checked in",  badge: "badge-success badge-soft",  icon: "house" },
  "walking":     { label: "Walking",     badge: "badge-accent",              icon: "footprints" },
  "checked-out": { label: "Checked out", badge: "badge-outline", icon: "log-out" },
};
const ORDER = ["booked", "checked-in", "walking", "checked-out"];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const badge = (status, extra = "") => {
  const s = STATUS[status];
  return `<span class="badge ${s.badge} ${extra} whitespace-nowrap"><i data-lucide="${s.icon}" class="size-[1em]"></i>${s.label}</span>`;
};

function renderSummary() {
  const { day, dog } = ui.data;
  const overdue = dog.filter((d) => d.overdue);   // server-decided flag — no date math here
  const byStatus = ORDER.map((s) => `
    <li class="flex items-center gap-3 py-2">
      <span class="w-32 shrink-0">${badge(s, "badge-sm")}</span>
      <progress class="progress ${s === "walking" ? "progress-accent" : s === "checked-in" ? "progress-success" : s === "booked" ? "progress-info" : ""} flex-1" value="${esc(day.byStatus[s])}" max="${esc(day.kennelsTotal)}"></progress>
      <span class="w-8 text-right tabular-nums font-semibold">${esc(day.byStatus[s])}</span>
    </li>`).join("");

      <section class="card bg-base-100 border border-base-300"><div class="card-body">
        <h2 class="card-title text-2xl"><i data-lucide="dog" class="size-5"></i>Dogs by status</h2>
        <ul>${byStatus}</ul>
      </div></section>
