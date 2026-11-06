import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("single click counter only commits after a successful page/move", async () => {
  const source = await readFile(new URL("../pages/GamePage.jsx", import.meta.url), "utf8");
  const start = source.indexOf("const handleMove = useCallback(");
  const end = source.indexOf("\n    },\n    [", start);
  assert.ok(end > start);
  const move = source.slice(start, end);
  const confirmed = move.indexOf("const nextClickCount = authoritativeMove?.run?.move_count ?? clickCount + 1;");
  const counter = move.indexOf("setClickCount(nextClickCount)");
  assert.ok(start >= 0 && confirmed > 0 && counter > confirmed);
  assert.doesNotMatch(move.slice(0, confirmed), /setClickCount\(/);
  assert.match(move.slice(confirmed, counter), /nextClickCount/);
});
