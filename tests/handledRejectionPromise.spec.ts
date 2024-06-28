import { HandledRejectionPromise } from "../src/handledRejectionPromise";

describe(HandledRejectionPromise.name, () => {
  it("handles resolved Promises", async () => {
    const handled = new HandledRejectionPromise(Promise.resolve(3));

    await expect(handled.promise).resolves.toBe(3);
  });

  it("handles rejected Promises", async () => {
    const handled = new HandledRejectionPromise(
      Promise.reject(new Error("oopsie"))
    );

    await expect(handled.promise).rejects.toThrowErrorMatchingInlineSnapshot(
      `"oopsie"`
    );
  });

  it("handles Promises that resolve (later)", async () => {
    const handled = new HandledRejectionPromise(
      new Promise((resolve) => setTimeout(() => resolve(4), 1))
    );

    await expect(handled.promise).resolves.toBe(4);
  });

  it("handles Promises that reject (later)", async () => {
    const handled = new HandledRejectionPromise(
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error("ok")), 1)
      )
    );

    await expect(handled.promise).rejects.toThrowErrorMatchingInlineSnapshot(
      `"ok"`
    );
  });
});
