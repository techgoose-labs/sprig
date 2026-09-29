// Extracted verbatim from spec/ui/kennel-prototype/_test-prototype.html lines 262-263 (esc, money), 545-564 (stats block of renderSummary) (reference only, not deliverable).
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

    <div class="stats stats-vertical md:stats-horizontal w-full bg-base-100 border border-base-300 mb-5">
      <div class="stat">
        <div class="stat-figure text-secondary"><i data-lucide="warehouse" class="size-8"></i></div>
        <div class="stat-title">Occupancy</div>
        <div class="stat-value tabular-nums">${esc(day.kennelsUsed)}<span class="text-base font-normal text-base-content/60"> of ${esc(day.kennelsTotal)} kennels</span></div>
        <div class="stat-desc"><progress class="progress progress-secondary w-40" value="${esc(day.occupancyPct)}" max="100"></progress> ${esc(day.occupancyPct)}%</div>
      </div>
      <div class="stat">
        <div class="stat-figure text-success"><i data-lucide="banknote" class="size-8"></i></div>
        <div class="stat-title">Revenue today</div>
        <div class="stat-value tabular-nums">${money(day.revenueToday)}</div>
        <div class="stat-desc">${day.closed ? "Final" : "Settles when the day closes"}</div>
      </div>
      <div class="stat">
        <div class="stat-figure text-error"><i data-lucide="alarm-clock" class="size-8"></i></div>
        <div class="stat-title">Overdue pickups</div>
        <div class="stat-value tabular-nums">${esc(day.overdueCount)}</div>
        <div class="stat-desc">Past their planned check-out</div>
      </div>
    </div>
