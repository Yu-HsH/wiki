/**
 * Proposed Wiki Race *target presentation* policy, not a live content filter.
 * Separate encyclopedia content suitability from graph/difficulty evidence.
 *
 * Never infer sexual/violent/hateful content solely from a word or category.
 * Automatic course generation and user-selected goals have different rules.
 * The existing game's allowed-link graph is deliberately untouched.
 */
const VALID_SURFACES = new Set(["automatic_target", "public_room", "user_selected", "article_navigation"]);
const VALID_REVIEW_TIERS = new Set(["unreviewed", "standard_encyclopedic", "sensitive_non_graphic", "explicit_or_high_risk"]);
export function proposeTargetHandling(
  evidence,
  { surface = "automatic_target" } = {},
) {
  if (!VALID_SURFACES.has(surface)) throw new Error("INVALID_TARGET_SURFACE");
  const props = evidence?.pageprops;
  const disambiguation = props && typeof props.disambiguation === "boolean"
    ? props.disambiguation : null;
  const tier = VALID_REVIEW_TIERS.has(evidence?.contentReview?.tier)
    ? evidence.contentReview.tier : "unreviewed";
  const reviewConfirmed = evidence?.contentReview?.reviewed === true;
  // A classifier guess or a category keyword is never treated as confirmed.
  const reviewedTier = reviewConfirmed ? tier : "unreviewed";
  const issues = [];
  if (disambiguation === true) issues.push("VERIFIED_DISAMBIGUATION_NOT_SAFETY");
  if (reviewedTier === "explicit_or_high_risk") issues.push("CONFIRMED_CONTENT_SENSITIVITY");
  if (reviewedTier === "sensitive_non_graphic") issues.push("CONTEXT_WARNING_CANDIDATE");
  if (reviewedTier === "unreviewed") issues.push("CONTENT_UNREVIEWED");

  let proposal = "no_automatic_block";
  if (surface === "article_navigation") {
    proposal = "preserve_existing_navigation";
  } else if (surface === "automatic_target") {
    if (disambiguation === true || reviewedTier === "explicit_or_high_risk") {
      proposal = "exclude_from_automatic_target_pool";
    } else if (reviewedTier === "sensitive_non_graphic") {
      proposal = "manual_policy_review_before_default_feature";
    } else {
      proposal = "no_automatic_block";
    }
  } else if (surface === "public_room") {
    proposal = reviewedTier === "explicit_or_high_risk"
      ? "do_not_publish_goal_in_public_lobby"
      : disambiguation === true ? "require_goal_clarity_review" : "no_automatic_block";
  } else if (surface === "user_selected") {
    proposal = reviewedTier === "explicit_or_high_risk"
      ? "confirm_product_policy_before_acceptance"
      : reviewedTier === "sensitive_non_graphic" ? "context_notice_optional"
      : disambiguation === true ? "explain_disambiguation_without_replacing_goal"
      : "no_automatic_block";
  }
  return {
    surface, issues, proposal,
    disambiguation, reviewedTier,
    // Live integration must be separately approved with reliable classification,
    // age/accessibility policy, privacy review, and tests. This proposes actions only.
    enforcementActive: false,
    automaticRejectionActive: false,
    outputKind: "POLICY_RESEARCH_ONLY",
  };
}
