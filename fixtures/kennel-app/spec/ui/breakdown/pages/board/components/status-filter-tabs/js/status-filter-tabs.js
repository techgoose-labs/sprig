// Extracted verbatim from spec/ui/kennel-prototype/_test-prototype.html — REFERENCE ONLY, not deliverable.
// Unit: status-filter-tabs. The tabs are built inside renderBoard() (the `tabs` const + the <div role=tablist> line) and share the delegated #app click handler with the status strip.

// _test-prototype.html lines 250-250
const ORDER = ["booked", "checked-in", "walking", "checked-out"];

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

// _test-prototype.html lines 619-622
$app.addEventListener("click", (e) => {
  const f = e.target.closest("[data-filter]");
  if (f) { ui.filter = f.dataset.filter === ui.filter && f.dataset.filter !== "all" ? "all" : f.dataset.filter; render(); }
});
