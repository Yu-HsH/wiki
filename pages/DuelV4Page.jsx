import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../authContext.jsx";
import WikiViewer from "../components/group-items-jungle/S5WikiViewer.jsx";
import { LinkList } from "../components/group-items-jungle/S5Panels.jsx";
import { FinalInkVfx, FinalItemIcon, FinalItemMotion, preloadFinalInk } from "../components/group-items-jungle/FinalAssetVfx.jsx";
import { createFinalAssetAudio } from "../components/group-items-jungle/finalAssetAudio.js";
import { itemName, tierLabel } from "../components/group-items-jungle/s5UiContract.js";
import { duelV4 } from "../services/duelV4Service.js";
import DuelV4ItemFeedback from "../components/DuelV4ItemFeedback.jsx";
import S5KionDock, { MODE_FOLLOWUP_ENABLED } from "../components/group-items-jungle/S5KionDock.jsx";
import { activeV4Effects, appendDuelV4Notice, createDuelV4Presentation, effectLabels, effectTime, V4_PARRY_WINDOW_MS } from "../services/duelV4Presentation.js";
import { audioManager } from "../services/audioManager.js";
import { fetchDistinctRandomTitle, fetchPageData, formatDuration, normalizeTitle, sanitizeWikiDocumentHtml } from "../services/wikiService.js";
import { ensureWikiSnapshot } from "../services/wikiSnapshotService.js";
import useGameAudio from "../hooks/useGameAudio.js";
import { CopyCodeButton, HostTag, LobbyHeader, MeTag, StatusMark } from "../components/wiki-race/LobbyParts.jsx";
import { ConnectionDot, HudArrow, HudBrand, HudDoc, HudExit, HudStat, HudTimer, MobileRouteNotes, RaceFrame, RaceHold, RaceHud, RouteRail } from "../components/wiki-race/race/RaceParts.jsx";
import { ResultActions, ResultCard, ResultOutcome, ResultRoute, ResultScreen, ResultStats, ResultXpRow } from "../components/wiki-race/result/ResultParts.jsx";
import "./duelV4.css";

const messages = {
  DUEL_V4_ENTRY_CLOSED: "이 검토 게임의 입장 권한이 필요합니다.",
  DUEL_V4_MEMBER_REQUIRED: "이 방의 참가자만 경기 상태를 열 수 있습니다.",
  DUEL_V4_ROOM_NOT_AVAILABLE: "방 코드를 확인해주세요.",
  PARRY_WINDOW_CLOSED: "패링 시간이 지났습니다.",
  LOST_LINK_NO_DESTINATION: "상대 문서에 이동 가능한 경로가 없습니다.",
  THIEF_NO_TRANSFERABLE_GRANT: "상대가 훔칠 수 있는 아이템을 보유하고 있지 않습니다.",
  CANNON_DESTINATION_UNAVAILABLE: "상대가 다른 문서에 있을 때 차원 대포를 사용할 수 있습니다.",
  TRAP_SELECTION_STALE: "상대 문서가 바뀌었습니다. 깜짝상자를 설치할 링크를 다시 골라주세요.",
  TRAP_LAST_EXIT: "상대의 마지막 이동 경로에는 강화 상자를 설치할 수 없습니다.",
  TRAP_ALREADY_ARMED: "이 링크에는 깜짝상자가 이미 설치되어 있습니다.",
  NO_EFFECT_TO_CLEAR: "해제할 효과가 없습니다.",
  INVALID_WIKI_LINK: "현재 문서에서 이동할 수 없는 링크입니다.",
  LINK_CENSORED: "검열이 끝날 때까지 이 링크를 사용할 수 없습니다.",
  STALE_PAGE: "최신 문서를 불러왔습니다. 링크를 다시 선택해주세요.",
  UNDO_NOT_AVAILABLE: "되돌릴 이동이 없습니다.",
  SHIELD_ALREADY_ACTIVE: "편집보호가 이미 적용 중입니다.",
  STUNNED: "감전이 끝나면 이동할 수 있습니다.",
  ITEM_SEALED: "감전 또는 봉인이 끝나면 아이템을 사용할 수 있습니다.",
  ITEM_NOT_AVAILABLE: "이미 사용했거나 보유하지 않은 아이템입니다.",
  ITEM_CHANCE_FAILED: "아이템을 사용했지만 효과는 발동하지 않았습니다.",
  SEARCH_UNAVAILABLE: "현재 문서에서 검색 창을 열 수 없습니다.",
  SEARCH_SOURCE_CHANGED: "문서가 바뀌었습니다. 검색을 다시 열어주세요.",
  SEARCH_USED: "이 검색에서 허용된 횟수를 사용했습니다.",
  REWARD_UNAVAILABLE: "받을 수 있는 보상이 바뀌었습니다.",
  STALE_INVENTORY: "아이템 칸이 바뀌었습니다. 다시 선택해주세요.",
  INVENTORY_FULL: "교체할 아이템을 골라주세요.",
  ROULETTE_AUTO_UNAVAILABLE: "지금은 자동으로 사용할 수 있는 아이템이 없습니다.",
  LINK_INDEX_ACTIVE: "현재 문서의 링크 목록이 이미 열려 있습니다.",
  LINK_SECTIONS_UNAVAILABLE: "강화 링크 목록을 만들 문서 구역 정보를 불러오지 못했습니다.",
};

