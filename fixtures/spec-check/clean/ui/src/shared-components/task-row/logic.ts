export default class TaskRow {
  done = false;
  title = "";
  toggle() {
    this.done = !this.done;
  }
}
