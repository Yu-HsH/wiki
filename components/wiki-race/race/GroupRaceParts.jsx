import React from "react";
import ProfileAvatar from "../../ProfileAvatar.jsx";
import { NAME_FALLBACK, buildProfileCard } from "../../../utils/profileCard.js";
import { formatDuration } from "../../../services/wikiService";
import { PARTICIPANT_STATE, isReactionFresh } from "../../../utils/groupRacePresentation.js";
import { ConnectionDot, HudTimer, Pill, RaceIcon, RouteChain } from "./RaceParts";

// Phase 3 그룹 RACE/관전 표시 부품. 데이터·핸들러는 GroupGamePage가 넘긴다.
// 경기 중 화면은 프로필 카드 조회를 하지 않는다 — 방 스냅샷의 닉네임/이미지만 쓴다.

const nameOf = (player) => player?.nickname_snapshot || "참가자";
const movesOf = (player) => (Number.isFinite(player?.move_count) ? `${player.move_count} 이동` : "이동 확인 중");
const timeOf = (player) => (Number.isFinite(player?.elapsed_seconds) ? formatDuration(player.elapsed_seconds) : null);

function Avatar({ player }) {
  return <ProfileAvatar
    card={buildProfileCard({ userId: player.user_id, nickname: player.nickname_snapshot, legacyImageUrl: player.profile_image_snapshot, source: "snapshot" })}
    size="xs"
    nameFallback={NAME_FALLBACK.PARTICIPANT}
  />;
}

function stateCell(state, { watchedLive }) {
  if (watchedLive) return <span className="wr-prow-state is-watch"><RaceIcon name="spectator" size={13} />보는 중</span>;
  if (state === PARTICIPANT_STATE.FINISHED) return <span className="wr-prow-state is-done"><span className="wr-done-glyph" aria-hidden="true">✓</span>완주</span>;
  if (state === PARTICIPANT_STATE.RETIRED) return <Pill tone="neutral" filled>리타이어</Pill>;
  if (state === PARTICIPANT_STATE.DISCONNECTED) return <ConnectionDot ok={false} halo label="재연결 중" />;
  return <span className="wr-prow-state">진행 중</span>;
}

/**
 * 참가자 목록. 상태는 색만이 아니라 글자(진행 중 · 완주 · 리타이어 · 재연결 중 · 보는 중)로도 보인다.
 * 관전 중에는 진행 중인 참가자 행만 버튼이다(관전 대상 선택).
 */
