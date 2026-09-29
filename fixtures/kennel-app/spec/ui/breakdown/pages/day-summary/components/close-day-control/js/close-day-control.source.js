// Extracted verbatim from spec/ui/kennel-prototype/_test-prototype.html — close-day control: renderSummary header (536-543) + listener, closeDay(), toast(), failId, render/setDemo. Reference only (not deliverable).

// ---- lines 275-282 ----
function toast(msg, kind = "error") {
  const el = document.createElement("div");
  el.className = `alert alert-${kind} shadow-sm max-w-xs`;
  el.innerHTML = `<i data-lucide="${kind === "error" ? "circle-alert" : "circle-check"}" class="size-5 shrink-0"></i><span>${esc(msg)}</span>`;
  document.getElementById("toasts").appendChild(el);
  lucide.createIcons();
  setTimeout(() => el.remove(), 3500);
}

// ---- lines 516-518 ----
function renderSummary() {
  const { day, dog } = ui.data;
  const overdue = dog.filter((d) => d.overdue);   // server-decided flag — no date math here

// ---- lines 534-546 ----
  $app.innerHTML = `
    <div class="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div><h1 class="font-display text-4xl">Day summary</h1>
        <p class="text-base-content/70">${esc(dayLabel(day.date))}</p></div>
      ${day.closed
        ? `<span class="badge badge-neutral badge-lg"><i data-lucide="lock" class="size-[1em]"></i>Day closed</span>`
        : `<button id="close-day" class="btn btn-primary" ${ui.pendingClose ? "disabled" : ""}>
             ${ui.pendingClose ? `<span class="loading loading-spinner loading-sm"></span>Closing the day…` : `<i data-lucide="lock" class="size-[1.2em]"></i>Close the day`}
           </button>`}
    </div>
    ${day.closed ? `<div role="alert" class="alert alert-soft alert-success mb-5"><i data-lucide="circle-check" class="size-5 shrink-0"></i><span>Today's ledger is locked. Revenue below is final.</span></div>` : ""}
    <div class="stats stats-vertical md:stats-horizontal w-full bg-base-100 border border-base-300 mb-5">
      <div class="stat">

// ---- lines 575-577 ----
  const btn = document.getElementById("close-day");
  if (btn) btn.addEventListener("click", closeDay);
}

// ---- lines 578-592 ----

// confirmed feedback: pending state until the reply, then render the server's day.
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

// ---- lines 478-478 ----
const failId = (id) => { if (!ui.failNext) return id; ui.failNext = false; document.getElementById("demo-fail").checked = false; return id + "-unreachable"; };

// ---- lines 597-607 ----
let loadState = "loading";
function render() {
  const [, view = "board", id] = (location.hash.replace(/^#\/?/, "") || "board").match(/^([^/]*)\/?(.*)$/) || [];
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("btn-active", a.dataset.nav === (view === "dog" ? "board" : view)));
  if (loadState === "loading") renderLoading();
  else if (loadState === "error") renderError();
  else if (view === "dog") renderDetail(id);
  else if (view === "summary") renderSummary();
  else renderBoard();
  lucide.createIcons();
}

// ---- lines 624-624 ----
document.getElementById("demo-fail").addEventListener("change", (e) => { ui.failNext = e.target.checked; });