function explanation(code) {
  return messages[code] || "요청을 처리하지 못했습니다. 연결과 경기 상태를 확인해주세요.";
}

function secondsLeft(expiresAt, now) {
  return Math.max(0, Math.ceil((effectTime(expiresAt) - now) / 1000));
}

async function findSnapshot(title) {
  const page = await fetchPageData(title);
  return ensureWikiSnapshot(page);
}

function Match({ roomId, userId }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [state, setState] = useState(null);
  const [document, setDocument] = useState(null);
  const [searchDocument, setSearchDocument] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState(false);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [documentError, setDocumentError] = useState("");
  const [target, setTarget] = useState("");
  const [selected, setSelected] = useState(null);
  const [trapLink, setTrapLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(null);
  const [clock, setClock] = useState(Date.now);
  const [notices, setNotices] = useState([]);
  const [scene, setScene] = useState(null);
  const [liveInkId, setLiveInkId] = useState(null);
  const activeWork = useRef(false);
  const audio = useRef(null);
  const feedback = useRef(null);
  const mounted = useRef(false);
  const article = useRef(null);
  const activeMatch = useRef(0);
  const sound = useSyncExternalStore(audioManager.subscribe, audioManager.getSnapshot, audioManager.getSnapshot);

  const refresh = useCallback(async () => {
    try {
      const next = await duelV4.state(roomId);
      if (!mounted.current) return;
      setConnectionError("");
      setState((previous) => previous && (previous.version > next.version ||
        (previous.version === next.version && Date.parse(previous.serverTime) > Date.parse(next.serverTime))) ? previous
        : { ...next, receivedAt: Date.now() });
      return next;
    } catch (cause) {
      if (mounted.current) setConnectionError(explanation(cause.message));
    }
  }, [roomId]);

  const me = state?.players.find((player) => player.id === userId);
  const opponent = state?.players.find((player) => player.id !== userId);
  const current = me?.page;
  const started = Boolean(state?.startedAt);
  const finished = Boolean(state?.finishedAt);
  const now = state ? Date.parse(state.serverTime) + Math.max(0, clock - state.receivedAt) : clock;
  useGameAudio({ identity: "duel-v4:" + roomId + ":" + userId, route: pathname,
    playing: started && !finished, connection: connectionError ? "lost" : null, ended: finished });
  const warning = state?.warnings.find((row) => effectTime(row.dueAt) > now);
  const warningMs = warning ? Math.min(V4_PARRY_WINDOW_MS, effectTime(warning.dueAt) - now) : 0;
  const effects = activeV4Effects(state?.effects, now);
  const ink = effects.find((effect) => effect.kind === "ink");
  const inkLive = Boolean(ink && liveInkId === ink.id);
  const thunder = effects.some((effect) => effect.kind === "stun");
  const stunned = thunder || effects.some((effect) => effect.kind === "cannon_stun" || effect.kind === "trap_stun");
  const sealed = stunned || effects.some((effect) => effect.kind === "thunder_seal");
  const protectedByShield = effects.some((effect) => effect.kind === "shield");
  const parry = state?.inventory.find((item) => item.itemId === "parry");
  const chosen = state?.inventory.find((item) => item.id === selected);
  const search = state?.search;
  const searchTimed = effectTime(search?.expiresAt) > now;
  const bookmark = state?.bookmark;
  const reward = effectTime(state?.reward?.expiresAt) > now ? state.reward : null;
  const linkIndex = effectTime(state?.linkIndex?.expiresAt) > now ? state.linkIndex : null;
  const searchReady = search && searchDocument?.windowId === search.id && searchDocument.snapshotId === current?.snapshotId;
  const searchResult = searchReady ? search.lastResult : null;
  const highlightedQuery = searchResult?.count > 0 ? searchResult.query : "";

  useEffect(() => {
    setTrapLink("");
  }, [opponent?.progressVersion, selected]);

  useEffect(() => {
    mounted.current = true;
    const output = createFinalAssetAudio(window);
    audio.current = output;
    feedback.current = createDuelV4Presentation(() => output, notice =>
      setNotices(previous => appendDuelV4Notice(previous, notice, Date.now())));
    preloadFinalInk();
    void refresh();
    const unsubscribe = duelV4.subscribe(roomId, userId, refresh);
    const poll = setInterval(refresh, 4500);
    const ticker = setInterval(() => setClock(Date.now()), 100);
    window.addEventListener("online", refresh);
    const stop = () => output.stop();
    window.addEventListener("pagehide", stop);
    return () => {
      mounted.current = false;
      unsubscribe();
      clearInterval(poll);
      clearInterval(ticker);
      window.removeEventListener("online", refresh);
      window.removeEventListener("pagehide", stop);
      output.dispose();
    };
  }, [refresh, roomId, userId]);

  useEffect(() => {
    audio.current?.setVolume(sound.sfx);
    audio.current?.enable(sound.status === "ready" && !sound.muted && sound.sfx > 0);
  }, [sound.muted, sound.sfx, sound.status]);

  useEffect(() => {
    if (!state) return;
    feedback.current.observe(state, now, userId);
    setScene(feedback.current.scene());
    setLiveInkId(feedback.current.isLiveInk(ink?.id) ? ink.id : null);
  }, [state, now, userId, ink?.id]);

  const boundary = [
    state?.warnings[0]?.dueAt, state?.nextSupplyAt, search?.expiresAt, search?.lastResult?.availableAt, reward?.expiresAt,
    linkIndex?.expiresAt,
    ...(state?.effects.filter((effect) => effect.kind === "censor")
      .flatMap((effect) => [effect.startsAt, effect.expiresAt]) || []),
  ].filter((value) => value && effectTime(value) > Date.parse(state?.serverTime)).sort((a, b) => effectTime(a) - effectTime(b))[0];
  const skew = state ? Date.parse(state.serverTime) - state.receivedAt : 0;
  useEffect(() => {
    if (!boundary || finished) return undefined;
    const timeout = setTimeout(refresh, Math.max(80, Date.parse(boundary) - (Date.now() + skew) + 120));
    return () => clearTimeout(timeout);
  }, [boundary, finished, refresh, skew]);

  useEffect(() => {
    if (!current || finished) return undefined;
    const controller = new AbortController();
    setDocumentError("");
    fetchPageData(current.title, { signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return;
      if (String(data.revisionId) === current.revisionId && String(data.pageId) === current.pageId) {
        setDocument({ id: current.snapshotId, html: data.documentHtml, links: data.links, summary: data.summary });
        return;
      }
      return ensureWikiSnapshot({ title: current.title, pageId: current.pageId, revisionId: current.revisionId },
        { includeDocument: true }).then((pinned) => {
        if (controller.signal.aborted) return;
        if (pinned.snapshotId !== current.snapshotId || pinned.revisionId !== current.revisionId || pinned.pageId !== current.pageId || !pinned.documentHtml) {
          throw new Error("PINNED_DOCUMENT_REQUIRED");
        }
        const links = Array.isArray(pinned.links) ? pinned.links : [];
        setDocument({ id: current.snapshotId,
          html: sanitizeWikiDocumentHtml(pinned.documentHtml, { currentTitle: current.title, apiLinks: links }), links, summary: "" });
      });
    }).catch(() => { if (!controller.signal.aborted) setDocumentError("현재 문서의 스냅샷을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [current?.snapshotId, current?.pageId, current?.revisionId, current?.title, finished]);

  useEffect(() => {
    if (!search?.id) return undefined;
    const controller = new AbortController();
    setSearchError(false);
    duelV4.prepareSearch(roomId, search.id, controller.signal).then((doc) => {
      if (!controller.signal.aborted) setSearchDocument({ ...doc, windowId: search.id });
    }).catch(() => {
      if (!controller.signal.aborted) setSearchError(true);
    });
    return () => controller.abort();
  }, [roomId, search?.id, searchAttempt]);

  useEffect(() => {
    setSearchQuery("");
  }, [search?.id]);

  useEffect(() => {
    activeMatch.current = 0;
  }, [highlightedQuery]);

  async function run(operation, makeInput, previousRequest, item) {
    if (activeWork.current) return;
    activeWork.current = true;
    setBusy(true);
    setError("");
    let request = previousRequest;
    try {
      request ??= { id: crypto.randomUUID(), operation, input: await makeInput(), itemId: item?.itemId, slot: item?.slot, sentAt: Date.now() };
      let result;
      if (operation === "search") result = await duelV4.search(roomId, { ...request.input, id: request.id });
      else if (operation === "reward") result = await duelV4.reward(roomId, request);
      else result = await duelV4.act(roomId, request);
      if (!mounted.current) return;
      setRetry(null);
      if (!result.ok || result.code === "ITEM_CHANCE_FAILED") {
        setError(explanation(result.code));
      }
      const needsState = result.code === "THIEF_STOLEN" || result.code === "CANNON_LANDED";
      if (!needsState) {
        feedback.current.receipt(request, result);
        setScene(feedback.current.scene());
      }
      if (result.ok) {
        if (operation === "item") setSelected(null);
        if (result.roomId) navigate("/multiplayer/duel-v4/" + result.roomId);
      }
      const next = await refresh();
      if (needsState && mounted.current) {
        feedback.current.receipt(request, result, next);
        setScene(feedback.current.scene());
      }
    } catch (cause) {
      setRetry(request && !cause.code ? request : null);
      setError(explanation(cause.message));
    } finally {
      activeWork.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  if (!state) return <RaceFrame mode="duel" label="1:1 아이템전">
    <RaceHold title={connectionError || "경기를 불러오는 중…"}
      actions={<Link className="wr-race-btn" to="/play">모드 선택</Link>} />
  </RaceFrame>;

  const documentReady = searchReady || document?.id === current?.snapshotId;
  const useItem = (item, attackId) => run("item", async () => {
    const other = item.itemId === "enhancement" && state.inventory.find((row) => row.id !== item.id && !row.enhanced);
    const input = { grantId: item.id, ...(attackId ? { attackId } : {}), ...(other ? { targetGrantId: other.id } : {}) };
    if (item.itemId === "link_index" && item.tier === "enhanced") {
      const prepared = await duelV4.prepareSearch(roomId, item.id);
      if (prepared.snapshotId !== current?.snapshotId) throw new Error("SEARCH_SOURCE_CHANGED");
    }
    if (item.itemId !== "trap") return input;
    return { ...input, destinationPageId: trapLink, expectedTargetSnapshotId: opponent.page.snapshotId,
      expectedTargetProgressVersion: opponent.progressVersion };
  }, null, item);
  const navigateLink = (link) => run("move", async () => {
    const next = await findSnapshot(typeof link === "string" ? link : link.title);
    return { snapshotId: next.snapshotId, fromSnapshotId: current.snapshotId, expectedProgressVersion: me.progressVersion };
  });
  const resolveReward = (claim, replaceGrantId) => run("reward", async () => ({
    rewardId: reward.id, claim, replaceGrantId, inventoryToken: claim ? reward.inventoryToken : null,
  }));
  const frame = ink && { now, view: { effects: [{ effectId: ink.id, startsAt: Date.parse(ink.startsAt), expiresAt: effectTime(ink.expiresAt), tier: ink.tier }] } };
  const pulse = ink && { effectId: ink.id, static: !inkLive, index: inkLive ? Math.min(3, Math.max(1, 1 + Math.floor((now - Date.parse(ink.startsAt)) / 180))) : 3, tier: ink.tier };
  function stepSearch(direction) {
    const marks = article.current?.querySelectorAll("mark.game-search-highlight");
    if (!marks?.length) return;
    activeMatch.current = (activeMatch.current + direction + marks.length) % marks.length;
    marks[activeMatch.current].scrollIntoView({ block: "center" });
  }

  const feedbackScope = roomId + ":" + userId;
  const notice = <div className="duel-v4-messages" aria-live="polite">
    {MODE_FOLLOWUP_ENABLED && <DuelV4ItemFeedback key={feedbackScope} scope={feedbackScope}
      events={state.itemFeedback} now={now} />}
    {(error || connectionError) && <p>{error || connectionError}</p>}
    {retry && <button type="button" className="wr-race-btn" onClick={() => run(retry.operation, null, retry)} disabled={busy}>같은 요청 재시도</button>}
    {documentError && <p>{documentError}</p>}
  </div>;
  const elapsed = started ? Math.max(0, Math.floor(((finished ? Date.parse(state.finishedAt) : now) - Date.parse(state.startedAt)) / 1000)) : 0;
  if (finished) {
    const won = state.winnerId === userId;
    const detail = { normal_finish: "목표 문서에 도착했습니다.", forfeit: "기권으로 경기가 종료되었습니다.", cancelled: "경기가 취소되었습니다." }[state.finishReason];
    return <ResultScreen mode="duel" tone={won ? "win" : state.winnerId ? "lose" : "neutral"}
      titleId="duel-v4-result" resultKey={roomId + ":" + state.finishedAt} testId="duel-v4-result">
      <ResultCard label="경기 결과">
        <ResultOutcome kicker="1:1 아이템전" title={won ? "승리" : state.winnerId ? "패배" : "경기 무효"} titleId="duel-v4-result" detail={detail} />
        <ResultStats items={[{ label: "경기 시간", value: formatDuration(elapsed) }, { label: "이동", value: (me?.moves ?? 0) + "회" }]} />
        <ResultXpRow label="서버 지급 기록"><strong>획득 XP +{state.xp}</strong></ResultXpRow>
        {state.players.map(player => <ResultRoute key={player.id} title={player.id === userId ? "내 경로" : player.name + "의 경로"}
          meta={player.moves + "회 이동"} path={player.path?.map(page => page.title) ?? []}
          reachedTarget={state.finishReason === "normal_finish" && player.id === state.winnerId} />)}
        {notice}
        <ResultActions>
          <Link className="wr-race-btn" to="/play">플레이로 돌아가기</Link>
          <button className="wr-race-btn wr-race-btn--primary" type="button" disabled={busy} onClick={() => run("rematch", async () => ({}))}>재경기</button>
        </ResultActions>
      </ResultCard>
    </ResultScreen>;
  }
  if (!started) return <main className="wr-page wr65-field wr-room wr-room--duel duel-v4-lobby">
    <LobbyHeader kicker="ITEM RACE · 1:1" title="1:1 아이템전" onLeave={() => navigate("/play")} leaveLabel="모드 선택">
      <span data-duel-v4-code><CopyCodeButton code={state.code} /></span>
    </LobbyHeader>
    {notice}
    {MODE_FOLLOWUP_ENABLED && me && <S5KionDock key={feedbackScope} mode="duel"
      roomId={roomId} actorId={userId} players={state.players} label="대기방 키온 감정표현" />}
    <section className="duel-v4-camp" aria-label="대기실 참가자와 목표">
      <ul className="duel-v4-seats" aria-label="참가자">
        {[me, opponent].map((player, index) => <li key={index}>
          <strong>{player?.name || "참가자 대기 중"}</strong>
          {player?.id === state.hostId && <HostTag />}
          {player?.id === userId && <MeTag />}
          <StatusMark tone={player ? "ready" : "pending"}>{player ? "입장 완료" : "대기 중"}</StatusMark>
        </li>)}
      </ul>
      <p>목표 문서 · <strong>{state.target?.title || "선택 대기"}</strong></p>
      {state.hostId === userId ? <>
        <form onSubmit={(event) => {
          event.preventDefault();
          void run("target", async () => ({ snapshotId: (await findSnapshot(target)).snapshotId }));
        }}>
          <label>목표 문서 <input value={target} onChange={(event) => setTarget(event.target.value)} required /></label>
          <button className="wr-btn wr-btn--neutral" disabled={busy}>목표 저장</button>
        </form>
        <button className="wr-btn wr-btn--primary" disabled={busy || !opponent || !state.target} onClick={() => run("start", async () => {
          const title = await fetchDistinctRandomTitle(new Set([normalizeTitle(state.target.title)]));
          return { snapshotId: (await findSnapshot(title)).snapshotId };
        })}>게임 시작</button>
      </> : <p>방장이 목표를 선택하고 시작합니다.</p>}
    </section>
  </main>;

  const ownPath = me?.path?.map(page => page.title) ?? [];
  return <div className="duel-v4" data-duel-v4-version={state.version}>
    <RaceFrame mode="duel" strip label="1:1 아이템 경기">
      <RaceHud>
        <HudBrand mode="1:1 아이템전" />
        <div className="wr-duel-hud-course">
          <HudDoc label="현재 문서" title={current?.title} />
          <HudArrow />
          <HudDoc kind="goal" label="목표 문서" title={state.target?.title} />
        </div>
        <HudStat label="이동" value={(me?.moves ?? 0) + "회"} />
        <HudTimer label="경과" seconds={elapsed} />
        <HudExit label="기권" onClick={() => run("forfeit", async () => ({}))} disabled={busy} />
      </RaceHud>
      <div className="wr-race-strip" role="group" aria-label="상대 상태">
        <strong>{opponent?.name || "상대"}</strong>
        {opponent?.page?.title && <span>{opponent.page.title}</span>}
        {opponent && <span>{opponent.moves}회 이동</span>}
        {connectionError && <ConnectionDot ok={false} label="경기 연결 확인 필요" />}
      </div>
      {notice}
      {MODE_FOLLOWUP_ENABLED && me && <S5KionDock key={feedbackScope} mode="duel"
        roomId={roomId} actorId={userId} players={state.players} label="경기 중 키온 감정표현" />}
      <MobileRouteNotes path={ownPath} />
      <div className="duel-v4-feedback" aria-live="polite" aria-relevant="additions text">
        {notices.filter(notice => notice.until > clock).map(notice =>
          <p key={notice.key} className="wr-pill" data-item-result={notice.tone}>{notice.text}</p>)}
      </div>
      {(effects.some(effect => effectLabels[effect.kind]) || searchTimed || bookmark) && <ul className="duel-v4-effects" aria-label="현재 적용 중인 아이템 효과">
        {effects.filter(effect => effectLabels[effect.kind]).map(effect => <li key={effect.id} className="wr-pill" data-effect-kind={effect.kind}>
          {effectLabels[effect.kind]} · {effect.expiresAt === "infinity" ? "발동 시까지" : `${secondsLeft(effect.expiresAt, now)}초`}
        </li>)}
        {searchTimed && <li className="wr-pill">문서 검색 · {secondsLeft(search.expiresAt, now)}초 · {search.remaining}회</li>}
        {bookmark && <li className="wr-pill">경로 책갈피 · {bookmark.uses}회</li>}
      </ul>}
      <div className="wr-race-body">
        <aside className="wr-race-side"><RouteRail path={ownPath} currentTitle={current?.title} /></aside>
      <section className="wr-race-main duel-v4-document" ref={article}>
        {stunned && <p role="status">{messages.STUNNED}</p>}
        {search && <section aria-label="문서 내 검색">
          {searchError ? <button onClick={() => setSearchAttempt((attempt) => attempt + 1)}>검색 본문 다시 불러오기</button>
            : !searchReady && <p role="status">검색 본문을 준비하고 있습니다.</p>}
          {searchReady && search.remaining > 0 && <form onSubmit={(event) => {
            event.preventDefault();
            void run("search", async () => ({ windowId: search.id, query: searchQuery.trim(), documentHash: searchDocument.documentHash }));
          }}>
            <label>문서 검색어 <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} maxLength={4096} /></label>
            <button disabled={busy || sealed || !searchQuery.trim()}>검색</button>
          </form>}
          {searchResult && <p role="status">{searchResult.count === null ? "검색 결과를 확인 중입니다."
            : `“${searchResult.query}” ${searchResult.count}개 발견`}</p>}
          {searchResult?.count > 1 && <>
            <button type="button" onClick={() => stepSearch(-1)}>이전 결과</button>
            <button type="button" onClick={() => stepSearch(1)}>다음 결과</button>
          </>}
        </section>}
        <WikiViewer target={{ title: state.target.title }} currentTitle={current?.title} currentSummary={documentReady ? document?.summary : ""}
          currentDocumentHtml={searchReady ? searchDocument.documentHtml : documentReady ? document?.html : ""}
          links={documentReady ? document?.links : []} authorizedSearchQuery={highlightedQuery}
          isLoading={!documentReady && !documentError} readOnly={busy || !documentReady || stunned} onLinkClick={navigateLink}
          censoredTitles={state.censoredTitles} showTargetBrief={false} />
        {ink && <FinalInkVfx pulse={pulse} frame={frame} />}
        <FinalItemMotion value={{ shieldActive: protectedByShield, thunder, lost: warning?.itemId === "lost_link",
          scene: scene?.until > clock ? scene : null }} />
      </section>
      </div>
      {linkIndex && <LinkList key={linkIndex.id} index={linkIndex} disabled={busy || stunned} onLink={navigateLink} />}
      {state.rouletteSupplyWeakened && <p role="status">다음에 실제로 받는 보급 아이템이 약화됩니다.</p>}
      {reward && <section className="duel-v4-reward" aria-label="보상 아이템">
        <FinalItemIcon item={{ itemId: reward.itemId, effectiveTier: reward.tier }} />
        <strong>{itemName(reward.itemId)} {tierLabel(reward.tier)}</strong>
        {state.inventory.length < 2
          ? <button onClick={() => resolveReward(true)} disabled={busy}>보상 받기</button>
          : state.inventory.map((item) => <button key={item.id} onClick={() => resolveReward(true, item.id)} disabled={busy}>
            {itemName(item.itemId)} 교체
          </button>)}
        <button onClick={() => resolveReward(false)} disabled={busy}>보상 버리기</button>
      </section>}
        {bookmark && bookmark.page.snapshotId !== current?.snapshotId &&
        <button onClick={() => run("bookmark", async () => ({}))} disabled={busy}>책갈피로 돌아가기</button>}
      <footer className="duel-v4-dock" aria-label="아이템 도크">
        {chosen && <aside className="duel-v4-sheet" aria-label="아이템 사용">
          <strong>{itemName(chosen.itemId)} {tierLabel(chosen.tier)}</strong>
          <button onClick={() => setSelected(null)}>닫기</button>
          {chosen.itemId === "trap" && <label>설치할 링크
            <select value={trapLink} onChange={(event) => setTrapLink(event.target.value)}>
              <option value="">링크 선택</option>
              {state.trapOptions.map((link) => <option value={link.pageId} key={link.pageId}>{link.title}</option>)}
            </select>
          </label>}
          {chosen.itemId !== "parry" && <button onClick={() => useItem(chosen)}
            disabled={busy || sealed || (chosen.itemId === "trap" && !trapLink)}>사용</button>}
        </aside>}
        {warning && <div className="duel-v4-warning" role="status">
          <div>
            <span>{itemName(warning.itemId)} 공격</span>
            <div className="duel-v4-reaction" aria-live="off">
              <progress aria-label="공격까지 남은 시간" max={V4_PARRY_WINDOW_MS} value={warningMs} />
              <span>{(Math.ceil(warningMs / 100) / 10).toFixed(1)}초</span>
            </div>
          </div>
          {parry && <button className="duel-v4-parry" onClick={() => useItem(parry, warning.id)} disabled={busy || sealed}>패링</button>}
        </div>}
        <div className="duel-v4-slots">
          {[1, 2].map((slot) => {
            const item = state.inventory.find((row) => row.slot === slot);
            return <button key={slot} type="button" disabled={!item || busy} onClick={() => setSelected(item.id)} data-duel-v4-item={item?.itemId}>
              {item && <FinalItemIcon item={{ ...item, effectiveTier: item.tier }} />}
              {item ? itemName(item.itemId) + (tierLabel(item.tier) ? " " + tierLabel(item.tier) : "") : "빈 슬롯"}
            </button>;
          })}
          {state.nextSupplyAt && <span>보급 {secondsLeft(state.nextSupplyAt, now)}초</span>}
        </div>
      </footer>
    </RaceFrame>
  </div>;
}

function Entry() {
  const navigate = useNavigate();
  const [access, setAccess] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const createId = useRef(null);
  useEffect(() => {
    let active = true;
    duelV4.entry().then(({ available }) => { if (active) setAccess(available); })
      .catch((cause) => { if (active) setError(explanation(cause.message)); });
    return () => { active = false; };
  }, []);

  async function enter(create) {
    setBusy(true);
    setError("");
    try {
      if (create) createId.current ??= crypto.randomUUID();
      const roomId = create ? await duelV4.create(createId.current) : await duelV4.join(code);
      navigate("/multiplayer/duel-v4/" + roomId);
    } catch (cause) {
      setError(explanation(cause.message));
    } finally {
      setBusy(false);
    }
  }
  return <main className="wr-page wr65-field wr-room wr-room--duel duel-v4-lobby">
    <LobbyHeader kicker="ITEM RACE · 1:1" title="1:1 아이템전" onLeave={() => navigate("/play")} leaveLabel="모드 선택" />
    <section className="duel-v4-camp" aria-label="방 만들기와 코드 입장">
    {error && <p role="alert">{error}</p>}
    {access === false && <p>{explanation("DUEL_V4_ENTRY_CLOSED")}</p>}
    {access === null && !error && <p role="status">입장 권한 확인 중…</p>}
    {access && <>
      <button disabled={busy} onClick={() => enter(true)}>방 만들기</button>
      <form onSubmit={(event) => { event.preventDefault(); void enter(false); }}>
        <label>방 코드 <input required value={code} onChange={(event) => setCode(event.target.value)} /></label>
        <button disabled={busy}>입장</button>
      </form>
    </>}
    </section>
  </main>;
}

export default function DuelV4Page() {
  const { roomId } = useParams();
  const { user } = useAuth();
  if (!user) return null;
  return roomId ? <Match key={roomId} roomId={roomId} userId={user.id} /> : <Entry />;
}
