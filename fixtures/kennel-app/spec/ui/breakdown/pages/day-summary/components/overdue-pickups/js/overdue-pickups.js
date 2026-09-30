// Extracted verbatim from spec/ui/kennel-prototype/_test-prototype.html lines 262 (esc), 270-272 (overdueBadge, owner), 516-518 (overdue filter), 525-533 (overdueList), 570-573 (card markup) (reference only, not deliverable).
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const overdueBadge = (d) => d.overdue
  ? `<span class="badge badge-error whitespace-nowrap"><i data-lucide="alarm-clock" class="size-[1em]"></i>Overdue${d.overdueBy ? " · " + esc(d.overdueBy) : ""}</span>` : "";
const owner = (id) => ui.data.owner.find((o) => o.id === id) || { name: "Unknown owner" };

function renderSummary() {
  const { day, dog } = ui.data;
  const overdue = dog.filter((d) => d.overdue);   // server-decided flag — no date math here

  const overdueList = overdue.length === 0
    ? `<p class="text-base-content/60 italic py-3">No overdue pickups — every owner is on time.</p>`
    : `<ul class="divide-y divide-base-content/10">${overdue.map((d) => `
        <li class="py-3 flex flex-wrap items-center gap-2">
          <a href="#/dog/${esc(d.id)}" class="font-semibold link link-hover min-w-0 break-words">${esc(d.name)}</a>
          <span class="badge badge-outline font-mono">${esc(d.kennel)}</span>
          <span class="text-sm text-base-content/70 min-w-0">${esc(owner(d.owner).name)} · <span class="tabular-nums">${esc(owner(d.owner).phone)}</span></span>
          <span class="ml-auto">${overdueBadge(d)}</span>
        </li>`).join("")}</ul>`;

      <section class="card bg-base-100 border border-base-300"><div class="card-body">
        <h2 class="card-title text-2xl"><i data-lucide="alarm-clock" class="size-5"></i>Overdue pickups</h2>
        ${overdueList}
      </div></section>
