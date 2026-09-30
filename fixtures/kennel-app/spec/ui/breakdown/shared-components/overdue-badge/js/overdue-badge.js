// Extracted verbatim from spec/ui/kennel-prototype/_test-prototype.html — REFERENCE ONLY, not deliverable.
// Unit: overdue-badge. Rendered only when dog.overdue is true (server-decided); suffix " · <overdueBy>" only when overdueBy is set.

// _test-prototype.html lines 262-262
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// _test-prototype.html lines 270-271
const overdueBadge = (d) => d.overdue
  ? `<span class="badge badge-error whitespace-nowrap"><i data-lucide="alarm-clock" class="size-[1em]"></i>Overdue${d.overdueBy ? " · " + esc(d.overdueBy) : ""}</span>` : "";
