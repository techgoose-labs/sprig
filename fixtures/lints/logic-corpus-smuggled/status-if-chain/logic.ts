// Corpus (smuggled): plan limits decided per subscription state.
import { signal } from "@techgoose-labs/sprig";

type Subscription = { state: string };

export default class Limits {
  sub: Subscription = { state: "trialing" };
  maxProjects = signal(0);

  onBrowserInit() {
    if (this.sub.state === "trialing") {
      this.maxProjects.set(3);
    } else if (this.sub.state === "active") {
      this.maxProjects.set(50);
    } else {
      this.maxProjects.set(0);
    }
  }
}
