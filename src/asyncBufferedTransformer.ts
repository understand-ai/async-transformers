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

import { HandledRejectionPromise } from "./handledRejectionPromise";

export type PromiseWrapper<T> = {
  promise: Promise<T>;
};

export type AsyncBufferedTransformerOptions = {
  numberOfParallelExecutions: number;
};

export async function* asyncBufferedTransformer<T>(
  stream: Iterable<PromiseWrapper<T>> | AsyncIterable<PromiseWrapper<T>>,
  { numberOfParallelExecutions }: AsyncBufferedTransformerOptions,
  errorLogger: (message: string, ...params: any) => void = console.log
): AsyncIterable<T> {
  if (numberOfParallelExecutions < 0) {
    throw new Error(
      `numberOfParallelExecutions was ${numberOfParallelExecutions}, expected >= 0`
    );
  }

  if (numberOfParallelExecutions === 0 || numberOfParallelExecutions === 1) {
    for await (const wrapper of stream) {
      yield await wrapper.promise;
    }
    return;
  }

  const bufferSize = numberOfParallelExecutions - 1;
  const buffer: (HandledRejectionPromise<T> | undefined)[] = new Array(
    bufferSize
  );
  let index = 0;
  try {
    for await (const wrapper of stream) {
      // Note: here we already pulled a promise _and_ have a buffer of bufferSize promises
      // that's why bufferSize + 1 = numberOfParallelExecutions
      const existingPromise = buffer[index];
      if (existingPromise) {
        yield await existingPromise.promise;
      }

      buffer[index] = new HandledRejectionPromise(wrapper.promise);
      index = (index + 1) % bufferSize;
    }

    const limit = index;
    for (let index = limit; index < bufferSize; index++) {
      const promise = buffer[index];
      if (promise) {
        yield await promise.promise;
      }
    }
    for (let index = 0; index < limit; index++) {
      const promise = buffer[index];
      if (promise) {
        yield await promise.promise;
      }
    }
  } catch (error) {
    errorLogger("asyncBufferedTransformer: caught error, rethrowing:", error);
    // dont get any UnhandledPromiseRejection errors
    const promiseResults = await Promise.allSettled(buffer);
    const logOutput: { reason: string }[] = promiseResults.filter(
      (p) => !!p && p.status === "rejected"
    ) as {
      reason: string;
    }[];
    if (logOutput.length > 0) {
      errorLogger(
        "asyncBufferedTransformer: caught additional errors, *NOT* rethrowing:",
        logOutput
      );
    }
    throw error;
  }
}

export const drainStream = async <T>(
  streamToDrain: AsyncIterable<T> | Iterable<T>
): Promise<void> => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _ of streamToDrain) {
    //we just drain
  }

  return;
};

export const collectAll = async <T>(
  streamToCollect: AsyncIterable<T> | Iterable<T>
): Promise<T[]> => {
  const results = [];
  for await (const output of streamToCollect) {
    results.push(output);
  }

  return results;
};
