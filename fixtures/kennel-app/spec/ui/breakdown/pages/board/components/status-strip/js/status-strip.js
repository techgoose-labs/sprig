// Extracted verbatim from spec/ui/kennel-prototype/_test-prototype.html — REFERENCE ONLY, not deliverable.
// Unit: status-strip. Counts come from day.byStatus (read seam objects/day.json); click handled by the delegated #app click listener (toggles ui.filter; clicking the active card resets to "all").

// _test-prototype.html lines 250-250
const ORDER = ["booked", "checked-in", "walking", "checked-out"];

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

// _test-prototype.html lines 619-622
$app.addEventListener("click", (e) => {
  const f = e.target.closest("[data-filter]");
  if (f) { ui.filter = f.dataset.filter === ui.filter && f.dataset.filter !== "all" ? "all" : f.dataset.filter; render(); }
});
