export function createLatestRequestManager() {
  let generation = 0;
  let controller = null;

  return {
    begin() {
      controller?.abort();
      controller = new AbortController();
      generation += 1;
      return { id: generation, signal: controller.signal };
    },
    isCurrent(requestId) {
      return requestId === generation;
    },
    complete(requestId) {
      if (requestId === generation) controller = null;
    },
    cancel() {
      generation += 1;
      controller?.abort();
      controller = null;
    },
  };
}

export function isAbortError(error) {
  return error?.name === "AbortError" || error?.code === 20;
}
