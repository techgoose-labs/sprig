// Verbatim from _test-prototype.html. Reference only.
// lines 275-282 — toast()
function toast(msg, kind = "error") {
  const el = document.createElement("div");
  el.className = `alert alert-${kind} shadow-sm max-w-xs`;
  el.innerHTML = `<i data-lucide="${kind === "error" ? "circle-alert" : "circle-check"}" class="size-5 shrink-0"></i><span>${esc(msg)}</span>`;
  document.getElementById("toasts").appendChild(el);
  lucide.createIcons();
  setTimeout(() => el.remove(), 3500);
}
// callers — runStatus catch (487-489), addNote catch (503-507), closeDay (580-594)
  } catch (err) {
    Object.assign(d, before);
    toast(`${d.name}: ${STATUS[TARGET[cmd]].label.toLowerCase()} didn't go through — reverted.`);
  } catch {
    d.notes = d.notes.filter((n) => n !== temp);
    render();
    document.querySelector('#note-form [name="text"]').value = text;
    toast(`Note for ${d.name} wasn't saved — it's back in the box.`);
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

// ---------------------------------------------------------------------------
