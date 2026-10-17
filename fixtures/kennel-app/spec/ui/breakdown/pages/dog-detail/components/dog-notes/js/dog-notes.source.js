// Extracted verbatim from spec/ui/kennel-prototype/_test-prototype.html — notes card: helpers, toast(), notes list + notes section, addNote, failId, demo-fail wiring. Reference only (not deliverable).

// ---- lines 262-264 ----
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const when = (iso) => new Date(iso + "Z").toLocaleString("en-US", { timeZone: "UTC", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// ---- lines 275-282 ----
function toast(msg, kind = "error") {
  const el = document.createElement("div");
  el.className = `alert alert-${kind} shadow-sm max-w-xs`;
  el.innerHTML = `<i data-lucide="${kind === "error" ? "circle-alert" : "circle-check"}" class="size-5 shrink-0"></i><span>${esc(msg)}</span>`;
  document.getElementById("toasts").appendChild(el);
  lucide.createIcons();
  setTimeout(() => el.remove(), 3500);
}

// ---- lines 405-418 ----
  const notes = d.notes.length === 0
    ? `<li class="text-base-content/60 italic py-3">No notes yet — add the first one below.</li>`
    : d.notes.map((n) => `
      <li class="py-3 ${n.pending ? "opacity-50" : ""}">
        <p class="break-words">${esc(n.text)}</p>
        <p class="text-xs text-base-content/60 mt-1">${esc(n.author)} · ${n.pending ? "saving…" : n.at ? esc(when(n.at)) : "just now"}</p>
      </li>`).join("");
  $app.innerHTML = `
    <a href="#/board" class="btn btn-ghost btn-sm mb-3 -ml-2"><i data-lucide="arrow-left" class="size-[1.2em]"></i>Board</a>
    <div class="flex flex-wrap items-center gap-3 mb-5">
      <h1 class="font-display text-4xl md:text-5xl break-words min-w-0">${esc(d.name)}</h1>
      <div class="flex flex-wrap gap-2">${badge(d.status)} ${overdueBadge(d)}</div>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">

// ---- lines 460-474 ----
      <section class="card bg-base-100 border border-base-300 lg:col-span-3">
        <div class="card-body">
          <h2 class="card-title text-2xl"><i data-lucide="notebook-pen" class="size-5"></i>Notes <span class="badge badge-sm">${d.notes.length}</span></h2>
          <ul class="divide-y divide-base-content/10">${notes}</ul>
          <form id="note-form" class="flex flex-col md:flex-row gap-2 mt-2">
            <input name="author" class="input md:w-48" value="Front desk" aria-label="Author" required />
            <input name="text" class="input md:flex-1 w-full" placeholder="Add a handling note…" aria-label="Note" required />
            <button class="btn btn-soft btn-secondary"><i data-lucide="plus" class="size-[1.2em]"></i>Add note</button>
          </form>
        </div>
      </section>
    </div>`;
  $app.querySelectorAll("[data-cmd]").forEach((b) => b.addEventListener("click", () => runStatus(d, b.dataset.cmd)));
  document.getElementById("note-form").addEventListener("submit", (e) => { e.preventDefault(); addNote(d, e.target); });
}

// ---- lines 478-478 ----
const failId = (id) => { if (!ui.failNext) return id; ui.failNext = false; document.getElementById("demo-fail").checked = false; return id + "-unreachable"; };

// ---- lines 494-511 ----
async function addNote(d, form) {
  const text = form.text.value.trim(), author = form.author.value.trim();
  if (!text) return;
  const temp = { id: "pending", text, author, pending: true };
  d.notes = [...d.notes, temp];
  render();
  try {
    const reply = await window.commands.run("dog.addNote", { id: failId(d.id), text, author });
    d.notes = d.notes.map((n) => (n === temp ? reply : n));
  } catch {
    d.notes = d.notes.filter((n) => n !== temp);
    render();
    document.querySelector('#note-form [name="text"]').value = text;
    toast(`Note for ${d.name} wasn't saved — it's back in the box.`);
    return;
  }
  render();
}

// ---- lines 624-624 ----
document.getElementById("demo-fail").addEventListener("change", (e) => { ui.failNext = e.target.checked; });
