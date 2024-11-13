/*
Copyright © 2023 understandAI GmbH

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files
(the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify,
merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

import { asyncBufferedTransformer, PromiseWrapper } from "../src";
import { sleep } from "./sleep";
import { collectAll, drainStream } from "../src/asyncBufferedTransformer";
import { randomInt } from "crypto";

type ProcessingCounts = {
  asyncProcessorsStarted: number;
  asyncProcessorsRunning: number;
  maxAsyncProcessorsRunning: number;
};

type Fullfill = {
  resolve: () => void;
  reject: (error: Error) => void;
};

async function* asyncProcessor(
  numberOfItems: number,
  counts: ProcessingCounts,
  fullfills: Fullfill[]
): AsyncIterable<PromiseWrapper<number>> {
  for (let i = 0; i < numberOfItems; i += 1) {
    const value = i;
    const promise = new Promise<number>((resolve, reject) => {
      counts.asyncProcessorsStarted += 1;
      counts.asyncProcessorsRunning += 1;
      counts.maxAsyncProcessorsRunning = Math.max(
        counts.maxAsyncProcessorsRunning,
        counts.asyncProcessorsRunning
      );
      fullfills.push({
        resolve: () => {
          counts.asyncProcessorsRunning -= 1;
          resolve(value);
        },
        reject,
      });
    });
    yield { promise };
  }
}

function* syncProcessor(
  numberOfItems: number,
  counts: ProcessingCounts,
  fullfills: Fullfill[]
): Iterable<PromiseWrapper<number>> {
  for (let i = 0; i < numberOfItems; i += 1) {
    const value = i;
    const promise = new Promise<number>((resolve, reject) => {
      counts.asyncProcessorsStarted += 1;
      counts.asyncProcessorsRunning += 1;
      counts.maxAsyncProcessorsRunning = Math.max(
        counts.maxAsyncProcessorsRunning,
        counts.asyncProcessorsRunning
      );
      fullfills.push({
        resolve: () => {
          counts.asyncProcessorsRunning -= 1;
          resolve(value);
        },
        reject,
      });
    });
    yield { promise };
  }
}

const resolveAll = async (
  numberOfItems: number,
  fullfills: Fullfill[]
): Promise<void> => {
  while (numberOfItems > 0) {
    await sleep(5);

    if (fullfills.length == 0) {
      continue;
    }

    const index = randomInt(fullfills.length);
    const fullfill = fullfills.splice(index, 1);
    fullfill[0].resolve();
    numberOfItems -= 1;
  }
};

const rejectOneAtIndex = async ({
  rejectAfter,
  error,
  numberOfItems,
  fullfills,
}: {
  rejectAfter: number;
  error: string;
  numberOfItems: number;
  fullfills: Fullfill[];
}): Promise<void> => {
  let numResolved = 0;
  while (numberOfItems > 0) {
    await sleep(5);

    if (fullfills.length == 0) {
      continue;
    }

    const fullfill = fullfills.splice(0, 1);
    if (numResolved === rejectAfter) {
      const errorObject = new Error(error);
      fullfill[0].reject(errorObject);
      break;
    } else {
      fullfill[0].resolve();
      numResolved += 1;
    }
    numberOfItems -= 1;
  }

  // resolve remaining promises
  for (const fullfill of fullfills) {
    // TODO: Is this enough? Must the stream that generates the fullfills signal that it's done?
    fullfill.resolve();
  }
};

describe("asyncBufferedTransformer", () => {
  const numberOfParallelExecutions = 10;

  it.each([-10, -1])(
    "rejects wrong parallel executions",
    async (numberOfParallelExecutions) => {
      const numberOfItems = 50;
      const counts: ProcessingCounts = {
        asyncProcessorsRunning: 0,
        asyncProcessorsStarted: 0,
        maxAsyncProcessorsRunning: 0,
      };
      const fullfills: Fullfill[] = [];

      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of asyncBufferedTransformer(
          asyncProcessor(numberOfItems, counts, fullfills),
          {
            numberOfParallelExecutions,
          }
        )) {
          /* only consume */
        }
      }).rejects.toBeTruthy();
    }
  );

  it.each([asyncProcessor, syncProcessor])(
    "should be able to process in-parallel",
    async (processor) => {
      const numberOfParallelExecutions = 1;
      const numberOfItems = 50;
      const counts: ProcessingCounts = {
        asyncProcessorsRunning: 0,
        asyncProcessorsStarted: 0,
        maxAsyncProcessorsRunning: 0,
      };
      const fullfills: Fullfill[] = [];

      const resolveAllPromise = resolveAll(numberOfItems, fullfills);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of asyncBufferedTransformer(
        processor(numberOfItems, counts, fullfills),
        {
          numberOfParallelExecutions: numberOfParallelExecutions,
        }
      )) {
        // nop
      }

      await resolveAllPromise;

      expect(counts.asyncProcessorsStarted).toEqual(numberOfItems);
      expect(counts.maxAsyncProcessorsRunning).toEqual(
        numberOfParallelExecutions
      );
    }
  );

  it.each([0, 1])(
    "should be able to handle '%s' numberOfParallelExecutions serially",
    async (numberOfParallelExecutions) => {
      const counts: ProcessingCounts = {
        asyncProcessorsRunning: 0,
        asyncProcessorsStarted: 0,
        maxAsyncProcessorsRunning: 0,
      };

      const resolves: Fullfill[] = [];
      const numberOfItems = 20;

      const stream = (async () => {
        let expected = 0;
        for await (const value of asyncBufferedTransformer(
          asyncProcessor(numberOfItems, counts, resolves),
          {
            numberOfParallelExecutions,
          }
        )) {
          expect(value).toEqual(expected);
          expect(value).toBeLessThan(numberOfItems);
          expected += 1;
        }
      })();

      await resolveAll(numberOfItems, resolves);
      await stream;

      expect(counts.maxAsyncProcessorsRunning).toEqual(1);
    }
  );

  it.each([
    0,
    1,
    numberOfParallelExecutions - 1,
    numberOfParallelExecutions,
    numberOfParallelExecutions + 1,
    numberOfParallelExecutions * 2,
  ])(
    "should be able to process %s items in-parallel",
    async (numberOfItems) => {
      const counts: ProcessingCounts = {
        asyncProcessorsRunning: 0,
        asyncProcessorsStarted: 0,
        maxAsyncProcessorsRunning: 0,
      };

      const resolves: Fullfill[] = [];

      const stream = (async () => {
        let expected = 0;
        for await (const value of asyncBufferedTransformer(
          asyncProcessor(numberOfItems, counts, resolves),
          {
            numberOfParallelExecutions: numberOfParallelExecutions,
          }
        )) {
          expect(value).toEqual(expected);
          expect(value).toBeLessThan(numberOfItems);
          expected += 1;
        }
      })();

      const expectedNumberOfParallelExecutions = Math.min(
        numberOfParallelExecutions,
        numberOfItems
      );
      while (
        counts.asyncProcessorsRunning !== expectedNumberOfParallelExecutions
      ) {
        await sleep(5);
      }

      expect(counts.asyncProcessorsRunning).toEqual(
        expectedNumberOfParallelExecutions
      );

      await resolveAll(numberOfItems, resolves);

      await stream;

      expect(counts.maxAsyncProcessorsRunning).toEqual(
        expectedNumberOfParallelExecutions
      );
    }
  );

  it("correctly throws an error if the processing throws at some point", async () => {
    const numberOfItems = 50;
    const counts: ProcessingCounts = {
      asyncProcessorsRunning: 0,
      asyncProcessorsStarted: 0,
      maxAsyncProcessorsRunning: 0,
    };

    const fullfills: Fullfill[] = [];
    const error = "some error";

    const rejectAfter = 11;
    const fullfilledAll = rejectOneAtIndex({
      rejectAfter: rejectAfter,
      error,
      numberOfItems,
      fullfills,
    });

    const numberOfParallelExecutions = 10;
    const stream = asyncBufferedTransformer(
      asyncProcessor(numberOfItems, counts, fullfills),
      {
        numberOfParallelExecutions: numberOfParallelExecutions,
      }
    );

    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const value of stream) {
        // do nothing
      }
      fail("This should never be executed");
    } catch (actualError: any) {
      expect(actualError.message).toBe(error);
    }

    await fullfilledAll;

    expect(counts.asyncProcessorsStarted).toEqual(
      rejectAfter + numberOfParallelExecutions
    );
  });

  describe("when draining", () => {
    it("resolves if all processors were started", async () => {
      const numberOfParallelExecutions = 10;
      const numberOfItems = 50;
      const counts: ProcessingCounts = {
        asyncProcessorsRunning: 0,
        asyncProcessorsStarted: 0,
        maxAsyncProcessorsRunning: 0,
      };
      const fullfills: Fullfill[] = [];

      const resolveAllPromise = resolveAll(numberOfItems, fullfills);

      await drainStream(
        asyncBufferedTransformer(
          asyncProcessor(numberOfItems, counts, fullfills),
          {
            numberOfParallelExecutions: numberOfParallelExecutions,
          }
        )
      );

      await resolveAllPromise;

      expect(counts.asyncProcessorsStarted).toEqual(numberOfItems);
    });

    it("correctly throws an error if the processing throws at some point", async () => {
      const rejectAfter = 20;
      const numberOfItems = 50;
      const counts: ProcessingCounts = {
        asyncProcessorsRunning: 0,
        asyncProcessorsStarted: 0,
        maxAsyncProcessorsRunning: 0,
      };
      const numberOfParallelExecutions = 10;

      const fullfills: Fullfill[] = [];
      const error = "some great error";

      const fullfillAllUntil = rejectOneAtIndex({
        rejectAfter,
        error,
        numberOfItems,
        fullfills,
      });

      await expect(
        drainStream(
          asyncBufferedTransformer(
            asyncProcessor(numberOfItems, counts, fullfills),
            {
              numberOfParallelExecutions,
            }
          )
        )
      ).rejects.toEqual(new Error(error));

      await fullfillAllUntil;

      expect(counts.asyncProcessorsStarted).toEqual(
        rejectAfter + numberOfParallelExecutions
      );
    });
  });

  describe("collectAll", () => {
    it("correctly resolves with all entries in-order", async () => {
      const numberOfItems = 10;
      const counts: ProcessingCounts = {
        asyncProcessorsRunning: 0,
        asyncProcessorsStarted: 0,
        maxAsyncProcessorsRunning: 0,
      };
      const fullfills: Fullfill[] = [];
      const resolveAllPromise = resolveAll(numberOfItems, fullfills);

      await expect(
        collectAll(
          asyncBufferedTransformer(
            asyncProcessor(numberOfItems, counts, fullfills),
            {
              numberOfParallelExecutions: 10,
            }
          )
        )
      ).resolves.toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

      await resolveAllPromise;
    });

    it("correctly throws an error if the processing throws at some point", async () => {
      const numberOfItemsBeforeThrowing = 20;
      const numberOfItems = 50;
      const counts: ProcessingCounts = {
        asyncProcessorsRunning: 0,
        asyncProcessorsStarted: 0,
        maxAsyncProcessorsRunning: 0,
      };

      const fullfills: Fullfill[] = [];
      const error = "some great error";
      const fullfillAllUntil = rejectOneAtIndex({
        rejectAfter: numberOfItemsBeforeThrowing,
        error,
        numberOfItems,
        fullfills,
      });

      await expect(
        collectAll(
          asyncBufferedTransformer(
            asyncProcessor(numberOfItems, counts, fullfills),
            {
              numberOfParallelExecutions: 10,
            }
          )
        )
      ).rejects.toEqual(new Error(error));

      await fullfillAllUntil;
    });
  });

  it("does not produce unhandled promise rejections", async () => {
    let didReject = false;

    const secondPromiseThrows = async function* (): AsyncIterable<
      PromiseWrapper<string>
    > {
      yield {
        // eslint-disable-next-line no-async-promise-executor
        promise: new Promise(async (resolve) => {
          while (!didReject) {
            await sleep(1);
          }
          resolve("done");
        }),
      };
      yield {
        promise: new Promise((_resolve, reject) => {
          setTimeout(() => {
            didReject = true;
            reject("we immediately reject before first await");
          }, 3);
        }),
      };
    };

    await expect(
      collectAll(
        asyncBufferedTransformer(secondPromiseThrows(), {
          numberOfParallelExecutions: 10,
        })
      )
    ).rejects.toBeTruthy();
  });

  it("can collect / drain an iterable as well", async () => {
    const iterable = function* (): Iterable<string> {
      yield "something";
    };

    const collected = await collectAll(iterable());

    expect(collected).toEqual(["something"]);
    await expect(drainStream(iterable())).resolves.toBeUndefined();
  });
});
