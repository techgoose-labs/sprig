// Extracted verbatim from spec/ui/kennel-prototype/_test-prototype.html lines 538-544 (renderSummary header + closed alert), 580-592 (closeDay — the transition that inserts the alert) (reference only, not deliverable).
      ${day.closed
        ? `<span class="badge badge-neutral badge-lg"><i data-lucide="lock" class="size-[1em]"></i>Day closed</span>`
        : `<button id="close-day" class="btn btn-primary" ${ui.pendingClose ? "disabled" : ""}>
             ${ui.pendingClose ? `<span class="loading loading-spinner loading-sm"></span>Closing the day…` : `<i data-lucide="lock" class="size-[1.2em]"></i>Close the day`}
           </button>`}
    </div>
    ${day.closed ? `<div role="alert" class="alert alert-soft alert-success mb-5"><i data-lucide="circle-check" class="size-5 shrink-0"></i><span>Today's ledger is locked. Revenue below is final.</span></div>` : ""}

async function closeDay() {
  ui.pendingClose = true;
  render();
  try {
    const reply = await window.commands.run("day.close", { id: failId(ui.data.day.id), closed: true });
    ui.data.day = { ...ui.data.day, ...reply };
    toast("Day closed — ledger locked.", "success");
  } catch {
    toast("The day couldn't be closed — nothing changed.");
  }
  ui.pendingClose = false;
  render();
}