export function ParticipantRoster({
  entries, myUserId, spectating = false, watchedId = null, onSelect,
  reactionsByUser = {}, nowMs = Date.now(), muteMode = false, mutedIds = [], onToggleMute, counts,
}) {
  return <>
    <div className="wr-roster-head">
      <h2>참가자 {entries.length}</h2>
      {counts && <small>완주 {counts.finished} · 진행 {counts.active}{counts.retired ? ` · 리타이어 ${counts.retired}` : ""}</small>}
    </div>
    <ul className="wr-roster-list" aria-label="참가자 목록">
      {entries.map(({ player, state }) => {
        const isMe = player.user_id === myUserId;
        const watched = spectating && player.user_id === watchedId;
        const watchedLive = watched && state === PARTICIPANT_STATE.RACING;
        const selectable = spectating && !isMe && (state === PARTICIPANT_STATE.RACING || state === PARTICIPANT_STATE.DISCONNECTED);
        const reaction = reactionsByUser[player.user_id];
        const muted = mutedIds.includes(player.user_id);
        const sub = state === PARTICIPANT_STATE.FINISHED
          ? [timeOf(player), movesOf(player), spectating && !isMe ? "관전 중" : null].filter(Boolean).join(" · ")
          : state === PARTICIPANT_STATE.RETIRED
            ? movesOf(player)
            : `${player.current_title || "마지막 문서 없음"} · ${movesOf(player)}`;
        const className = [
          "wr-prow",
          isMe && !spectating ? "is-me" : "",
          watchedLive ? "is-watched" : "",
          watched && !watchedLive ? "is-watched-stale" : "",
          state === PARTICIPANT_STATE.DISCONNECTED ? "is-dim" : "",
          state === PARTICIPANT_STATE.RETIRED ? "is-retired" : "",
        ].filter(Boolean).join(" ");
        const label = `${isMe ? "나 · " : ""}${nameOf(player)} · ${
          state === PARTICIPANT_STATE.FINISHED ? `${player.rank ?? "–"}위 완주`
            : state === PARTICIPANT_STATE.RETIRED ? "리타이어"
              : state === PARTICIPANT_STATE.DISCONNECTED ? "재연결 중" : "진행 중"
        }${watched ? " · 관전 대상" : ""}`;
        const body = <>
          <span className="wr-prow-rank">{state === PARTICIPANT_STATE.FINISHED ? `${player.rank ?? "–"}위` : state === PARTICIPANT_STATE.RETIRED ? "–" : ""}</span>
          <Avatar player={player} />
          <span className="wr-prow-name">
            {isMe && <span className="wr-prow-me-dot" aria-hidden="true" />}
            <span>{nameOf(player)}</span>
            {isMe && <span className="wr-prow-me">나</span>}
          </span>
          {reaction && !muted
            ? <span key={reaction.id} className={`wr-reaction-stamp group-spectator-reaction ${isReactionFresh(reaction, nowMs) ? "" : "is-stale"}`}>{reaction.preset.label}</span>
            : stateCell(state, { watchedLive })}
          <span className="wr-prow-sub">{sub}{watched && !watchedLive ? " · 보는 중" : ""}{muted ? " · 반응 숨김" : ""}</span>
        </>;
        return <li key={player.id || player.user_id}>
          {selectable
            ? <button type="button" className={className} onClick={() => onSelect?.(player.user_id)} aria-pressed={watched} aria-label={label}>{body}</button>
            : <div className={className} aria-label={label} role="group">{body}</div>}
          {muteMode && spectating && !isMe && (
            <div className="wr-mute-row group-spectator-mute-list">
              <button type="button" className="wr-race-link" onClick={() => onToggleMute?.(player.user_id)}>
                {muted ? "표시" : "숨김"} · {nameOf(player)}
              </button>
            </div>
          )}
        </li>;
      })}
    </ul>
    {spectating && <p className="wr-roster-hint">진행 중인 참가자를 누르면 관전 대상이 바뀝니다</p>}
  </>;
}

/** 경로 비교 — 결과가 확정된 참가자(완주·리타이어)만 경로를 보인다. 진행 중은 현재 문서와 이동 수만. */
export function RouteCompare({ entries, myUserId, watchedId, onWatch, startTitle, targetTitle }) {
  const resolved = entries.filter((e) => e.state === PARTICIPANT_STATE.FINISHED || e.state === PARTICIPANT_STATE.RETIRED);
  const active = entries.filter((e) => e.state === PARTICIPANT_STATE.RACING || e.state === PARTICIPANT_STATE.DISCONNECTED);
  return <section className="wr-compare" aria-labelledby="wr-compare-title">
    <div className="wr-compare-head">
      <h2 id="wr-compare-title">경로 비교</h2>
      <small>결과가 확정된 참가자 {resolved.length}명 · {startTitle || "출발"} → {targetTitle || "목표"}</small>
    </div>
    <div>
      {resolved.map(({ player, state }) => <div className="wr-compare-row" key={player.user_id}>
        <span className="wr-prow-rank">{state === PARTICIPANT_STATE.FINISHED ? `${player.rank ?? "–"}위` : "–"}</span>
        <span><strong>{nameOf(player)}{player.user_id === myUserId ? " · 나" : ""}</strong><small>{[timeOf(player), movesOf(player)].filter(Boolean).join(" · ")}</small></span>
        <span>{state === PARTICIPANT_STATE.FINISHED ? <span className="wr-prow-state is-done"><span className="wr-done-glyph" aria-hidden="true">✓</span>완주</span> : <Pill tone="neutral" filled>리타이어</Pill>}</span>
        <RouteChain path={Array.isArray(player.path_titles) ? player.path_titles : []} reachedTarget={state === PARTICIPANT_STATE.FINISHED} />
      </div>)}
      {resolved.length === 0 && <p className="wr-reaction-note">아직 결과가 확정된 참가자가 없습니다.</p>}
    </div>
    <div>
      <span className="wr-hud-label">진행 중 · 경로는 결과가 확정된 뒤 표시됩니다</span>
      {active.map(({ player, state }) => <div className="wr-compare-active" key={player.user_id}>
        <strong>{nameOf(player)}</strong>
        <span>{state === PARTICIPANT_STATE.DISCONNECTED ? "마지막" : "현재"} {player.current_title || "문서 없음"} · {movesOf(player)}</span>
        {player.user_id === watchedId
          ? <span className="wr-prow-state is-watch"><RaceIcon name="spectator" size={13} />보는 중</span>
          : <button type="button" className="wr-race-btn wr-race-btn--ghost" onClick={() => onWatch?.(player.user_id)}>관전 →</button>}
      </div>)}
    </div>
  </section>;
}

