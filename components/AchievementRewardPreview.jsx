import React, { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ProfileCard from "./ProfileCard.jsx";
import FinishEffect from "./FinishEffect.jsx";
import ProfileAvatar from "./ProfileAvatar.jsx";
import RewardArtSwatch from "./RewardArtSwatch.jsx";
import { PROFILE_CARD_SLOTS, MATCH_EXPRESSION_SLOTS, equippedAt } from "../utils/profileCard.js";
import { REWARD_KIND_LABELS, buildAchievementScreen } from "../utils/achievementDisplay.js";
import { finishTier, frameTier, pathColor } from "../utils/rewardTokens.js";
import { rewardPresentation, earnedRewardRefs, completionDecoration, filterOwnedRewards } from "../utils/achievementDecoration.js";

/** Pure specimen. Accept only RewardRefs already visible to this viewer; no reads/writes. */
export default function AchievementRewardPreview({ reward, ownedIds = null, acquired = false, equippedId = null }) {
  if (!reward?.rewardId) return null;
  const slot = PROFILE_CARD_SLOTS.find(item => item.slot === reward.kind);
  const state = rewardPresentation(reward, { ownedIds, acquired, equippedId });
  const color = reward.kind === "path_color" ? pathColor(reward) : null;
  const finish = reward.kind === "finish_effect" ? finishTier(reward) : null;
  // Titles are text rewards; a null assetRef is normal. Frames/backgrounds have existing fallbacks.
  const cardSpecimen = slot && (reward.kind !== "profile_icon" || reward.assetRef);
  return <div className="album-reward" data-support={state.support}>
    <div className="album-reward-label"><small>{REWARD_KIND_LABELS[reward.kind] || "보상"}</small><strong>{reward.displayName}</strong></div>
    {cardSpecimen && <div className="album-reward-specimen" aria-label={`${reward.displayName} 견본 · 장착 상태가 아닙니다`}>
      <ProfileCard card={{ nickname: "보상 견본", [slot.cardKey]: reward }} size="md" density="full" />
    </div>}
    {color && <span className="preward-swatch" style={{ borderColor: color }} aria-label="경로 색상 견본" />}
    {reward.kind === "finish_effect" && <RewardArtSwatch kind="finish_effect" reward={reward}>{finish && <span className={`preward-preview preward-preview--${finish}`} aria-label="완주 효과 단계 견본">✦</span>}</RewardArtSwatch>}
    <small className="album-ownership">{state.acquisition}</small>
    <small>{state.equipment}</small>
    <small className="album-support">{state.description}</small>
  </div>;
}

/**
 * Tutorial-only presenter: no service, audio, storage, timer or seen/equip calls.
 * onPreviewAction is a practice callback; the caller owns any local equipment simulation.
 */
export function ProfileRewardEditorPreview({ card, owned = [], goals = [], matchExpression = {}, onPreviewAction, previewAnchors, initialOpenSlot = null }) {
  return <RewardEditorView card={card} owned={owned} goals={goals}
    matchExpression={matchExpression} matchStatus="ready" preview onAction={onPreviewAction}
    previewAnchors={previewAnchors} initialOpenSlot={initialOpenSlot} />;
}

export function RewardEditorView({
  card, owned, goals, loading = false, matchExpression, matchStatus,
  pending = null, error = "", feedback = "", onAction, onRetry, onRetryRead, preview = false,
  previewAnchors, initialOpenSlot = null, previewCardWidth = null,
}) {
  const [openKey, setOpenKey] = useState(() => preview && initialOpenSlot === "title" ? "title" : null);
  const [collectionKind, setCollectionKind] = useState("all");
  const [collectionQuery, setCollectionQuery] = useState("");
  const [collectionStatus, setCollectionStatus] = useState("all");
  const [specimenId, setSpecimenId] = useState(null);
  const specimenRef = useRef(null);
  const specimenTrigger = useRef(null);
  const prefix = useId();
  const feedbackRef = useRef(null);
  const errorRef = useRef(null);
  const cardRows = PROFILE_CARD_SLOTS.map(definition => ({ ...definition, current: equippedAt(card, definition.slot) }));
  const matchRows = MATCH_EXPRESSION_SLOTS.map(definition => ({ ...definition, current: matchExpression[definition.slot] ?? null }));
  const allRows = [...cardRows, ...matchRows];
  const equippedIds = new Set(allRows.map(row => row.current?.rewardId).filter(Boolean));
  const matching = filterOwnedRewards(owned, { kind: preview ? "all" : collectionKind,
    query: preview ? "" : collectionQuery, status: preview ? "all" : collectionStatus, equippedIds });
  const visibleCardRows = cardRows.filter(row => preview || collectionKind === "all" || collectionKind === row.slot);
  const visibleMatchRows = matchRows.filter(row => preview || collectionKind === "all" || collectionKind === row.slot);
  const specimen = !preview ? owned.find(reward => reward.rewardId === specimenId && !reward.retired) : null;
  const collectionOnly = owned.filter(reward => ["path_effect", "spectator_emoji"].includes(reward.kind));
  const ownedIds = new Set(owned.map(reward => reward.rewardId));
  useEffect(() => { if (feedback) feedbackRef.current?.focus(); }, [feedback]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { if (specimen) specimenRef.current?.focus(); }, [specimenId]);

  const renderRow = row => {
    const { current } = row;
    const choices = matching.filter(reward => reward.kind === row.slot);
    const ownedForSlot = owned.filter(reward => reward.kind === row.slot && !reward.retired);
    const hasOwned = ownedForSlot.length > 0;
    const locked = goals.filter(reward => reward.kind === row.slot && !ownedIds.has(reward.rewardId) && reward.hidden !== true);
    const isOpen = openKey === row.slot;
    const panelId = `${prefix}-${row.slot}`;
    const unavailable = loading || (MATCH_EXPRESSION_SLOTS.some(item => item.slot === row.slot) && matchStatus !== "ready");
    // A compact title row is the tutorial target; the full inventory is intentionally not anchored.
    const titleAnchor = preview && row.slot === "title" && typeof previewAnchors?.titleControls === "string"
      ? previewAnchors.titleControls.trim() || undefined : undefined;
    return <li key={row.slot} data-tutorial-anchor={titleAnchor} className={`preward-row${current ? " preward-row--equipped" : " preward-row--empty"}`}>
      <div className="preward-row-head">
        <span className="preward-label">{row.label}</span>
        <span className="preward-current">
          {unavailable ? matchStatus === "error" ? "장착 상태 확인 필요" : "장착 상태 확인 중" : current?.displayName || "비어 있음"}
          {current?.retired && <span className="preward-tag">은퇴 · 해제만 가능</span>}
          <small className="preward-ownership">{!unavailable && (current ? "장착 중" : hasOwned ? `보유 ${ownedForSlot.length}개 · 선택 가능` : "미보유 · 업적에서 보상 확인")}</small>
        </span>
        <button type="button" className="app-btn app-btn-ghost preward-toggle" aria-expanded={isOpen}
          aria-controls={panelId} aria-label={`${row.label} 변경`} disabled={Boolean(pending) || unavailable}
          onClick={() => setOpenKey(isOpen ? null : row.slot)}>{isOpen ? "닫기" : "변경"}</button>
      </div>
      {isOpen && <div id={panelId} className="preward-panel" role="group" aria-label={`${row.label} 선택`} aria-busy={Boolean(pending)}>
        {choices.length === 0 && <p className="preward-muted">{hasOwned ? "검색·상태 조건에 맞는 보상이 없습니다." : "보유한 보상이 없습니다."}</p>}
        {choices.map(reward => {
          const selected = current?.rewardId === reward.rewardId;
          const swatch = row.slot === "path_color" ? pathColor(reward) : null;
          const saving = pending?.type === "equip" && pending.rewardId === reward.rewardId && pending.slot === row.slot;
          return <div key={reward.rewardId} className="preward-choice-pair"><button type="button" className={`preward-choice${selected ? " preward-choice--selected" : ""}`}
            aria-pressed={selected} disabled={Boolean(pending) || selected || !onAction || unavailable}
            onClick={() => onAction?.({ type: "equip", slot: row.slot, rewardId: reward.rewardId })}>
            {reward.assetRef && row.slot === "profile_icon" ? <><ProfileAvatar card={{ icon: reward, nickname: reward.displayName }} size="xs" className="preward-choice-img" imageLabel={reward.displayName} /><span aria-hidden="true">{reward.displayName}</span></> : <>
              {swatch && <span className="preward-swatch" style={{ borderColor: swatch }} aria-hidden="true" />}
              {row.slot === "frame" && <RewardArtSwatch kind="frame" reward={reward}><span className={`preward-preview preward-preview--${frameTier(reward) || "default"}`} aria-label="프레임 미리보기">◎</span></RewardArtSwatch>}
              {row.slot === "finish_effect" && <RewardArtSwatch kind="finish_effect" reward={reward}><span className={`preward-preview preward-preview--${finishTier(reward) || "default"}`} aria-label="완주 효과 단계 미리보기">✦</span></RewardArtSwatch>}
              {row.slot === "background" && <span aria-hidden="true"><ProfileCard card={{ ...card, background: reward }} size="sm" density="full" /></span>}
              <span>{reward.displayName}</span>
            </>}
            <span className="preward-tag">{saving ? "요청 중 · 서버 확인 대기" : selected ? "장착 중" : preview ? "연습용 선택" : "보유 · 선택하여 장착"}</span>
          </button>{!preview && <button type="button" className="preward-inspect" disabled={Boolean(pending)}
            aria-label={`${reward.displayName} 장착 전 견본`} onClick={event => { specimenTrigger.current = event.currentTarget; setSpecimenId(reward.rewardId); }}>먼저 보기</button>}</div>;
        })}
        {row.slot === "background" && <p className="preward-guide">{rewardPresentation({ kind: "background" }).description}</p>}
        {locked.length > 0 && <div className="preward-goals"><p className="wr-kicker">다음 수집 목표 · 미보유</p>{locked.map((reward, i) => <div key={`${reward.rewardId}-${i}`} className="preward-locked">
          <strong>{reward.displayName}</strong><small>{reward.achievementName} · {reward.condition}</small>
          {Number.isFinite(reward.current) && Number.isFinite(reward.threshold) && <small>진행 {reward.current} / 목표 {reward.threshold}</small>}
          {!preview && <Link to="/achievements">도감에서 획득 목표 확인 →</Link>}
        </div>)}</div>}
        {current && <button type="button" className="app-btn app-btn-ghost preward-clear" disabled={Boolean(pending) || !onAction || unavailable}
          onClick={() => onAction?.({ type: "unequip", slot: row.slot })}>{pending?.type === "unequip" && pending.slot === row.slot ? "해제 요청 중…" : preview ? "연습용 해제" : "해제"}</button>}
      </div>}
    </li>;
  };

  return <details className="preward" open>
    <summary className="preward-summary">수집 보상 · 프로필 꾸미기</summary>
    <p className="preward-guide">{preview ? "연습용 견본입니다. 실제 보유·장착·업적 기록은 바뀌지 않습니다." : "보유한 보상을 선택하면 장착을 요청합니다. 서버 확인 전에는 현재 장착 상태가 유지됩니다."}</p>
    {!preview && <p className="preward-guide"><Link to="/achievements">발견 도감에서 다음 보상 살펴보기 →</Link></p>}
    {!preview && !loading && <section className="preward-browser" aria-label="보유 꾸미기 찾기">
      <div className="preward-browser-head"><strong>내 꾸미기 골라보기</strong><span>아이콘부터 경기 표현까지, 보유한 꾸미기를 찾아요.</span></div>
      <label htmlFor={`${prefix}-search`}>보유 보상 이름으로 찾기</label>
      <input id={`${prefix}-search`} type="search" value={collectionQuery} disabled={Boolean(pending)}
        onChange={event => { setCollectionQuery(event.target.value); setSpecimenId(null); }} placeholder="보유한 이름 검색" />
      <nav className="preward-kind-nav" aria-label="꾸미기 종류">
        {[{slot:"all",label:"전체"},{slot:"profile_icon",label:"아이콘"},{slot:"title",label:"칭호"},{slot:"frame",label:"프레임"},{slot:"background",label:"카드 배경"},{slot:"finish_effect",label:"완주 효과"},{slot:"path_color",label:"경로 색상"}].map(kind =>
          <button type="button" key={kind.slot} aria-pressed={collectionKind === kind.slot} disabled={Boolean(pending)}
            onClick={() => { setCollectionKind(kind.slot); setSpecimenId(null); if (kind.slot !== "all") setOpenKey(kind.slot); }}>{kind.label}</button>)}
      </nav>
      <label htmlFor={`${prefix}-status`}>장착 상태로 찾기</label>
      <select id={`${prefix}-status`} value={collectionStatus} disabled={Boolean(pending) || matchStatus !== "ready"}
        onChange={event => { setCollectionStatus(event.target.value); setSpecimenId(null); }}>
        <option value="all">모두 보기</option><option value="available">새로 장착 가능한 보상</option><option value="equipped">현재 장착 중인 보상</option>
      </select>
      <p className="preward-browser-count" role="status">{matching.filter(reward => allRows.some(row => row.slot === reward.kind)).length}개 표시 · 전체 보유 목록 안에서 찾습니다.</p>
      {(collectionQuery || collectionKind !== "all" || collectionStatus !== "all") && <button type="button" className="preward-search-reset" disabled={Boolean(pending)}
        onClick={() => { setCollectionQuery(""); setCollectionKind("all"); setCollectionStatus("all"); setSpecimenId(null); }}>찾기 조건 초기화</button>}
    </section>}
    {specimen && <section ref={specimenRef} tabIndex={-1} className="preward-tryon" aria-label="장착 전 꾸미기 견본">
      <header><div><small>장착 전 견본 · 현재 프로필은 그대로</small><h3>{specimen.displayName}</h3></div><button type="button" className="preward-specimen-close"
        onClick={() => { setSpecimenId(null); specimenTrigger.current?.focus(); }}>견본 닫기</button></header>
      <RewardTryOn card={card} reward={specimen} previewCardWidth={previewCardWidth} />
      <p>{rewardPresentation(specimen, { ownedIds, equippedId: allRows.find(row => row.slot === specimen.kind)?.current?.rewardId }).description}</p>
      <small>이 견본은 장착을 요청하지 않습니다. 마음에 들면 목록에서 해당 보상을 선택해 장착해 주세요.</small>
    </section>}
    {loading ? <p className="preward-muted" role="status">보유 보상을 불러오는 중…</p> : <>
      <ul className="preward-rows">{visibleCardRows.map(renderRow)}</ul>
      {visibleMatchRows.length > 0 && <p className="preward-group-label">경기 표현</p>}
      <ul className="preward-rows">{visibleMatchRows.map(renderRow)}</ul>
      {matchStatus === "loading" && <p className="preward-guide" role="status">경기 표현 장착 상태를 확인하는 중…</p>}
      {matchStatus === "error" && <div className="preward-error" role="alert">경기 표현 장착 상태를 불러오지 못했습니다. {onRetryRead && <button className="app-btn app-btn-ghost" type="button" disabled={Boolean(pending)} onClick={onRetryRead}>장착 상태 다시 확인</button>}</div>}
      <p className="preward-guide">완주 효과: 싱글 완주·1:1 승자 화면. 경로 색상: 싱글 결과 경로. 그룹 경기에는 연결되지 않습니다.</p>
      {collectionOnly.length > 0 && <section className="preward-collection" aria-label="보유한 수집 전용 보상"><h3>수집 전용 · 현재 효과 미지원</h3><p className="preward-guide">보유 기록은 유지됩니다. 관전의 기본 리액션과 업적 보상 리액션은 서로 다릅니다.</p>
        {collectionOnly.map(reward => <AchievementRewardPreview key={reward.rewardId} reward={reward} ownedIds={ownedIds} />)}
      </section>}
    </>}
    {pending && <p className="preward-guide" role="status">장착 상태를 저장하는 중… 다른 요청은 완료 후 선택해 주세요.</p>}
    {feedback && <p ref={feedbackRef} tabIndex={-1} className="preward-feedback" role="status">{feedback} <a href="#profile-card-preview">저장된 카드 보기 ↑</a></p>}
    {error && <div ref={errorRef} tabIndex={-1} className="auth-error preward-error" role="alert">{error} <span>저장 여부를 확인하지 못했습니다. 현재 표시를 유지합니다. 다시 요청하거나 새로고침해 서버 상태를 확인해 주세요.</span>
      {onRetry && <button type="button" className="app-btn app-btn-ghost" disabled={Boolean(pending)} onClick={onRetry}>같은 요청 다시 시도</button>}
    </div>}
  </details>;
}


/** Existing renderer/token specimen only; the surrounding editor owns requests separately. */
function RewardTryOn({ card, reward, previewCardWidth }) {
  const definition = PROFILE_CARD_SLOTS.find(slot => slot.slot === reward.kind);
  if (definition) {
    const representative = Number.isFinite(previewCardWidth) && previewCardWidth > 0;
    const specimen = <ProfileCard card={{ ...card, [definition.cardKey]: reward }} size="xl" density="full"
      className={representative ? "pcard--stacked" : ""} />;
    return representative
      ? <div className="preward-profile-specimen" style={{ width: previewCardWidth }}>{specimen}</div>
      : specimen;
  }
  if (reward.kind === "finish_effect") return <div className="preward-finish-specimen"><FinishEffect effect={reward} /><span>실제 완주 효과 표시 · 싱글 / 1:1 승자</span></div>;
  const color = reward.kind === "path_color" ? pathColor(reward) : null;
  if (color) return <div className="preward-path-specimen" aria-label="싱글 결과 경로 색상 견본" style={{ "--preward-path": color }}><span>출발</span><i aria-hidden="true" /><span>경유</span><i aria-hidden="true" /><span>목표</span></div>;
  return <p>현재 이 효과의 견본은 지원하지 않습니다.</p>;
}

export function AchievementCard({ card, ownedIds, earnedRefs = [] }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const stamp = completionDecoration(card);
  const hasDetails = card.tierCount > 1 || card.earned.length > 0 || card.nextRewardRefs.length > 0 || earnedRefs.length > 0;
  const state = card.complete ? "complete" : card.unlockedTier > 0 ? "tier" : card.progress?.current > 0 ? "progress" : "waiting";
  return (
    <article data-state={state} className={`ach-card${card.hidden ? " ach-card--hidden" : ""}${card.complete ? " ach-card--complete" : ""}`}>
      <span className="ach-card-state">{({complete:"✓ 달성 · 기록 완료",tier:"단계 완료 · 다음 기록으로",progress:"탐험 중 · 기록 진행",waiting:"미달성 · 기록을 기다려요"})[state]}</span>
      <div className="ach-card-head">
        <span className="ach-card-name">
          {card.name}
          {card.tierLabel && <span className="ach-tier"> {card.tierLabel}</span>}
        </span>
        {card.kindLabel && <span className="ach-kind">{card.kindLabel}</span>}
        {card.isNew && <span className="ach-new">NEW</span>}
        {stamp && <img className="album-complete-art" src={stamp} alt="" aria-hidden="true" width="48" height="48" />}
      </div>
      {card.condition && <div className="ach-card-condition">{card.condition}</div>}
      {card.description && card.description !== card.condition && <p className="album-description">{card.description}</p>}
      {card.progress && (
        <div className="ach-progress">
          <div
            className="ach-progress-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={card.progress.next}
            aria-valuenow={card.progress.current}
          >
            <span style={{ width: `${card.progress.percent}%` }} />
          </div>
          <span className="ach-progress-label">{card.progress.label}</span>
        </div>
      )}

      {card.next ? (
        <div className="ach-next">
          다음 보상{card.next.tierLabel ? ` (${card.next.tierLabel})` : ""}: +{card.next.xp.toLocaleString("ko-KR")} XP
          {card.next.rewards.length > 0 && <p className="album-next-summary">{card.next.rewards.join(" · ")}</p>}
          {card.next.rewards.length === 0 && <small className="album-xp-only">이 단계는 XP 보상으로 기록됩니다.</small>}
        </div>
      ) : (
        <div className="ach-next ach-next--done">완료</div>
      )}
      {hasDetails && <button type="button" className="album-details-toggle" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}>
        {expanded ? "상세 접기" : "보상·기록 자세히 보기"}
        <span className="album-sr-only"> · {card.name}</span>
      </button>}
      {hasDetails && <div id={detailsId} className={`album-card-details${expanded ? " is-expanded" : ""}`}>
        {card.tierCount > 1 && <small className="album-tier-count">완료한 단계 {card.unlockedTier} / {card.tierCount}</small>}
        {card.steps.length > 1 && <ol className="ach-steps" aria-label={`단계 ${card.unlockedTier} / ${card.tierCount}`}>
          {card.steps.map(step => <li key={step.tier} className={step.unlocked ? "ach-step ach-step--done" : "ach-step"}>{step.label}</li>)}
        </ol>}
        {card.earned.length > 0 && <ul className="ach-earned" aria-label="획득한 보상">{card.earned.map(tier => <li key={tier.tier}>단계 {tier.tier} · {tier.unlockedAt ? new Date(tier.unlockedAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : "획득일 확인 필요"} · +{tier.xp} XP{tier.rewards.length > 0 && ` · ${tier.rewards.join(" · ")}`}</li>)}</ul>}
        {earnedRefs.length > 0 && <div className="album-reward-details" aria-label="획득한 보상 견본">{earnedRefs.map(reward => <AchievementRewardPreview key={reward.rewardId} reward={reward} ownedIds={ownedIds} acquired />)}</div>}
        {card.nextRewardRefs.length > 0 && <div className="album-reward-details" aria-label="공개 다음 보상 견본">
          {card.nextRewardRefs.map(reward => <AchievementRewardPreview key={reward.rewardId} reward={reward} ownedIds={ownedIds} />)}
        </div>}
      </div>}
    </article>
  );
}

/** Pure album for tutorial fixtures. Never mounts the connected page/auth/seen effects. */
export function AchievementAlbumPreview({ response, ownedIds = null }) {
  const screen = buildAchievementScreen(response);
  const earned = earnedRewardRefs(response);
  if (!screen) return null;
  return <section className="wr-achievements" data-reward-preview="true" aria-label="연습용 발견 도감">
    <p className="preward-guide">연습용 도감 · 실제 업적 확인 표시와 보유 기록은 바뀌지 않습니다.</p>
    {screen.sections.map(section => <section className="ach-section" key={section.category}><h2>{section.label}</h2>{section.cards.map(card => <AchievementCard key={card.achievementId} card={card} ownedIds={ownedIds} earnedRefs={earned.get(card.achievementId)} />)}</section>)}
    <section className="ach-section"><h2>히든 업적</h2><p>{screen.hidden.label}</p>{screen.hidden.cards.filter(card => card.unlockedTier > 0).map(card => <AchievementCard key={card.achievementId} card={card} ownedIds={ownedIds} earnedRefs={earned.get(card.achievementId)} />)}</section>
  </section>;
}

// Presentation only. ResultAchievements owns reveal order and seen processing.
export function SingleAchievementCardView({ item, preview = false }) {
  return <article className={`ach-reveal-card wr-single-achievement${item.hidden ? " ach-reveal-card--hidden" : ""}`}>
    <div className="wr-single-achievement-medal" aria-hidden="true">
      <svg viewBox="0 0 64 76" fill="none"><path d="m19 47-4 25 17-9 17 9-4-25" fill="currentColor" opacity=".18"/><path d="m32 3 9 5 10 2 3 10 6 9-6 10-3 10-10 2-9 5-9-5-10-2-3-10-6-10 6-9 3-10 10-2Z" fill="currentColor" opacity=".14"/><circle cx="32" cy="29" r="19" stroke="currentColor" strokeWidth="1.5"/><path d="m23 29 6 6 12-13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </div>
    <div className="wr-single-achievement-content">
      <div className="ach-reveal-head"><span className="ach-reveal-tag">{item.hidden ? `히든 업적${item.kindLabel ? ` · ${item.kindLabel}` : ""}` : "업적 달성"}</span>
        {item.xp > 0 && <span className="ach-reveal-xp">+{item.xp.toLocaleString("ko-KR")} XP</span>}
      </div>
      <h3 className="ach-reveal-name">{item.name}{item.tierLabel && <span className="ach-tier"> {item.tierLabel}</span>}</h3>
      {item.condition && <p className="ach-reveal-condition">{item.condition}</p>}
      <span className="album-reveal-stamp">✓ 발견 기록 완료</span>
      {item.rewards.length > 0 && <div className="ach-reveal-rewards">
        <strong>이번 해금 보상</strong>
        <ul className="wr-single-reward-chips">{item.rewards.map((reward, index) => <li key={index}>{reward}</li>)}</ul>
        {item.rewardRefs?.length > 0 && <details className="wr-earned-rewards"><summary>보상 견본과 장착 위치 보기</summary>
          {item.rewardRefs.map(reward => <AchievementRewardPreview key={reward.rewardId} reward={reward} ownedIds={null} acquired />)}
        </details>}
        {!preview && <Link className="wr-reward-profile-link" to="/profile">프로필에서 보유·장착 확인 →</Link>}
      </div>}
    </div>
  </article>;
}

/** Static tutorial presenter: no seen calls, timers, audio, storage or profile navigation. */
export function ResultAchievementsPreview({ reveal, tone = "light", presentation }) {
  return <div data-reward-preview="true"><p className="preward-guide">연습용 결과 · 실제 업적·XP·보유 기록은 바뀌지 않습니다.</p>
    <ResultAchievementCards items={reveal?.items ?? []} total={reveal?.items?.length ?? 0} tone={tone} presentation={presentation} reducedMotion preview />
  </div>;
}

export function ResultAchievementCards({ items, total, tone, presentation, reducedMotion, preview = false }) {
  if (items.length === 0) return null;
  return <div className={`ach-reveal ach-reveal--${tone}${reducedMotion ? " ach-reveal--static" : ""}`} data-testid="result-achievements" aria-live="polite">
    {presentation === "single" && <div className="wr-single-awards-heading"><strong>달성 업적</strong><span>{total}개 달성</span></div>}
    {items.map(item => presentation === "single" ? <SingleAchievementCardView key={item.achievementId} item={item} preview={preview} /> :
      <div key={item.achievementId} className={`ach-reveal-card${item.hidden ? " ach-reveal-card--hidden" : ""}`}>
        <span className="album-reveal-stamp">✓ 발견 기록 완료</span>
        <div className="ach-reveal-head"><span className="ach-reveal-tag">{item.hidden ? `히든 업적${item.kindLabel ? ` · ${item.kindLabel}` : ""}` : "업적 달성"}</span>{item.xp > 0 && <span className="ach-reveal-xp">+{item.xp.toLocaleString("ko-KR")} XP</span>}</div>
        <div className="ach-reveal-name">{item.name}{item.tierLabel && <span className="ach-tier"> {item.tierLabel}</span>}</div>
        {item.condition && <div className="ach-reveal-condition">{item.condition}</div>}
        {item.rewards.length > 0 && <div className="ach-reveal-rewards">
          <strong>이번 해금 보상</strong><div>{item.rewards.join(" · ")}</div>
          {item.rewardRefs?.length > 0 && <details className="wr-earned-rewards"><summary>보상 견본과 장착 위치 보기</summary>
            {item.rewardRefs.map(reward => <AchievementRewardPreview key={reward.rewardId} reward={reward} ownedIds={null} acquired />)}
          </details>}
          {!preview && <Link className="wr-reward-profile-link" to="/profile">프로필에서 보유·장착 확인 →</Link>}
        </div>}
      </div>
    )}
  </div>;
}
