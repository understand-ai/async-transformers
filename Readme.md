# Async Transformers

![lint/build/test](https://github.com/understand-ai/async-transformers/actions/workflows/node.js.yml/badge.svg)

We find node.js [streams](https://nodejs.org/api/stream.html) are hard to use and implementing them correctly yourself adds a lot of boilerplate.

Once you have implemented a fully-compliant stream interface you will also find that actually executing parts of the streamed-processing-chain in parallel, e.g. io-bound tasks like network requests, is not supported out-of-the-box by node.js

Instead, [async generators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncGenerator) are a lot easier to reason about and write even when consuming native streams.

### Enter async-transformers

Async-Transformers is a tiny no-frills no-dependencies ts-first implementation of a buffered asynchronous generator.

* It will queue up numberOfParallelExecutions promises from a user-provided stream/generator up to the specified maximum number.

![Overview of async transformer functionality](./assets/async-transformers.png)

The method `asyncBufferedTransformer()` was inspired by [rust futures `buffered()`](https://docs.rs/futures/latest/futures/stream/trait.StreamExt.html#method.buffered).

## Usage

```bash
npm add @understand-ai/async-transformer
```

Here's an example that downloads all status code images from [http.cat](https://http.cat), but only 7 at a time to be a good
internet citizen.

You can run this using `npx ts-node examples/fetch-http-cats.ts`

(Note: this library does _not_ depend on nodejs (and has zero dependencies), just this example)

```typescript
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
```

Example output:

```
# npx ts-node examples/fetch-http-cats.ts
Fetching http cat for status 100
Fetching http cat for status 101
Fetching http cat for status 102
Fetching http cat for status 103
Fetching http cat for status 104
Fetching http cat for status 105
Fetching http cat for status 106
Status 100 has body of length 38059
Fetching http cat for status 107
Status 101 has body of length 37527
Fetching http cat for status 108
Status 102 has body of length 45702
Fetching http cat for status 109
Status 103 has body of length 27995
Fetching http cat for status 110
Status 104 failed with status code 404
Fetching http cat for status 111
Status 105 failed with status code 404
```

We also provide the convenience functions `drainStream` and `collectAll` to easily collect all requests

```typescript
//will resolve once all elements have been processed or reject the first time there is an error in any processed chunk
await drainStream(asyncBufferedTransformer(yourAsyncGenerator(inputStream), {
    noOfParallelExecutions
}))

//will resolve with all outputs in-order
const results = await collectAll(asyncBufferedTransformer(yourAsyncGenerator(inputStream), {
    noOfParallelExecutions
}))
```