/** 관전자 전용 프리셋 반응(텍스트 스탬프). 쿨다운·허용 판정은 서버가 하고 화면은 남은 초만 보인다. */
export function ReactionDock({ presets, onSend, cooldownSeconds = 0, ended = false, muteAll, onToggleMuteAll, muteMode, onToggleMuteMode, mutedCount = 0, compact = false }) {
  const disabled = ended || cooldownSeconds > 0;
  const note = ended ? "경기 종료 · 반응을 보낼 수 없습니다" : cooldownSeconds > 0 ? `${cooldownSeconds}초 후 다시 보낼 수 있습니다` : "보낸 뒤 3초 대기";
  const buttons = presets.map((preset) => <button
    key={preset.id}
    type="button"
    className="wr-race-btn group-spectator-emoji"
    disabled={disabled}
    onClick={() => onSend(preset.id)}
    aria-label={`반응 보내기: ${preset.label}`}
  >{preset.label}</button>);
  if (compact) {
    return <div className="wr-sheet-reactions" role="group" aria-label="반응">
      <small>{ended ? "종료" : cooldownSeconds > 0 ? `${cooldownSeconds}초` : "반응"}</small>
      {buttons}
    </div>;
  }
  return <div className="wr-reaction-dock group-spectator-emoji-bar" role="group" aria-label="반응">
    <span className="wr-hud-label">반응</span>
    {buttons}
    <span className="wr-reaction-note" role="status"><RaceIcon name="timer" size={12} />{note}</span>
    {!ended && <span className="wr-reaction-end">
      <button type="button" className="wr-race-link" aria-pressed={muteMode} onClick={onToggleMuteMode}>
        {muteMode ? "숨기기 완료" : mutedCount > 0 ? `사용자별 숨기기 · ${mutedCount}명` : "사용자별 숨기기"}
      </button>
      <button type="button" className="wr-race-btn" aria-pressed={muteAll} onClick={onToggleMuteAll}>
        {muteAll ? "반응 켜기" : "반응 끄기"}
      </button>
    </span>}
  </div>;
}

/** 모바일 하단 시트 — 본문이 1순위. 요약 한 줄만 고정, 참가자·경로는 펼쳐서 본다. */
export function GroupSheet({ deadline, meLabel, counts, open, onToggle, status, tabs, activeTab, onTab, footer }) {
  const current = tabs.find((tab) => tab.id === activeTab) || tabs[0];
  return <section className="wr-group-sheet" aria-label="그룹 경기 정보">
    <div className="wr-sheet-summary">
      <HudTimer label={deadline.label} seconds={deadline.seconds} state={deadline.state} />
      <div><span className="wr-hud-label">나</span><strong>{meLabel}</strong></div>
      <div><span className="wr-hud-label">참가자 {counts.total}</span><strong>완주 {counts.finished} · 진행 {counts.active}</strong></div>
      <button type="button" className="wr-sheet-toggle" aria-expanded={open} aria-controls="wr-sheet-panel" aria-label={open ? "참가자 정보 접기" : "참가자 정보 펼치기"} onClick={onToggle}>{open ? "▾" : "▴"}</button>
    </div>
    {status && <div className="wr-sheet-status">{status}</div>}
    {open && <>
      <div className="wr-sheet-tabs" role="tablist" aria-label="그룹 정보">
        {tabs.map((tab) => <button key={tab.id} type="button" role="tab" id={`wr-sheet-tab-${tab.id}`} aria-selected={tab.id === current.id} aria-controls="wr-sheet-panel" className="wr-race-tab" onClick={() => onTab(tab.id)}>{tab.label}</button>)}
      </div>
      <div className="wr-sheet-panel" id="wr-sheet-panel" role="tabpanel" aria-labelledby={`wr-sheet-tab-${current.id}`}>{current.content}</div>
    </>}
    {footer}
  </section>;
}

