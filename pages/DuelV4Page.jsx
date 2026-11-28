import ExplorationHintPanel from "../components/wiki-race/race/ExplorationHintPanel.jsx";
import React, { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../authContext.jsx";
import WikiViewer from "../components/group-items-jungle/S5WikiViewer.jsx";
import { LinkList } from "../components/group-items-jungle/S5Panels.jsx";
import { FinalAssetOverlay, FinalItemIcon, preloadFinalInk } from "../components/group-items-jungle/FinalAssetVfx.jsx";
import { createFinalAssetAudio } from "../components/group-items-jungle/finalAssetAudio.js";
import { itemName, tierLabel } from "../components/group-items-jungle/s5UiContract.js";
import { duelV4 } from "../services/duelV4Service.js";
import { checkItemRaceSession } from "../services/itemModeEntryService.js";
import { createItemRaceReader, itemRaceFailure, itemRaceFailureMessage } from "../services/itemRaceRecovery.js";
import { createItemRaceClock } from "../services/itemRaceClock.js";
import DuelV4ItemFeedback from "../components/DuelV4ItemFeedback.jsx";
import S5KionDock, { MODE_FOLLOWUP_ENABLED } from "../components/group-items-jungle/S5KionDock.jsx";
import { activeV4Effects, appendDuelV4Notice, createDuelV4Presentation, effectLabels, effectTime, V4_PARRY_WINDOW_MS } from "../services/duelV4Presentation.js";
import { audioManager } from "../services/audioManager.js";
import { fetchDistinctRandomTitle, fetchPageData, formatDuration, normalizeTitle, sanitizeWikiDocumentHtml } from "../services/wikiService.js";
import { ensureWikiSnapshot } from "../services/wikiSnapshotService.js";
import useGameAudio from "../hooks/useGameAudio.js";
import useRaceMotion from "../hooks/useRaceMotion.js";
import useItemRaceTarget from "../hooks/useItemRaceTarget.js";
import useMatchExpression from "../hooks/useMatchExpression.js";
import useProfileCards from "../hooks/useProfileCards.js";
import { useExitGuard } from "../components/ExitGuard.jsx";
import PageLoadingOverlay from "../components/PageLoadingOverlay.jsx";
import ScrollToTopButton from "../components/ScrollToTopButton.jsx";
import VsIntroOverlay from "../components/VsIntroOverlay.jsx";
import ResultXp from "../components/ResultXp.jsx";
import FinishEffect from "../components/FinishEffect.jsx";
import { ParticipantRoster } from "../components/wiki-race/race/GroupRaceParts.jsx";
import { orderGroupParticipants } from "../utils/groupRacePresentation.js";
import { buildProfileCard, mergeRewardSlots } from "../utils/profileCard.js";
import { CopyCodeButton, LobbyHeader, LobbyIcon, LobbyShell } from "../components/wiki-race/LobbyParts.jsx";
import { ItemRoomRoster } from "../components/wiki-race/ItemRoomLobby.jsx";
import ItemDuelTarget from "../components/wiki-race/ItemDuelTarget.jsx";
import RematchResultAction from "../components/RematchResultAction.jsx";
import DuelEndSequence from "../components/cinematic/DuelEndSequence.jsx";
import { buildDuelEndScene } from "../utils/duelEndPresentation.js";
import ItemRaceSlots, { ItemRaceDescription } from "../components/wiki-race/race/ItemRaceSlots.jsx";
import ItemRaceStart from "../components/wiki-race/race/ItemRaceStart.jsx";
import ScheduledItemCountdown from "../components/wiki-race/race/ScheduledItemCountdown.jsx";
import useItemSupplyArrival from "../hooks/useItemSupplyArrival.js";
import { ConnectionDot, HudArrow, HudBrand, HudDoc, HudExit, HudStat, HudTimer, MobileRouteNotes, RaceFrame, RaceHold, RaceHud, RouteRail } from "../components/wiki-race/race/RaceParts.jsx";
import { ResultActions, ResultCard, ResultOutcome, ResultRoute, ResultScreen, ResultStats, ResultXpRow } from "../components/wiki-race/result/ResultParts.jsx";
import "./duelV4.css";

const messages = {
  DUEL_V4_ENTRY_CLOSED: "지금은 1:1 아이템전에 새로 입장할 수 없어요.",
  DUEL_V4_MEMBER_REQUIRED: "이 방의 참가자만 경기 상태를 열 수 있습니다.",
  DUEL_V4_ROOM_NOT_AVAILABLE: "방 코드를 확인해주세요.",
  PARRY_WINDOW_CLOSED: "패링 시간이 지났습니다.",
  PARRY_TARGET_CHANGED: "반사 대상이 바뀌어 패링이 적용되지 않았습니다.",
  WAITING_ROOM_CLOSED: "이미 닫힌 방이에요.",
  MATCH_STARTING: "시작 신호를 기다려 주세요.",
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

async function enterDuelV4Rematch(roomId) {
  const result = await duelV4.act(roomId, { id:crypto.randomUUID(), operation:"rematch", input:{} });
  if (!result.ok) throw new Error(result.code);
  return result.roomId;
}
const duelRematch = {
  fetch:async roomId => (await duelV4.state(roomId)).rematchId,
  create:enterDuelV4Rematch,
  join:enterDuelV4Rematch,
  path:roomId => `/multiplayer/duel-v4/${roomId}`,
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

function Match({ roomId, user, logout }) {
  const userId = user.id;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [state, setState] = useState(null);
  const [document, setDocument] = useState(null);
  const [searchDocument, setSearchDocument] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState(false);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState(null);
  const [moveMotion, approveMoveMotion] = useRaceMotion();
  const [documentAttempt, setDocumentAttempt] = useState(0);
  const [documentError, setDocumentError] = useState("");
  const [targetSearching, setTargetSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [rewardGrant, setRewardGrant] = useState(null);
  const [trapLink, setTrapLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(null);
  const [clock, setClock] = useState(() => performance.now());
  const [notices, setNotices] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [liveInkId, setLiveInkId] = useState(null);
  const activeWork = useRef(false);
  const latestState = useRef(null);
  const readFailure = useRef(null);
  const reader = useRef(null);
  const audio = useRef(null);
  const feedback = useRef(null);
  const mounted = useRef(false);
  const article = useRef(null);
  const itemOpener = useRef(null);
  const itemPanelClose = useRef(null);
  const enteredFromLobby = useRef(false);
  const sawRace = useRef(false);
  const itemPanelId = useId();
  const activeMatch = useRef(0);
  const sound = useSyncExternalStore(audioManager.subscribe, audioManager.getSnapshot, audioManager.getSnapshot);

  const refresh = useCallback((options) => reader.current?.(options), []);

  const me = state?.players.find((player) => player.id === userId);
  const opponent = state?.players.find((player) => player.id !== userId);
  const current = me?.page;
  const scheduledAt = state?.scheduledStartAt ?? state?.startedAt;
  const scheduled = Boolean(scheduledAt && Date.parse(state.serverTime) < Date.parse(scheduledAt));
  const started = Boolean(state?.startedAt && !scheduled);
  const finished = Boolean(state?.finishedAt);
  const now = state ? state.displayServerTime + Math.max(0, clock - state.receivedAt) : Date.now();
  const unavailable = Boolean(connectionError);
  const waiting = Boolean(state && !state.waitingClosedAt && !started);
  const targetBrief = useItemRaceTarget(scheduled || started ? state?.target?.title : null);
  const profiles = useProfileCards([me?.id, opponent?.id]);
  const matchExpression = useMatchExpression(finished && state?.winnerId === userId ? userId : null);
  const { requestExit, dialog:exitDialog } = useExitGuard({ enabled:started && !finished,
    onConfirm:async () => Boolean(await run("forfeit", async () => ({}))) });
  useEffect(() => { if (started && !finished) sawRace.current = true; }, [started, finished]);
  useEffect(() => {
    if (waiting && !scheduled) {
      enteredFromLobby.current = true;
      audioManager.prepare(["tick", "go", "itemReveal", "denied"]);
    }
  }, [scheduled, waiting]);

  const nextSupplyMs = Date.parse(state?.nextSupplyAt);
  const startedMs = Date.parse(state?.startedAt);
  const supplyRound = (nextSupplyMs - startedMs - 20_000) / 25_000;
  const initialSupply = supplyRound === 0;
  const suppliedGrant = useItemSupplyArrival(state && {
    round:Number.isSafeInteger(supplyRound) && supplyRound >= 0 ? String(supplyRound) : null, initialRound:initialSupply,
    grantId:state.supplyGrant?.round===String(supplyRound) ? state.supplyGrant.grantId : null,
    dueAt:initialSupply ? startedMs : nextSupplyMs-25_000,
    observedAt:Date.parse(state.serverTime), revision:Number(state.version),
    inventory:state.inventory.map(item=>item.id), live:started && !finished && (initialSupply || !activeWork.current) && !connectionError,
    sideEffects:JSON.stringify([state.attackResults,state.reward?.id,state.itemFeedback]),
  },roomId,enteredFromLobby.current);
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
    if (selected) itemPanelClose.current?.focus();
  }, [selected]);

  function closeItem() {
    setSelected(null);
    itemOpener.current?.focus();
  }

  useEffect(() => {
    mounted.current = true;
    const output = createFinalAssetAudio(window);
    audio.current = output;
    feedback.current = createDuelV4Presentation(() => output, notice =>
      setNotices(previous => appendDuelV4Notice(previous, notice, Date.now())));
    preloadFinalInk();
    const lifetime = new AbortController();
    const serverClock = createItemRaceClock();
    reader.current = createItemRaceReader(async signal => {
      const sent = performance.now();
      try {
        const next = await duelV4.state(roomId, signal);
        if (lifetime.signal.aborted) return;
        const previous = latestState.current;
        const observedAt = Date.parse(next.serverTime);
        if (previous && (previous.version > next.version ||
          (previous.version === next.version && Date.parse(previous.serverTime) > observedAt))) return previous;
        const receivedAt = performance.now();
        const displayServerTime = serverClock.observe(observedAt, receivedAt - sent, receivedAt);
        const accepted = { ...next, receivedAt, displayServerTime };
        latestState.current = accepted;
        readFailure.current = null;
        setConnectionError(null);
        setState(accepted);
        return accepted;
      } catch (cause) {
        if (lifetime.signal.aborted) return;
        const failure = itemRaceFailure(cause);
        readFailure.current = failure;
        setConnectionError(failure);
        if (failure.kind === "auth") void checkItemRaceSession(userId);
      }
    }, lifetime.signal);
    void refresh();
    const unsubscribe = duelV4.subscribe(roomId, userId, () => refresh({ trailing:true }));
    let poll;
    function pollState() {
      const current = latestState.current;
      if (!current?.finishedAt && !current?.waitingClosedAt) void refresh();
      poll = setTimeout(pollState, current?.startedAt ? 4500 : 1250);
    }
    poll = setTimeout(pollState, 1250);
    const ticker = setInterval(() => setClock(performance.now()), 100);
    const resume = () => { if (!window.document.hidden) void refresh({ trailing:true }); };
    const offline = () => {
      const failure = { kind:"connection" };
      readFailure.current = failure;
      setConnectionError(failure);
    };
    window.addEventListener("online", resume);
    window.addEventListener("offline", offline);
    window.document.addEventListener("visibilitychange", resume);
    const stop = () => output.stop();
    window.addEventListener("pagehide", stop);
    return () => {
      mounted.current = false;
      unsubscribe();
      lifetime.abort();
      reader.current = null;
      clearTimeout(poll);
      clearInterval(ticker);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", offline);
      window.document.removeEventListener("visibilitychange", resume);
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
    setScenes(feedback.current.scenes());
    setLiveInkId(feedback.current.isLiveInk(ink?.id) ? ink.id : null);
  }, [state, now, userId, ink?.id]);

  const boundary = [
    state?.warnings[0]?.dueAt, state?.nextSupplyAt, search?.expiresAt, search?.lastResult?.availableAt, reward?.expiresAt,
    linkIndex?.expiresAt,
    ...(state?.effects.filter((effect) => effect.kind === "censor")
      .flatMap((effect) => [effect.startsAt, effect.expiresAt]) || []),
  ].filter((value) => value && effectTime(value) > Date.parse(state?.serverTime)).sort((a, b) => effectTime(a) - effectTime(b))[0];
  const skew = state ? state.displayServerTime - state.receivedAt : 0;
  useEffect(() => {
    if (!boundary || finished) return undefined;
    const timeout = setTimeout(refresh, Math.max(80, Date.parse(boundary) - (performance.now() + skew) + 120));
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
        { includeDocument: true, signal:controller.signal }).then((pinned) => {
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
  }, [current?.snapshotId, current?.pageId, current?.revisionId, current?.title, documentAttempt, finished]);

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
    if (activeWork.current || readFailure.current) return;
    activeWork.current = true;
    setBusy(true);
    setError("");
    let request = previousRequest;
    try {
      request ??= { id: crypto.randomUUID(), operation, input: await makeInput(), itemId: item?.itemId, slot: item?.slot, sentAt: Date.now() };
      if (!mounted.current || readFailure.current) return;
      let result;
      if (operation === "search") result = await duelV4.search(roomId, { ...request.input, id: request.id });
      else if (operation === "reward") result = await duelV4.reward(roomId, request);
      else result = await duelV4.act(roomId, request);
      if (!mounted.current) return;
      if (result.code === "REWARD_CLAIMED" && result.grantId && !previousRequest) setRewardGrant(result.grantId);
      setRetry(null);
      if (!result.ok || result.code === "ITEM_CHANCE_FAILED") {
        setError(explanation(result.code));
      }
      const needsState = ["THIEF_STOLEN","CANNON_LANDED","CANNON_RETURNED"].includes(result.code);
      if (!needsState) {
        feedback.current.receipt(request, result);
        setScenes(feedback.current.scenes());
      }
      if (result.ok) {
        if (operation === "move" && !previousRequest) {
          approveMoveMotion(`${roomId}:${request.id}`, true);
          window.scrollTo({ top:0, behavior:"instant" });
        }
        if (operation === "leave_waiting") return true;
        if (operation === "item" && item?.itemId !== "parry") closeItem();
        if (result.roomId) navigate("/multiplayer/duel-v4/" + result.roomId);
      }
      const next = await refresh({ trailing:true });
      if (needsState && mounted.current) {
        feedback.current.receipt(request, result, next);
        setScenes(feedback.current.scenes());
      }
      return result.ok;
    } catch (cause) {
      if (!mounted.current) return;
      const failure = itemRaceFailure(cause);
      setRetry(request && failure.kind === "connection" ? request : null);
      if (failure.kind !== "connection" || !messages[cause.message]) {
        setError(itemRaceFailureMessage(failure));
        if (failure.kind === "auth") void checkItemRaceSession(userId);
      } else setError(explanation(cause.message));
    } finally {
      activeWork.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  if (!state || ["denied","closed"].includes(connectionError?.kind)) return <RaceFrame mode="duel" label="1:1 아이템전">
    <RaceHold title={connectionError ? itemRaceFailureMessage(connectionError) : "경기를 불러오는 중…"}
      actions={<>{connectionError && <button type="button" className="wr-race-btn" onClick={refresh}>다시 확인</button>}
        <Link className="wr-race-btn" to="/play">모드 선택</Link></>} />
  </RaceFrame>;

  const documentReady = searchReady || document?.id === current?.snapshotId;
  const useItem = (item, attackId) => run("item", async () => {
    if (attackId && effectTime(warning?.dueAt) <= state.displayServerTime + performance.now() - state.receivedAt) {
      throw new Error("PARRY_WINDOW_CLOSED");
    }
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
    {connectionError && !started && <p role="status">{itemRaceFailureMessage(connectionError)}</p>}
    {error && <p>{error}</p>}
    {retry && <button type="button" className="wr-race-btn" onClick={() => run(retry.operation, null, retry)} disabled={busy || unavailable}>같은 요청 재시도</button>}
    {connectionError && !started && <button type="button" className="wr-race-btn" onClick={refresh}>경기 상태 다시 확인</button>}
    {documentError && <p role="alert">{documentError} <button type="button" className="wr-race-btn" onClick={() => setDocumentAttempt(value => value+1)}>문서 다시 불러오기</button></p>}
  </div>;
  const elapsed = started ? Math.max(0, Math.floor(((finished ? Date.parse(state.finishedAt) : now) - Date.parse(state.startedAt)) / 1000)) : 0;
  if (state.waitingClosedAt) return <RaceFrame mode="duel" label="1:1 아이템전">
    <RaceHold title="방장이 대기방을 닫았어요." actions={<Link className="wr-race-btn" to="/play">플레이로 돌아가기</Link>}/>
  </RaceFrame>;
  if (scheduled) return <ScheduledItemCountdown roomId={roomId} startsAt={scheduledAt}
    serverObservedAt={state.serverTime} clockAnchor={{ server:state.displayServerTime, local:state.receivedAt }} startTitle={current?.title} targetTitle={state.target?.title}
    intro={enteredFromLobby.current && me && opponent && <VsIntroOverlay sceneKey={`v4:${roomId}:${scheduledAt}:${userId}`}
      myName={me.name} opponentName={opponent.name} startTitle={current?.title} targetTitle={state.target?.title}
      myPlayer={{ user_id:me.id }} opponentPlayer={{ user_id:opponent.id }} />}
    onBoundary={refresh}/>;
  if (finished) {
    const won = state.winnerId === userId;
    const detail = {
      normal_finish: won ? "목표 문서에 먼저 도착했습니다." : "상대가 목표 문서에 먼저 도착했습니다.",
      forfeit: won ? "상대가 기권했습니다." : "기권으로 경기가 종료되었습니다.",
      cancelled: "경기가 취소되었습니다.",
    }[state.finishReason];
    const scenePlayers = state.players.map(player => ({ user_id:player.id, nickname_snapshot:player.name,
      retire_reason:state.finishReason === "forfeit" && player.id !== state.winnerId ? "forfeited" : undefined }));
    const scene = buildDuelEndScene({ status:"finished", winner_user_id:state.winnerId, finished_reason:state.finishReason }, scenePlayers, userId);
    return <DuelEndSequence identity={`v4:${roomId}:${state.finishedAt}:${userId}`} scene={scene} eligible={sawRace.current}
      myPlayer={scenePlayers.find(player=>player.user_id===userId)} opponentPlayer={scenePlayers.find(player=>player.user_id!==userId)}>
      <ResultScreen mode="duel" tone={won ? "win" : state.winnerId ? "lose" : "neutral"}
      titleId="wr-duel-result-title" resultKey={roomId + ":" + state.finishedAt} motionEligible={false} testId="duel-v4-result">
      <ResultCard label="경기 결과">
        <ResultOutcome kicker="1:1 아이템전" title={won ? "승리" : state.winnerId ? "패배" : "경기 무효"} titleId="wr-duel-result-title" detail={detail} />
        <ResultStats items={[{ label: "경기 시간", value: formatDuration(elapsed) }, { label: "이동", value: (me?.moves ?? 0) + "회" },
          { label:"공통 코스", value:`${state.start?.title ?? me?.path?.[0]?.title ?? "출발"} → ${state.target?.title ?? "목표"}` }]} />
        <ResultXpRow>{state.resultRoomId ? <ResultXp scope="duel" userId={userId} roomId={state.resultRoomId} motionEligible={sawRace.current} />
          : <strong>획득 XP +{state.xp}</strong>}</ResultXpRow>
        {state.players.map(player => <ResultRoute key={player.id} title={player.id === userId ? "내 경로" : player.name + "의 경로"}
          meta={player.moves + "회 이동"} path={player.path?.map(page => page.title) ?? []}
          tail={player.id === userId && won && state.finishReason === "normal_finish" && sawRace.current
            ? <FinishEffect effect={matchExpression.finish_effect} /> : null}
          reachedTarget={state.finishReason === "normal_finish" && player.id === state.winnerId} />)}
        {notice}
        <ResultActions>
          <Link className="wr-race-btn" to="/play">플레이로 돌아가기</Link>
          <RematchResultAction sourceRoomId={roomId} mode="duel" isHost={state.hostId === userId} enabled adapter={duelRematch} />
        </ResultActions>
      </ResultCard>
    </ResultScreen></DuelEndSequence>;
  }
  if (!started) {
    const isHost = state.hostId === userId;
    const ready = Boolean(opponent && state.target);
    const players = state.players.map(player => ({
      key: player.id, userId: player.id, name: player.name, host: player.id === state.hostId,
    })).sort((a, b) => Number(b.host) - Number(a.host));
    const leave = () => state.waitingActionsVersion ? run("leave_waiting", async () => ({})) : Promise.resolve(true);
    const leaveTo = async destination => { if (await leave()) navigate(destination); };
    return <LobbyShell user={user} mode="duel" onNavigate={leaveTo} onLogout={async () => {
      if (!(await leave())) return;
      await logout();
      navigate("/");
    }}>
      <LobbyHeader kicker="1:1 대전 준비" title="1:1 아이템전" onLeave={() => void leaveTo("/play")} leaveLabel="방 나가기">
        <span className="wr-head-code" data-duel-v4-code><span>방 코드</span><CopyCodeButton code={state.code} compact /></span>
      </LobbyHeader>
      {notice}
      <ItemRoomRoster mode="duel" players={players} user={user} maxPlayers={2} emotes={MODE_FOLLOWUP_ENABLED && me &&
        <S5KionDock key={feedbackScope} mode="duel" lobby roomId={roomId} actorId={userId}
          players={state.players} disabled={unavailable} label="대기방 키온 감정표현" />} />
      <ItemDuelTarget title={state.target?.title} isHost={isHost} busy={busy || unavailable} onSearchBusy={setTargetSearching}
        onSelect={title => run("target", async () => ({ snapshotId: (await findSnapshot(title)).snapshotId }))} />
      <div className="wr-lobby-actions">
        <span className="wr-lobby-count">{players.length} / 2</span>
        <p id="item-duel-start-status" className="wr-lobby-status" role="status">
          <LobbyIcon name={ready ? "check" : "pending"} />
          {!opponent ? "상대의 입장을 기다리는 중" : !state.target ? "공통 목표를 선택해 주세요" : isHost ? "경기를 시작할 수 있어요" : "방장이 시작하기를 기다리는 중"}
        </p>
        {isHost && <button type="button" className="wr-btn wr-btn--primary wr-btn--lg" disabled={busy || unavailable || targetSearching || !ready}
          aria-describedby="item-duel-start-status" onClick={() => void run(state.waitingActionsVersion ? "start_scheduled" : "start", async () => {
            const title = await fetchDistinctRandomTitle(new Set([normalizeTitle(state.target.title)]));
            return { snapshotId: (await findSnapshot(title)).snapshotId };
          })}>게임 시작</button>}
      </div>
    </LobbyShell>;
  }

  const ownPath = me?.path?.map(page => page.title) ?? [];
  const entries = orderGroupParticipants(state.players.map(player => ({ user_id:player.id,
    nickname_snapshot:player.name, move_count:player.moves, current_title:player.page?.title,
    status:player.disconnected ? "disconnected" : "playing",
    profileCard:mergeRewardSlots(buildProfileCard({ userId:player.id,nickname:player.name,source:"snapshot" }),profiles[player.id]) })));
  const slots = [1, 2].map(slot => {
    const item = state.inventory.find(row => row.slot === slot);
    return item && { key: item.id, itemId: item.itemId, tier: item.tier,
      available: !busy && !unavailable && !sealed && (item.itemId !== "parry" || Boolean(warning)) };
  });
  const liveNotices = notices.filter(notice => notice.until > Date.now());
  return <div className="duel-v4" data-duel-v4-version={state.version}>
    <RaceFrame motion={moveMotion} mode="duel" strip label="1:1 아이템 경기">
      {exitDialog}
      {!documentReady && !documentError && <PageLoadingOverlay />}
      <ItemRaceStart matchKey={roomId} startedAt={state.startedAt} now={now} enteredFromLobby={enteredFromLobby.current} />
      <RaceHud>
        <HudBrand mode="1:1 아이템전" />
        <div className="wr-duel-hud-course">
          <HudDoc label="현재 문서" title={current?.title} />
          <HudArrow />
          <HudDoc kind="goal" label="목표 문서" title={state.target?.title} />
        </div>
        <HudStat label="이동" value={(me?.moves ?? 0) + "회"} />
        <HudTimer label="경과" seconds={elapsed} />
        <HudExit label="기권" onClick={requestExit} disabled={busy || unavailable} />
        <div className="item-race-anchor duel-v4-hud-items" onKeyDown={event => { if (chosen && event.key === "Escape") closeItem(); }}>
        <ItemRaceSlots items={slots} selected={selected} expanded={Boolean(chosen)} panelId={itemPanelId} duel readOnly={unavailable} suppliedGrant={suppliedGrant} rewardGrants={rewardGrant ? [rewardGrant] : []}
          supplySeconds={state.nextSupplyAt ? secondsLeft(state.nextSupplyAt, now) : null}
          select={(item, event) => { itemOpener.current = event.currentTarget; setSelected(item.key); }} />
        {chosen && <aside className="duel-v4-sheet item-race-popover" id={itemPanelId} aria-label="아이템 사용">
          <div className="duel-v4-item-details"><ItemRaceDescription itemId={chosen.itemId} tier={chosen.tier} mode="duel" /></div>
          <button type="button" className="wr-race-btn wr-race-btn--ghost" ref={itemPanelClose} onClick={closeItem}>닫기</button>
          {chosen.itemId === "trap" && <label>설치할 링크
            <select value={trapLink} onChange={(event) => setTrapLink(event.target.value)}>
              <option value="">링크 선택</option>
              {state.trapOptions.map((link) => <option value={link.pageId} key={link.pageId}>{link.title}</option>)}
            </select>
          </label>}
          {chosen.itemId !== "parry" && <button type="button" className="wr-race-btn wr-race-btn--primary" onClick={() => useItem(chosen)}
            disabled={busy || unavailable || sealed || (chosen.itemId === "trap" && !trapLink)}>사용</button>}
        </aside>}
          {bookmark && bookmark.page.snapshotId !== current?.snapshotId &&
            <button type="button" className="wr-race-btn item-race-bookmark" onClick={() => run("bookmark", async () => ({}))}
              disabled={busy || unavailable}>책갈피 복귀</button>}
        </div>
        <div className="item-race-utility">
          <ExplorationHintPanel mode="duel_items" roomId={roomId} />
          {MODE_FOLLOWUP_ENABLED && me && <S5KionDock key={feedbackScope} mode="duel" roomId={roomId}
            actorId={userId} players={state.players} disabled={unavailable} label="경기 중 키온 감정표현" />}
          {liveNotices.filter(notice => notice.key.startsWith("weakening:")).map(notice =>
            <p key={notice.key} className="item-race-status" role="status">{notice.text}</p>)}
          {MODE_FOLLOWUP_ENABLED && <DuelV4ItemFeedback key={feedbackScope} scope={feedbackScope} events={state.itemFeedback} now={now} />}
          {connectionError && <p className="item-race-status" role="status">{itemRaceFailureMessage(connectionError)}
            {" "}<button type="button" className="wr-race-btn" onClick={refresh}>다시 확인</button>
          </p>}
        </div>
      </RaceHud>
      {reward && <section className="duel-v4-reward item-race-reward" aria-label="보상 아이템">
        <FinalItemIcon item={{ itemId: reward.itemId, effectiveTier: reward.tier }} />
        <strong>{itemName(reward.itemId)} {tierLabel(reward.tier)}</strong>
        {state.inventory.length < 2
          ? <button onClick={() => resolveReward(true)} disabled={busy || unavailable}>보상 받기</button>
          : state.inventory.map((item) => <button key={item.id} onClick={() => resolveReward(true, item.id)} disabled={busy || unavailable}>
            {itemName(item.itemId)} 교체
          </button>)}
        <button onClick={() => resolveReward(false)} disabled={busy || unavailable}>보상 버리기</button>
      </section>}
      <div className="wr-race-strip" role="group" aria-label="상대 상태">
        <strong>{opponent?.name || "상대"}</strong>
        {opponent?.page?.title && <span>{opponent.page.title}</span>}
        {opponent && <span>{opponent.moves}회 이동</span>}
        {opponent?.disconnected && <ConnectionDot ok={false} label="상대 재연결 중" />}
        {connectionError && <ConnectionDot ok={false} label="경기 연결 확인 필요" />}
      </div>
      {notice}
      <MobileRouteNotes path={ownPath} />
      <div className="duel-v4-feedback" aria-live="polite" aria-relevant="additions text">
        {liveNotices.filter(notice => !notice.key.startsWith("weakening:")).map(notice =>
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
        <aside className="wr-race-side"><ParticipantRoster entries={entries} myUserId={userId} />
          <RouteRail path={ownPath} currentTitle={current?.title} /></aside>
      <div className="duel-v4-document" data-s5-priority-vfx>
      <section className="wr-race-main" ref={article}>
        {stunned && <p role="status">{messages.STUNNED}</p>}
        {search && <section aria-label="문서 내 검색">
          {searchError ? <button onClick={() => setSearchAttempt((attempt) => attempt + 1)}>검색 본문 다시 불러오기</button>
            : !searchReady && <p role="status">검색 본문을 준비하고 있습니다.</p>}
          {searchReady && search.remaining > 0 && <form onSubmit={(event) => {
            event.preventDefault();
            void run("search", async () => ({ windowId: search.id, query: searchQuery.trim(), documentHash: searchDocument.documentHash }));
          }}>
            <label>문서 검색어 <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} maxLength={4096} /></label>
            <button disabled={busy || unavailable || sealed || !searchQuery.trim()}>검색</button>
          </form>}
          {searchResult && <p role="status">{searchResult.count === null ? "검색 결과를 확인 중입니다."
            : `“${searchResult.query}” ${searchResult.count}개 발견`}</p>}
          {searchResult?.count > 1 && <>
            <button type="button" onClick={() => stepSearch(-1)}>이전 결과</button>
            <button type="button" onClick={() => stepSearch(1)}>다음 결과</button>
          </>}
        </section>}
        <WikiViewer target={targetBrief} currentTitle={current?.title} currentSummary={documentReady ? document?.summary : ""}
          currentDocumentHtml={searchReady ? searchDocument.documentHtml : documentReady ? document?.html : ""}
          links={documentReady ? document?.links : []} authorizedSearchQuery={highlightedQuery}
          isLoading={!documentReady && !documentError} readOnly={busy || unavailable || !documentReady || stunned} onLinkClick={navigateLink}
          censoredTitles={state.censoredTitles} />
      </section>
        {!unavailable && <FinalAssetOverlay pulse={pulse} frame={frame} value={{ shieldActive: protectedByShield, thunder,
          lost: warning?.itemId === "lost_link", scenes }} />}
      </div>
      </div>
      {linkIndex && <LinkList key={linkIndex.id} index={linkIndex} disabled={busy || unavailable || stunned} onLink={navigateLink} />}
      {state.rouletteSupplyWeakened && <p role="status">다음에 실제로 받는 보급 아이템이 약화됩니다.</p>}
      <footer className="duel-v4-dock" data-item-race-dock aria-label="아이템 대응">
        {warning && <div className="duel-v4-warning" role="status">
          <div>
            <span>{opponent?.name || "상대"} · {itemName(warning.itemId)} 공격</span>
            <div className="duel-v4-reaction" aria-live="off">
              <progress aria-label="공격까지 남은 시간" max={V4_PARRY_WINDOW_MS} value={warningMs} />
              <span>{(Math.ceil(warningMs / 100) / 10).toFixed(1)}초</span>
            </div>
          </div>
          {parry && <button className="duel-v4-parry" onClick={() => useItem(parry, warning.id)} disabled={busy || unavailable || sealed}>패링</button>}
        </div>}
      </footer>
      {documentReady && <ScrollToTopButton race />}
    </RaceFrame>
  </div>;
}

export default function DuelV4Page() {
  const { roomId } = useParams();
  const { user, logout } = useAuth();
  if (!user) return null;
  return roomId ? <Match key={roomId} roomId={roomId} user={user} logout={logout} /> : <Navigate replace to="/multiplayer?mode=duel&items=1" />;
}
