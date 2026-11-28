import "./s5Next.css";
import FreeWikiCandidateSearch from "./FreeWikiCandidateSearch.jsx";
import { prepareFreeWikiDestination } from "./freeWikiDocument.js";
import { ensureWikiSnapshot } from "../../services/wikiSnapshotService.js";
import ExplorationHintPanel from "../wiki-race/race/ExplorationHintPanel.jsx";
import './phase2.css';
import {Phase2Countdown} from './Phase2Panels.jsx';
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../authContext.jsx";
import { supabase } from "../../supabaseClient.js";
import { actGroupItemsRoom, checkItemRaceSession, itemModeRpc as rpc, joinS5Rematch, makeRequestId, readIdentity, readS5Rematch } from "../../services/itemModeEntryService.js";
import { createItemRaceReader, itemRaceFailure, itemRaceFailureMessage } from "../../services/itemRaceRecovery.js";
import { createItemRaceClock } from "../../services/itemRaceClock.js";
import RematchResultAction from "../RematchResultAction.jsx";
import GroupItemsJungle from "./GroupItemsJungle.jsx";
import { createPlaytestAudio } from "../group-items-playtest/playtestAudio.js";
import { createGroupItemsContainerAdapters } from "./containerAdapters.js";
import { sameGroupItemsScope } from "./authoritySession.js";
import { PRODUCT_PROTOCOL, productBindingMatches, productId, readProductBinding, readProductRoom } from "./productContract.js";
import { createProductItemPresentation } from "./productPresentation.js";
import { createProductInkAudio } from "./productInkAudio.js";
import { createFinalAssetAudio } from "./finalAssetAudio.js";
import { createFinalAssetPresentation } from "./finalAssetPresentation.js";
import { FIXED_PRODUCT_WIKI_BINDING, readFixedProductWikiDocument } from "./productFixedWikiDocument.js";
import { loadProductWikiDocument } from "./productWikiDocument.js";
import S5KionDock, { MODE_FOLLOWUP_ENABLED } from "./S5KionDock.jsx";
import S5SpectatorDocument from "./S5SpectatorDocument.jsx";
import { CopyCodeButton, LobbyHeader, LobbyIcon, LobbyShell } from "../wiki-race/LobbyParts.jsx";
import { ItemRoomRoster } from "../wiki-race/ItemRoomLobby.jsx";
import { audioManager } from "../../services/audioManager.js";
import { HudBrand, HudDoc, HudExit, RaceFrame, RaceHold, RaceHud } from "../wiki-race/race/RaceParts.jsx";
import ScheduledItemCountdown from "../wiki-race/race/ScheduledItemCountdown.jsx";
import { GroupStandings, ResultActions, ResultCard, ResultCourse, ResultOutcome, ResultScene, ResultScreen, ResultStats, ResultXpRow } from "../wiki-race/result/ResultParts.jsx";
import { GroupResultA, RouteCompare } from "../wiki-race/race/GroupRaceParts.jsx";
import GroupPickOverlay from "../GroupPickOverlay.jsx";
import ResultXp from "../ResultXp.jsx";
import FinishEffect from "../FinishEffect.jsx";
import useMatchExpression from "../../hooks/useMatchExpression.js";
import useProfileCards from "../../hooks/useProfileCards.js";
import { useExitGuard } from "../ExitGuard.jsx";
import { useDisplayNow } from "../group-items-playtest/useDisplayNow.js";
import { formatDuration } from "../../services/wikiService.js";
import { groupItemsRoster } from "./groupItemsRoster.js";
import "./groupItemsJungle.css";

const productPath = "/multiplayer/group-items";
const productRoomPath = roomId => `${productPath}/${roomId}`;
const fallbackIntervalMs = 750;
const heartbeatIntervalMs = 4500;
const audioSetting = "group-items-product:ink-audio";
const journal = {
  list(key) { return JSON.parse(sessionStorage.getItem("group-items-product:"+key) ?? "[]"); },
  add(key, id) { sessionStorage.setItem("group-items-product:"+key, JSON.stringify([...new Set([...journal.list(key), id])])); },
  remove(key, id) { sessionStorage.setItem("group-items-product:"+key, JSON.stringify(journal.list(key).filter(value=>value!==id))); },
};

