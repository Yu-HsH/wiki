import test from "node:test";
import assert from "node:assert/strict";

import { formatGroupRetireReason } from "../utils/groupResultFormatter.js";

test("그룹 RETIRE 사유는 서버 enum을 사용자 문구로 변환한다", () => {
  assert.equal(formatGroupRetireReason("time_limit"), "제한 시간 초과");
  assert.equal(formatGroupRetireReason("grace_timeout"), "유예 시간 초과");
  assert.equal(formatGroupRetireReason("forfeited"), "기권");
  assert.equal(formatGroupRetireReason("left"), "게임 이탈");
  assert.equal(formatGroupRetireReason("disconnected_timeout"), "연결 끊김");
  assert.equal(formatGroupRetireReason("unexpected"), "경기 미완주");
});
