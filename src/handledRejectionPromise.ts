/**
 * Use this class if you have a promise that might be rejected and that you're
 * not "always" awaiting (or using then).
 * E.g. Consider you're creating a promise that might reject, but only awaiting
 * it later (when it's actually being used). If that promise is rejected
 * between promise creation and promise awaiting, then node.js treats this as
 * "uncaught exception" and immediately exists with exit code 1. To avoid this,
 * just wrap that promise into an HandledRejectionPromise.
 *
 * It is not allowed to use this class to silently ignore exceptions.
 */
export class HandledRejectionPromise<T> {
  private storedPromise: Promise<void>;
  private value:
    | undefined
    | { type: "resolved"; value: T }
    | { type: "rejected"; reason: unknown };

  constructor(promise: Promise<T>) {
    this.storedPromise = promise.then(
      (value) => {
        this.value = { type: "resolved", value };
        return;
      },
      (reason: unknown) => {
        this.value = { type: "rejected", reason };
      }
    );
  }

  /**
   * If you call this, you must also directly await it. Otherwise, you have the
   * same issue again.
   */
  public get promise(): Promise<T> {
    return this.storedPromise.then(() => {
      const value = this.value;
      if (!value) {
        throw new Error(
          "HandledRejectionPromise: expected value after storedPromise settled"
        );
      }

      // eslint-disable-next-line promise/always-return
      switch (value.type) {
        case "resolved":
          return value.value;
        case "rejected":
          throw value.reason;
      }
    });
  }
}
