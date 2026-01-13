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
import type { AsyncBufferedTransformerOptions } from "./asyncBufferedTransformer";
export type PromiseWrapper<T> = {
  promise: Promise<T>;
};

export async function* asyncBufferedUnorderedTransformer<T>(
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
  const buffer = new Set<HandledRejectionPromise<T>>();
  try {
    for await (const wrapper of stream) {
      // Note: here we already pulled a promise _and_ have a buffer of bufferSize promises
      // that's why bufferSize + 1 = numberOfParallelExecutions
      if (buffer.size >= bufferSize) {
        const result = await Promise.any(Array.from(buffer).map(p => p.promise));
        if (result === undefined) {
          throw new Error("Unexpected undefined result from Promise.any");
        }
        buffer.delete(result.wrapper);
        yield result.value;
      }
      buffer.add(new HandledRejectionPromise(wrapper.promise));
    }

    while (buffer.size > 0) {
      const result = await Promise.any(Array.from(buffer).map(p => p.promise));
      if (result === undefined) {
        throw new Error("Unexpected undefined result from Promise.any");
      }
      buffer.delete(result.wrapper);
      yield result.value;
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

