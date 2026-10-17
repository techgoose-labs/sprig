// Corpus (legit, REQ-065): a shell nav reads the CURRENT URL with regexes to
// decide which link reads as active — presentation routing, not validation.
// The shape of fixtures/kennel-app main-nav before it was rewritten to split().
import { signal } from "@techgoose-labs/sprig";

type View = "board" | "summary" | "dog";

const BASE = "/ui";
const DOG_ROUTE = /^\/ui\/dog\/[^/]+\/?$/;

function viewFor(pathname: string): View | null {
  if (/^\/ui\/?$/.test(pathname)) return "board";
  if (/^\/ui\/summary\/?$/.test(pathname)) return "summary";
  if (DOG_ROUTE.test(pathname)) return "dog";
  return null;
}

export default class MainNav {
  view = signal<View>("board");
  dogId = signal<string | null>(null);

  onBrowserInit() {
    const v = viewFor(location.pathname);
    if (v) this.view.set(v);
    const m = location.pathname.match(/^\/ui\/dog\/([^/]+)/);
    this.dogId.set(m ? m[1] : null);
    if (new RegExp(`^${BASE}/summary`).test(window.location.href.replace(location.origin, ""))) {
      this.view.set("summary");
    }
    const hashTab = /^#tab-(\w+)$/.exec(location.hash);
    if (hashTab) this.view.set(hashTab[1] as View);
  }
}