/**
 * Result A — 완주했지만 그룹 경기는 아직 진행 중 (Freeze 08 · 6c). 개인 기록은 서버 값,
 * 그룹은 진행 중 수와 남은 마감만. 다른 참가자의 순위는 보이지 않는다.
 * 관전하기를 눌러야 관전으로 들어간다. 경기가 최종 확정되면 기존 흐름이 B(최종 결과)로 옮긴다.
 */
export function GroupResultA({ result, size, finishedCount, pendingCount, deadline, startTitle, targetTitle, path, onSpectate, onLeave, leaving, routeOpen, onToggleRoute }) {
  const rank = Number.isInteger(result?.rank) ? result.rank : null;
  const time = Number.isFinite(result?.elapsed_seconds) ? formatDuration(result.elapsed_seconds) : "확정 중";
  const moves = Number.isFinite(result?.move_count) ? `${result.move_count}회` : "확정 중";
  return <div className="wr-page wr-race wr-result-a">
    <main className="wr-result-a-frame" aria-labelledby="wr-result-a-title">
      <div className={`wr-result-a-scene ${rank === 1 ? "is-first" : rank && rank <= 3 ? "is-podium" : ""}`} aria-hidden="true">
        <img src="/assets/wiki-race/explorer-win.png" alt="" height="118" />
      </div>
      <section className="wr-result-card">
        <header className="wr-result-row wr-result-head">
          <span className="wr-hud-label">MY RESULT · 내 기록</span>
          <div className="wr-result-headline">
            <h1 id="wr-result-a-title">{rank ? `${rank}위 완주` : "완주 · 순위 확정 중"}</h1>
            <span>그룹 레이스 · {size}인</span>
            {rank && <Pill tone="gold" filled icon="flag">목표 도달 · {rank}번째</Pill>}
          </div>
        </header>
        <div className="wr-result-row wr-result-strip" role="status">
          <RaceIcon name="group" size={18} />
          <div>
            <strong>{pendingCount > 0 ? `그룹 경기 진행 중 · 완주 ${finishedCount} / ${size}` : "모든 참가자의 결과를 확인하고 있습니다"}</strong>
            <small>최종 순위는 경기가 끝난 뒤 확정됩니다</small>
          </div>
          {deadline.state !== "ended" && <span className="wr-result-deadline">
            <span className="wr-result-deadline-value"><RaceIcon name="timer" size={14} />{formatDuration(deadline.seconds)}</span>
            <small>{deadline.grace ? "경기 마감까지 · 3위 완주 후 최대 2분" : "경기 마감까지 · 제한 20:00"}</small>
          </span>}
        </div>
        <div className="wr-result-row wr-result-stats">
          <div><span className="wr-hud-label">시간</span><strong>{time}</strong></div>
          <div><span className="wr-hud-label">이동</span><strong>{moves}</strong></div>
          <div className="is-wide"><span className="wr-hud-label">공통 코스</span><span className="wr-result-course">{startTitle || "출발"} <span aria-hidden="true">▸</span> <b>{targetTitle || "목표"}</b></span></div>
        </div>
        <div className="wr-result-row wr-result-route">
          <div className="wr-roster-foot-head"><span className="wr-hud-label">내 경로</span><small>{Math.max(0, path.length - 1)} 이동</small>
            <button type="button" className="wr-race-link" aria-expanded={routeOpen} onClick={onToggleRoute}>{routeOpen ? "접기 ▴" : "펼치기 ▾"}</button>
          </div>
          {routeOpen ? <RouteChain path={path} reachedTarget max={99} /> : <RouteChain path={path} reachedTarget />}
        </div>
        <div className="wr-result-row wr-result-actions">
          {pendingCount > 0 && <button type="button" className="wr-race-btn wr-race-btn--primary wr-race-btn--lg" onClick={onSpectate}>관전하기 →</button>}
          <button type="button" className="wr-race-btn" aria-expanded={routeOpen} onClick={onToggleRoute}>내 경로 보기</button>
          <button type="button" className="wr-race-link wr-result-leave" onClick={onLeave} disabled={leaving}>{leaving ? "게임 정리 중..." : "그룹 로비로"}</button>
        </div>
      </section>
    </main>
  </div>;
}