function useRoomActions(binding, actorId) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  async function act(operation, roomId, version, getLatestRoom, payload, canAct) {
    if (inFlight.current) return null;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      try {
        return await actGroupItemsRoom(binding, actorId, operation, roomId, version, payload);
      } catch (failure) {
        if (failure.message !== "PRODUCT_ROOM_STALE" || !failure.settled) throw failure;
        const latest = await getLatestRoom();
        if (!canAct()) return null;
        if (latest.version === version || ![...latest.actions,...(latest.followupActions ?? [])].includes(operation)) throw failure;
        return await actGroupItemsRoom(binding, actorId, operation, roomId, latest.version, payload);
      }
    } catch (failure) {
      setError(failure.message ?? "PRODUCT_ROOM_UNAVAILABLE");
      return null;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return { pending, error, act };
}

function ProductMatch({ roomId, sessionId, participantId, ownerEpoch, actorId, binding, warningWindowMs, target, subscribe, players, roster, matchClock, roomActions, lifecycle, enteredFromLobby, freeWiki, connectionFailure, onRoomRefresh, onItemReady }) {
  const { pathname } = useLocation();
  const previewAudio = import.meta.env.VITE_GROUP_ITEMS_INK_PREVIEW === "1";
  const fixedAudio = productBindingMatches(binding,FIXED_PRODUCT_WIKI_BINDING);
  const finalAssets = (import.meta.env.VITE_GROUP_ITEMS_FINAL_ASSETS === "1" ||
    (import.meta.env.VITE_GROUP_ITEMS_FINAL_ASSETS !== "0" &&
      (import.meta.env.MODE === "s4-product-candidate" || import.meta.env.VITE_GROUP_ITEMS_S5_ENTRY === "1"))) &&
    binding.rulesVersion === "ink-s5-test-v1" && binding.catalogVersion === "ink-s5-test-v1" &&
    binding.modePolicyVersion === "wikipedia-s5-test-v1";
  const audioPreference = finalAssets ? "group-items:final-asset-audio" : audioSetting;
  const volumePreference = "group-items:final-asset-volume";
  const sound = useSyncExternalStore(audioManager.subscribe, audioManager.getSnapshot, audioManager.getSnapshot);
  const [audioEnabled, setAudioEnabled] = useState(()=>{
    const preference = sessionStorage.getItem(audioPreference);
    return preference === null ? finalAssets : preference === "on";
  });
  const [volume, setVolume] = useState(()=>Number(sessionStorage.getItem(volumePreference) ?? 65));
  const audio = useRef(null);
  useEffect(()=>{
    const output = finalAssets ? createFinalAssetAudio(window) :
      fixedAudio && !previewAudio ? createPlaytestAudio(window) : createProductInkAudio(window,{preview:previewAudio});
    audio.current = output;
    return ()=>{ audio.current = null; output.dispose(); };
  },[fixedAudio,previewAudio,finalAssets,audioPreference]);
  useEffect(() => {
    if (finalAssets) audio.current?.setVolume(volume / 100 * sound.sfx);
    audio.current?.enable(audioEnabled && (!finalAssets || sound.status === "ready" && !sound.muted && sound.sfx > 0));
  }, [audioEnabled, finalAssets, fixedAudio, previewAudio, volume, sound.muted, sound.sfx, sound.status]);
  const itemPresentation = useMemo(()=>{
    const base = createProductItemPresentation({
      playInk: (pulse,view) => audio.current?.playPulse(pulse,view,{hidden:document.hidden}),
    });
    return finalAssets ? createFinalAssetPresentation(base,()=>audio.current) : base;
  },[finalAssets]);
  const room = useMemo(()=>({ mode:"group_items", protocol:PRODUCT_PROTOCOL, sessionId, binding }),[sessionId,binding]);
  const scope = useMemo(()=>({ ...room, actorId, participantId, ownerEpoch }),[room,actorId,participantId,ownerEpoch]);
  const adapters = useMemo(()=>createGroupItemsContainerAdapters({ scope, readIdentity,
    async invoke({ operation, payload, accessToken, signal }) {
      const bound = { p_room:roomId, p_session:sessionId, p_binding:binding };
      if (operation === "state") return rpc("get_group_items_product_state_v1", bound, accessToken, signal);
      if (operation === "act") return rpc("act_group_items_product_v1", { ...bound,
        p_request:payload.requestId, p_operation:payload.operation, p_payload:payload.payload }, accessToken, signal);
      if (operation === "receipt") return rpc("get_group_items_product_receipt_v1", { ...bound,
        p_request:payload.requestId }, accessToken, signal);
      if (operation !== "document") throw new Error("PRODUCT_OPERATION_UNSUPPORTED");
      const documentSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      const document = await rpc("get_group_items_product_document_v1", { ...bound, p_frame:payload }, accessToken, documentSignal);
      if (!sameGroupItemsScope(document?.scope, scope)) throw new Error("TRANSPORT_SCOPE_MISMATCH");
      const body = await loadProductWikiDocument(payload, document.body, (identity, pinnedSignal)=>{
        if (productBindingMatches(binding,FIXED_PRODUCT_WIKI_BINDING)) return readFixedProductWikiDocument(identity,pinnedSignal);
        if (freeWiki && !document.body.documentHtml) {
          return ensureWikiSnapshot({ ...identity, title: identity.canonicalTitle },
            { includeDocument:true, signal:pinnedSignal, s5RoomId:roomId });
        }
        return {
          pageId:document.body.pageId, revisionId:document.body.revisionId, canonicalTitle:document.body.canonicalTitle,
          snapshotId:document.body.wikiSnapshotId, documentHtml:document.body.documentHtml,
        };
      }, documentSignal);
      return { scope:document.scope, body };
    },
  }),[scope,roomId,sessionId,binding,freeWiki]);
  const audioControls = (fixedAudio || previewAudio || finalAssets) && <div className={finalAssets ? "s5-final-audio" : undefined}><button type="button" aria-pressed={audioEnabled} onClick={()=>{
      const enabled = !audioEnabled;
      sessionStorage.setItem(audioPreference,enabled ? "on" : "off");
      setAudioEnabled(enabled);
    }}>{finalAssets ? "아이템 효과음" : "먹물 효과음"}</button>
    {finalAssets && <label>효과음 볼륨 <input type="range" min="0" max="100" value={volume} onChange={event=>{
      const next = Number(event.target.value);
      sessionStorage.setItem(volumePreference,String(next));
      setVolume(next);
    }}/></label>}</div>;
  return <GroupItemsJungle room={room} supported={room} scope={scope} {...adapters} journal={journal} makeRequestId={makeRequestId}
      prepareLink={freeWiki ? prepareFreeWikiDestination : undefined} target={target} warningWindowMs={warningWindowMs} subscribe={subscribe} itemPresentation={itemPresentation}
      lifecycle={lifecycle} enteredFromLobby={enteredFromLobby} connectionFailure={connectionFailure}
      onAuthFailure={checkItemRaceSession} onRoomRefresh={onRoomRefresh} onItemReady={onItemReady}
      players={players} roomRoster={roster} explorationHints={<ExplorationHintPanel mode="group_items" roomId={roomId} />} matchClock={matchClock} roomActions={roomActions} gameAudioRoute={pathname} audioControls={audioControls}
      kionDock={<S5KionDock roomId={roomId} actorId={actorId} players={players} disabled={Boolean(connectionFailure)}/>}/>;
}

