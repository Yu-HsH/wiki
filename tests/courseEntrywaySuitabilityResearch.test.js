import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessGoalEntryway, summarizeEntrywayValidation, gatewaySourceKind } from "../utils/courseEntrywayResearch.js";
import { proposeTargetHandling } from "../utils/courseTargetSuitabilityResearch.js";

const cases = JSON.parse(readFileSync(new URL("../data/research/entryway-validation-17-group-courses-20261107.json", import.meta.url), "utf8")).cases;
const find = (start, goal) => {
  const item = cases.find(row => row.start === start && row.goal === goal);
  assert.ok(item, "missing study course "+start+" → "+goal);
  return item;
};

test("17 room cohorts include severe outcomes and successful controls", () => {
  assert.equal(cases.length, 17);
  assert.deepEqual(summarizeEntrywayValidation(cases).observedNoFinisherRooms, 3);
  assert.equal(summarizeEntrywayValidation(cases).noFinisherWithCachedGap, 3);
  assert.equal(summarizeEntrywayValidation(cases).anyFinisherWithCachedGap, 0);
  assert.ok(cases.some(row => row.players===6 && row.finished===6 && row.cachedIncomingSources<=2));
});
test("missing cache inbound is not a statement about real Wikipedia reachability", () => {
  for (const [start, goal] of [["강감찬", "Shut up"], ["영남대학교", "곁주머니"], ["육회", "섹시"]]) {
    const evaluation = assessGoalEntryway(find(start, goal));
    assert.equal(evaluation.reviewState, "need_external_backlinks");
    assert.equal(evaluation.globallyReachable, null);
    assert.equal(evaluation.autoReject, false);
    assert.ok(evaluation.flags.includes("CACHED_INBOUND_NOT_OBSERVED"));
  }
});
test("calendar-only gateway is separated from low inbound counts", () => {
  const research = assessGoalEntryway(find("바람막이", "문혁 (배우)"));
  assert.equal(research.reviewState, "review_calendar_bottleneck");
  assert.deepEqual(research.candidateSourceKinds, { calendar: 1, indexOrList: 0, encyclopediaArticle: 0 });
  assert.ok(research.flags.includes("NO_CACHED_INBOUND_IN_FIRST_50"));
  assert.equal(gatewaySourceKind("1981년"), "calendar");
  assert.equal(gatewaySourceKind("2월 11일"), "calendar");
  assert.equal(gatewaySourceKind("대한민국의 기업 목록"), "index_or_list");
});
test("good courses with 1-2 observed incoming sources are not automatically removed", () => {
  const row = find("서부저지고릴라", "젤다의 전설 시간의 오카리나");
  assert.equal(row.players,6);
  assert.equal(row.finished,6);
  assert.equal(row.cachedIncomingSources,2);
  const result = assessGoalEntryway(row);
  assert.equal(result.reviewState, "no_strong_cached_warning");
  assert.equal(result.autoReject,false);
});
test("late links in a real mixed group race are a warning, not proven failure", () => {
  const row = find("셜록 홈즈", "포메라니안");
  assert.equal(row.finished,3);
  const report = assessGoalEntryway(row);
  assert.equal(report.reviewState, "review_link_visibility");
  assert.equal(report.sampleComplete,true);
  assert.ok(report.flags.includes("ALL_CACHED_GATEWAYS_LATE_BY_ANCHOR_ORDER"));
  assert.equal(report.difficultyScore,null);
  assert.equal(report.autoReject,false);
});
test("visible synonym label is separate evidence, never automatic block", () => {
  const evidence = assessGoalEntryway(find("커피", "쿠로바 카이토"));
  assert.ok(evidence.flags.includes("GATEWAY_LABEL_ALIAS"));
  assert.equal(evidence.reviewState, "no_strong_cached_warning");
});
test("a less successful room can look fine by simplistic gateway counts", () => {
  const row = find("아르헨티노사우루스", "하품");
  assert.equal(row.finished,1);
  const report = assessGoalEntryway(row);
  assert.equal(report.reviewState, "no_strong_cached_warning");
  assert.equal(report.autoReject,false);
});
test("capped candidate set never claims all cached source kinds were measured", () => {
  const r = assessGoalEntryway(find("MOSFET", "카카오 (기업)"));
  assert.equal(r.sampleComplete,false);
  assert.ok(r.flags.includes("INBOUND_SAMPLE_CAPPED"));
  assert.equal(r.autoReject,false);
});
test("confirmed disambiguation is document identity, not sexual-content classification", () => {
  const value = proposeTargetHandling(
    { pageprops:{disambiguation:true}, contentReview:{tier:"unreviewed"} },
    { surface:"automatic_target" },
  );
  assert.equal(value.proposal,"exclude_from_automatic_target_pool");
  assert.ok(value.issues.includes("VERIFIED_DISAMBIGUATION_NOT_SAFETY"));
  assert.ok(value.issues.includes("CONTENT_UNREVIEWED"));
  assert.equal(value.enforcementActive,false);
});
test("user-chosen ambiguous articles keep their selection, receive explanation", () => {
  const value = proposeTargetHandling({ pageprops:{disambiguation:true} },{surface:"user_selected"});
  assert.equal(value.proposal,"explain_disambiguation_without_replacing_goal");
  assert.equal(value.automaticRejectionActive,false);
});
test("sensitive confirmed content is treated differently on auto/public/custom surfaces", () => {
  const reviewed = {pageprops:{disambiguation:false},contentReview:{tier:"explicit_or_high_risk",reviewed:true}};
  assert.equal(proposeTargetHandling(reviewed,{surface:"automatic_target"}).proposal,"exclude_from_automatic_target_pool");
  assert.equal(proposeTargetHandling(reviewed,{surface:"public_room"}).proposal,"do_not_publish_goal_in_public_lobby");
  assert.equal(proposeTargetHandling(reviewed,{surface:"user_selected"}).proposal,"confirm_product_policy_before_acceptance");
  assert.equal(proposeTargetHandling(reviewed,{surface:"article_navigation"}).proposal,"preserve_existing_navigation");
});
test("unreviewed title, regex match, or unverified AI guess cannot silently become confirmed unsafe", () => {
  for (const value of [
    {title:"성교육", contentReview:{tier:"explicit_or_high_risk",reviewed:false}},
    {title:"임상 의학",contentReview:{tier:"explicit_or_high_risk"}},
    {title:"수간",contentReview:{tier:"unreviewed"}},
  ]) {
    const result=proposeTargetHandling(value,{surface:"automatic_target"});
    assert.equal(result.reviewedTier,"unreviewed");
    assert.equal(result.proposal,"no_automatic_block");
    assert.equal(result.enforcementActive,false);
  }
});
test("non-graphic historical/clinical education is not blindly excluded", () => {
  const value={contentReview:{tier:"sensitive_non_graphic",reviewed:true}};
  assert.equal(proposeTargetHandling(value,{surface:"automatic_target"}).proposal,"manual_policy_review_before_default_feature");
  assert.equal(proposeTargetHandling(value,{surface:"user_selected"}).proposal,"context_notice_optional");
});
test("article navigation and server authority are untouched by suitability proposal", () => {
  const proposal=proposeTargetHandling({contentReview:{tier:"explicit_or_high_risk",reviewed:true}},{surface:"article_navigation"});
  assert.equal(proposal.proposal,"preserve_existing_navigation");
  assert.equal(proposal.enforcementActive,false);
});
test("invalid surface triggers explicit error; avoid hidden fallback policy", () => {
  assert.throws(()=>proposeTargetHandling({}, {surface:"unknown"}),/INVALID_TARGET_SURFACE/);
});
test("research dataset excludes identities and path telemetry", () => {
  for(const row of cases){
    assert.match(row.caseId,/^G\d{2}$/);
    for(const k of ["room_id","user_id","nickname","path_titles","userId","roomId","run_id","guest_token"]){
      assert.ok(!Object.hasOwn(row,k),k);
    }
    assert.equal(row.players,row.finished+row.retired);
  }
});
