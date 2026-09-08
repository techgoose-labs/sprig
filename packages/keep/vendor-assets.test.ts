// The renderer injects `<script defer src="<base>/_assets/vendor/apexcharts.js">`
// into EVERY page head (compiler documentHead), so the serving path must answer
// that URL from the in-source VENDOR map — the app's build output never
// contains the vendored libs ("the server hands over its own bundled copy; the
// app never emits it").
//
// This used to be three tests, because there were three serving paths that had
// to agree: `serveSprig`, the `api.compose` seam, and the `sprigUi` middleware
// — and two of them shipped BROKEN (both fell through to the static dir and
// 404'd on every page load; infra buglist: "sprig: api.compose misses the
// vendor asset route"). There is one path now, so there is nothing left to fall
// out of lockstep, and that class of bug cannot recur.
import { assert, assertEquals } from "jsr:@std/assert";
import { Frontend } from "./mod.ts";
import type { SprigApp } from "@mrg-keystone/sprig";

const fakeApp: SprigApp = {
  fetch: () => Promise.resolve(new Response("SSR", { status: 200 })),
} as unknown as SprigApp;

const get = (p: string) => new Request("http://host" + p);
const VENDOR_PATH = "/ui/_assets/vendor/apexcharts.js";
const MISSING_VENDOR_PATH = "/ui/_assets/vendor/definitely-not-vendored.js";

async function assertVendorServed(res: Response, who: string) {
  assertEquals(
    res.status,
    200,
    `${who}: the vendored lib the renderer injects on every page must be served`,
  );
  assertEquals(
    res.headers.get("content-type"),
    "text/javascript; charset=utf-8",
  );
  assert(
    (await res.text()).length > 0,
    `${who}: non-empty body — the server's own bundled copy`,
  );
}

Deno.test("the one serving path answers the vendored lib from the VENDOR map", async () => {
  const ui = Frontend({ app: fakeApp }).handler;
  await assertVendorServed(await ui(get(VENDOR_PATH)), "Frontend");
});

Deno.test("an unknown vendored name is a handled 404, never the static-dir fall-through", async () => {
  const res = await Frontend({ app: fakeApp }).handler(
    get(MISSING_VENDOR_PATH),
  );
  assertEquals(res.status, 404);
  await res.body?.cancel();
});
