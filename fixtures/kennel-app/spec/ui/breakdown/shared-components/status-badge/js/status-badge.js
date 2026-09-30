// Extracted verbatim from spec/ui/kennel-prototype/_test-prototype.html — REFERENCE ONLY, not deliverable.
// Unit: status-badge. STATUS map (label/badge classes/lucide icon per status) + badge(status, extra) template; extra is "badge-sm" in the status strip, "" on dog cards/detail. Icons become <svg> via lucide.createIcons() after every render.

// _test-prototype.html lines 244-249
const STATUS = {
  "booked":      { label: "Booked",      badge: "badge-info badge-soft",     icon: "calendar-clock" },
  "checked-in":  { label: "Checked in",  badge: "badge-success badge-soft",  icon: "house" },
  "walking":     { label: "Walking",     badge: "badge-accent",              icon: "footprints" },
  "checked-out": { label: "Checked out", badge: "badge-outline", icon: "log-out" },
};

// _test-prototype.html lines 266-269
const badge = (status, extra = "") => {
  const s = STATUS[status];
  return `<span class="badge ${s.badge} ${extra} whitespace-nowrap"><i data-lucide="${s.icon}" class="size-[1em]"></i>${s.label}</span>`;
};