function matchItemsPaused(room, read) {
  return room?.phase === "playing" && room.role === "player" &&
    !(read?.sessionId === room.sessionId && read.ownerEpoch === room.ownerEpoch && read.ready);
}

function ProductRoom({ roomId, user, logout }) {
  const navigate = useNavigate();
  const actorId = user.id;
  const [room, setRoom] = useState(null);
  const [failure, setFailure] = useState(null);
  const roomFailure = useRef(null);
  const [itemRead, setItemRead] = useState(null);
  const itemReadRef = useRef(null);
  const [lastSync, setLastSync] = useState("initial");
  const [watch, setWatch] = useState(() => {
    try { return sessionStorage.getItem(`s5-watch:${roomId}:${actorId}`) === "1"; } catch { return false; }
  });
  const [routeOpen, setRouteOpen] = useState(false);
  const binding = room?.binding ?? null;
  const roomVersion = room?.version;
  const rematch = useMemo(() => ({
    fetch:readS5Rematch, join:joinS5Rematch, path:productRoomPath,
    create:async source => (await actGroupItemsRoom(binding, actorId, "rematch", source, roomVersion)).roomId,
  }), [actorId, binding, roomVersion]);
  const roomRef = useRef(null), reloadRef = useRef(null), itemListeners = useRef(new Set());
  const enteredFromLobby = useRef(false);
  const sawRace = useRef(false);
  const liveRef = useRef(false);
  const { pending: actionPending, error, act } = useRoomActions(binding, actorId);
  const pending = actionPending || Boolean(failure) || matchItemsPaused(room, itemRead);
  const onItemReady = useCallback(({ sessionId, ownerEpoch, participantId }, ready) => {
    const current = roomRef.current;
    if (current?.sessionId !== sessionId || current.ownerEpoch !== ownerEpoch || current.participantId !== participantId) return;
    const previous = itemReadRef.current;
    if (previous?.sessionId === sessionId && previous.ownerEpoch === ownerEpoch && previous.ready === ready) return;
    const read = { sessionId, ownerEpoch, ready };
    itemReadRef.current = read;
    setItemRead(read);
  }, []);
  const subscribe = useCallback(listener=>{
    itemListeners.current.add(listener);
    listener(true, liveRef.current);
    return ()=>itemListeners.current.delete(listener);
  },[]);

  useEffect(()=>{
    const abort = new AbortController();
    const serverClock = createItemRaceClock();
    let requestedSource = "initial";
    const refresh = createItemRaceReader(async signal => {
      const source = requestedSource;
      const sent = performance.now();
      try {
        const identity = await readIdentity();
        if (identity.actorId !== actorId) throw new Error("AUTH_REQUIRED");
        const knownBinding = roomRef.current?.binding ?? null;
        const data = await rpc("get_group_items_product_room_v1", { p_room:roomId, p_binding:knownBinding }, identity.accessToken, signal);
        if (!abort.signal.aborted) {
          const confirmedBinding = knownBinding ?? readProductBinding(data?.binding);
          const parsed = readProductRoom(data, { roomId, actorId, binding:confirmedBinding }, roomRef.current);
          const local = performance.now();
          const server = serverClock.observe(Date.parse(parsed.serverObservedAt), local - sent, local);
          const next = parsed === roomRef.current || server === null ? parsed : { ...parsed, clockAnchor:{ local, server } };
          if (next.phase === "playing" && next.role === "player") sawRace.current = true;
          if (next.phase === "waiting" && !next.scheduledStartAt && !enteredFromLobby.current) {
            enteredFromLobby.current = true;
            audioManager.prepare(["tick", "go", "itemReveal", "denied"]);
          }
          roomRef.current = next;
          setRoom(next);
          roomFailure.current = null;
          setFailure(null);
          setLastSync(source);
          return next;
        }
      } catch (error) {
        if (abort.signal.aborted) return;
        const reason = itemRaceFailure(error);
        roomFailure.current = reason;
        setFailure(reason);
        if (reason.kind === "auth") void checkItemRaceSession(actorId);
      }
    }, abort.signal);
    function load(source = "manual") {
      requestedSource = source;
      return refresh({ trailing:["manual","websocket","resume"].includes(source) });
    }
    function invalidate(source, recovering) {
      if (abort.signal.aborted) return;
      void load(source);
      const canRead = liveRef.current || source === "polling";
      for (const listener of itemListeners.current) listener(recovering, canRead);
    }
    const visibility = ()=>{ if (!document.hidden) invalidate("resume", true); };
    reloadRef.current = load;
    void load("initial");
    const channel = supabase.channel("group-items-signals:"+roomId+":"+actorId)
      .on("postgres_changes",{
        event:"*",schema:"ink_product_events",table:"signals_v1",filter:"recipient_id=eq."+actorId,
      },change=>{
        if (change.new?.room_id===roomId && change.new?.recipient_id===actorId) invalidate("websocket",false);
      })
      .subscribe(status=>{
        if (abort.signal.aborted) return;
        liveRef.current = status === "SUBSCRIBED";
        invalidate(liveRef.current ? "subscribed" : "polling", true);
      });
    const fallback = setInterval(()=>{
      const current = roomRef.current;
      if (current?.phase === "waiting") {
        if (!current.scheduledStartAt) void load("lobby-poll");
      } else if (!liveRef.current && current?.phase !== "finished") invalidate("polling", false);
    }, fallbackIntervalMs);
    const heartbeat = setInterval(()=>{
      if (liveRef.current && roomRef.current?.phase !== "finished") invalidate("heartbeat", false);
    }, heartbeatIntervalMs);
    const offline = () => {
      const reason = { kind:"connection" };
      roomFailure.current = reason;
      setFailure(reason);
    };
    window.addEventListener("online",visibility);
    window.addEventListener("offline",offline);
    document.addEventListener("visibilitychange",visibility);
    return ()=>{
      abort.abort();
      clearInterval(fallback);
      clearInterval(heartbeat);
      liveRef.current = false;
      reloadRef.current = null;
      window.removeEventListener("online",visibility);
      window.removeEventListener("offline",offline);
      document.removeEventListener("visibilitychange",visibility);
      void supabase.removeChannel(channel);
    };
  },[roomId,actorId]);

  const ownPlayer = room?.players.find(player => player.participantId === room.participantId);
  const personalFinish = room?.phase === "playing" && ownPlayer?.status === "finished";
  useEffect(() => {
    if (personalFinish && sawRace.current && !document.hidden) void audioManager.play("finish", { key:`s5-arrival:${roomId}:${actorId}` });
  }, [actorId, personalFinish, roomId]);
  const profiles = useProfileCards(room?.players.map(player => player.profileId) ?? []);
  const roster = useMemo(() => groupItemsRoster(room?.players ?? [], profiles), [room?.players, profiles]);
  const matchExpression = useMatchExpression(room?.phase !== "waiting" && ownPlayer?.status === "finished" ? actorId : null);
  const resultNow = useDisplayNow(Date.parse(room?.serverObservedAt), room?.phase === "playing" && room.role === "spectator" && !watch);
  const { requestExit, dialog:exitDialog } = useExitGuard({ enabled:room?.phase === "playing" && room.role === "player",
    confirmDisabled:pending, onConfirm:() => command("leave", null) });

  const canAct = () => !roomFailure.current && !matchItemsPaused(roomRef.current, itemReadRef.current);

  async function command(operation, destination = productPath, payload) {
    if (!canAct()) return false;
    const result = await act(operation, roomId, room.version, async () =>
      (await reloadRef.current?.()) ?? roomRef.current, payload, canAct);
    if (!result) {
      void reloadRef.current?.();
      return false;
    }
    if (operation === "leave" && room.phase === "waiting") {
      if (destination) navigate(destination);
    }
    else void reloadRef.current?.();
    return true;
  }

  const connectionStatus = failure && <p className="group-items-jungle-status" role="status">
    {itemRaceFailureMessage(failure)} <button type="button" className="wr-race-btn"
      onClick={() => void reloadRef.current?.()}>경기 상태 다시 확인</button>
  </p>;
  if (!room || ["denied","closed"].includes(failure?.kind)) return <RaceFrame mode="group" label="그룹 아이템전">
    <RaceHold title={failure ? itemRaceFailureMessage(failure) : "아이템 방을 확인하는 중…"}
      actions={failure && <><button type="button" className="wr-race-btn" onClick={()=>void reloadRef.current?.()}>다시 확인</button>
        <Link className="wr-race-btn" to="/play">모드 선택</Link></>} />
  </RaceFrame>;
  const labels = { ready: "준비", start:"경기 시작", leave:room.phase === "waiting" ? "방 나가기" : "경기 포기" };
  const actions = room.actions.filter(action => action in labels).map(action =>
    <HudExit key={action} label={labels[action]} disabled={pending} onClick={room.phase === "playing" ? requestExit : () => void command(action)} />);
  const actionError = error && <p role="alert">{error === "PRODUCT_CANDIDATE_PAIR_REQUIRED"
    ? room.freeWiki ? "서로 다른 문서 후보가 두 개 필요해요." : "서로 이동할 수 있는 다른 문서 후보가 두 개 필요해요."
    : error === "PRODUCT_CANDIDATE_REQUIRED" ? "먼저 Wikipedia 문서를 후보로 제출해 주세요."
    : "요청을 완료하지 못했어요. 방 상태를 다시 확인해 주세요."}</p>;
  const matchClock = room.lifecycle && (room.phase2Policy
    ? <Phase2Countdown lifecycle={room.lifecycle} serverObservedAt={room.serverObservedAt}/>
    : <p aria-label="아이템전 경기 기한">최대 20분 · 3위 완주 후 최대 2분 유예{room.lifecycle.grace_ends_at && " · 유예 진행 중"}</p>);
  let content;
  if (room.phase === "playing" && room.role === "player") {
    content = <ProductMatch roomId={roomId} sessionId={room.sessionId}
      participantId={room.participantId} ownerEpoch={room.ownerEpoch} actorId={actorId} binding={binding}
      warningWindowMs={room.warningWindowMs} target={room.target} subscribe={subscribe} players={room.players}
      roster={roster} matchClock={matchClock} roomActions={<>{actions}{actionError}</>} connectionFailure={failure}
      onRoomRefresh={() => void reloadRef.current?.()} onItemReady={onItemReady}
      freeWiki={room.freeWiki} lifecycle={room.lifecycle} enteredFromLobby={enteredFromLobby.current}/>;
  } else if (room.phase === "playing" && (!watch || ownPlayer?.status === "left")) {
    const result = roster.entries.find(({ player }) => player.user_id === room.participantId)?.player;
    const endAt = Date.parse(room.lifecycle?.grace_ends_at || room.lifecycle?.deadline_at);
    const remaining = Number.isFinite(endAt) ? Math.max(0, Math.ceil((endAt-resultNow)/1000)) : 0;
    const retired = ownPlayer?.status === "left";
    content = <GroupResultA result={result} resultKey={`${roomId}:${actorId}`} modeLabel="그룹 아이템전"
      size={room.players.length} finishedCount={roster.counts.finished} pendingCount={roster.counts.active}
      startTitle={room.startDocument?.title} targetTitle={room.target?.title} path={result?.path_titles ?? []}
      deadline={{ state:remaining ? "active" : "ended", seconds:remaining, grace:Boolean(room.lifecycle?.grace_ends_at) }}
      retired={retired} motionEligible={sawRace.current && !retired} finishEffect={<FinishEffect effect={matchExpression.finish_effect} />}
      onSpectate={MODE_FOLLOWUP_ENABLED ? () => {
        setWatch(true);
        try { sessionStorage.setItem(`s5-watch:${roomId}:${actorId}`, "1"); } catch { /* optional */ }
      } : null} onLeave={() => navigate("/play")} routeOpen={routeOpen} onToggleRoute={() => setRouteOpen(open => !open)} />;
  } else if (room.phase === "playing") {
    content = <RaceFrame mode="group" label="아이템 그룹 관전">
      <RaceHud><HudBrand mode="그룹 아이템전" sub="관전" /><HudDoc kind="goal" label="목표 문서" title={room.target?.title} />{matchClock}
        <div className="item-race-utility">
          <ExplorationHintPanel mode="group_items" roomId={roomId} />
          <S5KionDock roomId={roomId} actorId={actorId} players={room.players} spectator disabled={Boolean(failure)} />
        </div>
      </RaceHud>
      <h1 id="s5-spectator-title">그룹 아이템전 관전</h1>
      {MODE_FOLLOWUP_ENABLED && <S5SpectatorDocument room={room} actorId={actorId}
        roster={roster} readIdentity={readIdentity} rpc={rpc} />}
      {actionError}
    </RaceFrame>;
  } else if (room.phase === "finished") {
    const standings = [...room.results].sort((a,b)=>a.rank-b.rank).map(row => {
      const player = room.players.find(player => player.participantId === row.participantId);
      return {
        key:row.participantId, userId:player?.profileId, rank:row.status === "left" ? null : row.rank, name:player?.nickname || row.name,
        time:Number.isFinite(player?.elapsedSeconds) ? formatDuration(Math.floor(player.elapsedSeconds)) : "–",
        moves:Number.isFinite(player?.moveCount) ? `${player.moveCount}회` : "–",
        isMe:row.participantId === room.participantId, isWinner:row.rank === 1 && row.status === "finished",
        retired:row.status === "left", status:row.status === "left" ? "기권/시간 초과" : row.status === "finished" ? "완주" : "경기 종료",
      };
    });
    const selfResult = room.results.find(row => row.participantId === room.participantId);
    content = <ResultScreen mode="group" tone="neutral" cinematic="group" titleId="s5-final-result" resultKey={roomId}
      motionEligible={sawRace.current} confirmed={room.results.length>0} testId="s5-final-result">
      <ResultScene variant="group-final" podiumRows={standings} reached={selfResult?.status === "finished"}
        destination={room.target?.title} recordedAt={room.lifecycle?.closed_at} />
      <ResultCard label="아이템 그룹 결과">
        <ResultOutcome kicker="그룹 아이템전" title="최종 경기 결과" titleId="s5-final-result"
          detail={selfResult?.status === "finished" ? `${selfResult.rank}위 완주` : selfResult?.status === "left" ? "리타이어" : null} />
        <ResultStats items={[{label:"공통 코스",wide:true,value:<ResultCourse start={room.startDocument?.title} target={room.target?.title} />}]} />
        {selfResult && <ResultXpRow><ResultXp scope="group_items" sourceId={selfResult.participantId} userId={actorId} motionEligible={sawRace.current} /></ResultXpRow>}
        {selfResult?.status === "finished" && sawRace.current && <FinishEffect effect={matchExpression.finish_effect} />}
        <GroupStandings rows={standings} finishedCount={room.results.filter(row => row.status === "finished").length} retiredCount={standings.filter(row => row.retired).length} />
        <RouteCompare entries={roster.entries} myUserId={room.participantId} startTitle={room.startDocument?.title} targetTitle={room.target?.title} />
        {actionError}
        <ResultActions><Link className="wr-race-btn" to="/play">플레이로 돌아가기</Link>
          <RematchResultAction sourceRoomId={roomId} mode="group" isHost={room.actions.includes("rematch")}
            enabled={Boolean(room.participantId)} adapter={rematch} />
        </ResultActions>
      </ResultCard>
    </ResultScreen>;
  } else if (room.scheduledStartAt) {
    content = <ScheduledItemCountdown roomId={roomId} startsAt={room.scheduledStartAt}
      serverObservedAt={room.serverObservedAt} clockAnchor={room.clockAnchor} startTitle={room.startDocument?.title} targetTitle={room.target?.title}
      intro={enteredFromLobby.current && <GroupPickOverlay sceneKey={`s5:${roomId}:${room.scheduledStartAt}:${actorId}`}
        startTitle={room.startDocument?.title} targetTitle={room.target?.title}
        players={room.players.map(player => ({ user_id:player.profileId ?? player.participantId,
          nickname_snapshot:player.nickname || player.name }))} />}
      onBoundary={() => void reloadRef.current?.("scheduled-start")}/>;
  } else {
    const leaveLobby = room.actions.includes("leave");
    const self = room.players.find(player => player.participantId === room.participantId);
    const ready = self?.ready;
    const start = room.actions.includes("start");
    const followup = room.followupActions ?? [];
    const readyCount = room.players.filter(player => player.ready).length;
    const roster = room.players.map(player => ({
      key: player.participantId, name: player.nickname || player.name, ready: player.ready,
      userId: player.participantId === room.participantId ? actorId : productId(player.profileId) ? player.profileId : null,
      host: player.host ?? (start && player.participantId === room.participantId),
    }));
    content = <LobbyShell user={user} mode="group"
      onNavigate={leaveLobby ? destination => void command("leave", destination) : undefined}
      onLogout={async () => {
        if (leaveLobby && !(await command("leave", null))) return;
        await logout();
        navigate("/");
      }}>
      <LobbyHeader kicker="탐험가 집결 캠프" title="그룹 아이템전 대기실"
        onLeave={leaveLobby ? () => void command("leave", "/play") : undefined}>
        {room.roomCode && <span className="wr-head-code"><span>방 코드</span><CopyCodeButton code={room.roomCode} compact /></span>}
      </LobbyHeader>
      {actionError}
      {MODE_FOLLOWUP_ENABLED && <div className="s5-lobby-emotes"><S5KionDock mode="lobby" roomId={roomId} actorId={actorId}
        players={room.players} disabled={pending} label="대기방 키온 감정표현" /></div>}
      <div className="wr-group-layout">
        <div className="wr-group-main s5-lobby-candidates">
          <section className="wr-course" aria-labelledby="s5-course-title">
            <div className="wr-course-head"><h2 id="s5-course-title" className="wr-section-label">{room.freeWiki ? "출발·목표 문서 후보" : "공통 코스"}</h2></div>
            {!room.freeWiki && <div className="wr-course-route"><span className="wr-route-chip">{room.startDocument?.title || "서버 지정 출발 문서"}</span>
              <span aria-hidden="true">→</span>
              <strong className="wr-route-chip wr-route-chip--target"><LobbyIcon name="flag" />{room.target?.title || "서버 지정 목표 문서"}</strong>
            </div>}
            {room.freeWiki ? <>
              <p className="wr-course-note">경기를 시작할 때 제출한 후보에서 서로 다른 출발·목표 문서를 추첨합니다.</p>
              <FreeWikiCandidateSearch selectedTitle={room.myCandidateTitle} disabled={pending}
                onSelect={snapshotId => command("candidate", undefined, { snapshotId })} />
            </>
            : followup.includes("candidate") && room.courseCandidates?.length > 0 ? <>
              <label htmlFor="s5-course-candidate">목표 후보</label>
              <select id="s5-course-candidate" value={self?.candidateId ?? ""} disabled={pending}
                onChange={event => void command("candidate", undefined, { snapshotId: event.target.value || null })}>
                <option value="">후보 없음</option>
                {room.courseCandidates.map(candidate => <option key={candidate.snapshotId} value={candidate.snapshotId}>{candidate.title}</option>)}
              </select>
              <p className="wr-course-note">제출한 후보 중 연결된 두 문서를 출발과 목표로 추첨합니다. 후보가 없으면 공통 코스로 출발합니다.</p>
            </> : <p className="wr-course-note">전원이 서버가 지정한 같은 코스로 경기합니다.</p>}
            <div className="s5-lobby-ready">
              <p className={`wr65-camp-state ${ready ? "is-ready" : ""}`} role="status">
                {ready ? "준비 완료 · READY" : room.freeWiki && !room.myCandidateTitle ? "내 문서 후보를 제출해 주세요" : "준비를 눌러 주세요"}
              </p>
              {room.actions.includes("ready") && !ready && <button type="button" className="wr-btn wr-btn--primary"
                disabled={pending || (room.freeWiki && !room.myCandidateTitle)} onClick={() => void command("ready")}>준비</button>}
              {ready && followup.includes("unready") && <button type="button" className="wr-btn"
                disabled={pending} onClick={() => void command("unready")}>준비 취소</button>}
            </div>
          </section>
        </div>
        <aside aria-label="탐험대">
          <ItemRoomRoster mode="group" players={roster} user={user} maxPlayers={room.maximumPlayers} />
        </aside>
      </div>
      <div className="wr-lobby-actions wr-lobby-actions--group">
        <p className="wr-lobby-status" id="s5-start-status" role="status">
          <LobbyIcon name={start ? "check" : "pending"} />
          {start ? "경기를 시작할 수 있어요" : room.players.length < room.minimumPlayers
            ? `최소 ${room.minimumPlayers}명 필요` : readyCount < room.players.length
              ? `참가자 준비 대기 · ${readyCount} / ${room.players.length}` : "방장이 시작하기를 기다리는 중"}
        </p>
        <span className="wr-start-rules">시작 조건 · {room.minimumPlayers}명 이상 · 전원 READY{room.freeWiki ? " · 서로 다른 후보 2개 이상" : ""} · 시작은 방장만</span>
        {start && <button className="wr-btn wr-btn--primary wr-btn--lg wr-start-btn" type="button"
          disabled={pending} aria-describedby="s5-start-status"
          onClick={() => void command(followup.includes("start_scheduled") ? "start_scheduled" : "start")}>경기 시작</button>}
      </div>
    </LobbyShell>;
  }
  return <div data-product-group-phase={room.phase} data-product-sync={lastSync}
    data-product-document-source={productBindingMatches(binding,FIXED_PRODUCT_WIKI_BINDING) ? "fixed" : "wikipedia"}>{(room.phase !== "playing" || room.role !== "player") && connectionStatus}{content}{exitDialog}</div>;
}

export default function ProductGroupItemsRoute() {
  const { roomId } = useParams();
  const { user, logout } = useAuth();
  if (!supabase || !productId(user?.id) || (roomId && !productId(roomId))) {
    return <RaceFrame mode="group" label="그룹 아이템전"><RaceHold title="아이템 방을 열 수 없어요." /></RaceFrame>;
  }
  return roomId
    ? <ProductRoom key={user.id + ":" + roomId} roomId={roomId} user={user} logout={logout} />
    : <Navigate replace to="/multiplayer?mode=group&items=1" />;
}
