import { signal } from "@techgoose-labs/sprig";

/** The route segment the shell is showing; `dog` detail highlights Board. */
export type View = "board" | "summary" | "dog";

/**
 * The view for an app path (main.ts routes, mounted at /ui: `/ui`, `/ui/summary`,
 * `/ui/dog/:id`), or null when the path is not one of the app's routes.
 */
function viewFor(pathname: string): View | null {
  const [lead, base, page, id, ...rest] = pathname.replace(/\/+$/, "").split("/");
  if (lead !== "" || base !== "ui" || rest.length) return null;
  if (page === undefined) return "board";
  if (page === "summary" && id === undefined) return "summary";
  if (page === "dog" && id) return "dog";
  return null;
}

/**
 * main-nav — the Board / Day summary route links. It lives in the shell, which has
 * no route data, so at hydration `view` is read from location.pathname (SSR renders
 * the "board" default). Every link is a full document load, so hydration runs once
 * per route. A non-app path (the isolate preview) leaves the seeded value alone.
 * A click moves the active link at once, before the navigation lands.
 */
export default class MainNav {
  view = signal<View>("board");

  /** The link that reads as active: dog detail belongs to the board. */
  active(): "board" | "summary" | string {
    const v = this.view();
    return v === "dog" ? "board" : v;
  }

  go(to: "board" | "summary") {
    this.view.set(to);
  }

  onBrowserInit() {
    const v = viewFor(location.pathname);
    if (v) this.view.set(v);
  }
}
