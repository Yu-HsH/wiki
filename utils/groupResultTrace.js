// Explicit opt-in, development only. Never include payloads, identities or paths.
export function traceGroupResult(event, fields = {}) {
    if (import.meta.env.DEV && localStorage.getItem("wiki-race-group-debug") === "1") {
        console.debug("[group-result]", JSON.stringify({ at: Math.round(performance.now()), event, ...fields }));
    }
}
