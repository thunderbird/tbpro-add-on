export class Timer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private callback?: () => void | null;
  private readonly delay: number = 3000;

  constructor() {}

  start(callback?: () => void): void {
    this.callback = callback;
    // Clear existing timer if any
    if (this.timer) {
      clearTimeout(this.timer);
    }
    // Start new timer
    this.timer = setTimeout(() => {
      if (this.callback) {
        this.callback();
      }
      this.timer = null;
    }, this.delay);
  }

  restart(): void {
    this.start(this.callback);
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
