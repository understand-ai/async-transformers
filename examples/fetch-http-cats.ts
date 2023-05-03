import { PromiseWrapper, asyncBufferedTransformer } from "../dist";
import fetch from "node-fetch";

async function* streamAllHttpCats(): AsyncIterable<
  PromiseWrapper<{
    status: number;
    responseStatus: number;
    body: ArrayBuffer | undefined;
  }>
> {
  for (let status = 100; status < 600; status += 1) {
    // Note the wrapping into an object with the `promise` property
    yield {
      promise: (async () => {
        console.log(`Fetching http cat for status ${status}`);
        const response = await fetch(`https://http.cat/${status}`);
        return {
          status,
          responseStatus: response.status,
          body: response.ok ? await response.arrayBuffer() : undefined,
        };
      })(),
    };
  }
}

const main = async () => {
  // must be >= 2 for the parallel execution to make sense (otherwise throws an Error)
  const numberOfParallelExecutions = 7;
  for await (const { status, responseStatus, body } of asyncBufferedTransformer(
    streamAllHttpCats(),
    { numberOfParallelExecutions }
  )) {
    if (body) {
      console.log(`Status ${status} has body of length ${body.byteLength}`);
    } else {
      console.log(`Status ${status} failed with status code ${responseStatus}`);
    }
  }
};

main().catch(console.log);
