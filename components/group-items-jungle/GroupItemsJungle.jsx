import React, { useEffect, useRef, useState } from "react";
import WikiViewer from "./S5WikiViewer.jsx";
import { normalizeTitle } from "../../services/wikiService.js";
import { HudArrow, HudBrand, HudDoc, HudStat, RaceFrame, RaceHud } from "./S5RaceParts.jsx";
import PlaytestItemsHud from "../group-items-playtest/PlaytestItemsHud.jsx";
import ItemImpactEffect from "../group-items-playtest/ItemImpactEffect.jsx";
import { AttackWarningEdge } from "../group-items-playtest/AttackWarning.jsx";
import DefenseFeedback from "../group-items-playtest/DefenseFeedback.jsx";
import { defenseCue } from "../group-items-playtest/attackFeedback.js";
import { createS25InkPresentation } from "../group-items-playtest/s25InkPresentation.js";
import { createGroupItemsSession, hasS4Effects, selectGroupItemRoute, s4CensoredPageIds } from "./authoritySession.js";
import { isProductS4Scope } from "./productContract.js";
import { preloadProductInkArt, ProductInkVfx, ProductItemMotion } from "./ProductItemVfx.jsx";
import { FinalAssetOverlay, preloadFinalInk } from "./FinalAssetVfx.jsx";
import ItemRaceStart from "../wiki-race/race/ItemRaceStart.jsx";
import useItemSupplyArrival from "../../hooks/useItemSupplyArrival.js";
import { nextProductInkPulseDelay, productCueDuration } from "./productPresentation.js";
import "../../css/wikiRaceGroupItemsPlaytest.css";
import "./groupItemsJungle.css";
import "./s5HeadScoped.css";
import S5Panels from './S5Panels.jsx';
import { isS5Scope } from './s5UiContract.js';
import useGameAudio from '../../hooks/useGameAudio.js';
import useRaceMotion from "../../hooks/useRaceMotion.js";
import useItemRaceTarget from "../../hooks/useItemRaceTarget.js";
import { ParticipantRoster } from "../wiki-race/race/GroupRaceParts.jsx";
import { MobileRouteNotes, RouteRail } from "../wiki-race/race/RaceParts.jsx";
import PageLoadingOverlay from "../PageLoadingOverlay.jsx";
import ScrollToTopButton from "../ScrollToTopButton.jsx";

const commandFailureMessage = "아이템 경기 요청을 완료하지 못했어요. 연결과 경기 상태를 확인해 주세요.";
const commandRejectionMessages = {
  STALE_INVENTORY: "가방이 갱신됐어요. 사용할 아이템을 다시 선택해 주세요.",
  STALE_PROGRESS: "현재 문서가 갱신됐어요. 이동할 링크를 다시 선택해 주세요.",
  LINK_SNAPSHOT_MISSING: "연결할 문서를 준비하지 못했어요. 링크를 다시 선택해 주세요.",
  LINK_CENSORED: "검열이 풀리면 이 링크로 이동할 수 있어요.",
  PARRY_WINDOW_CLOSED: "패링 시간이 지났어요.",
};

const isScopeFailure = error => ["AUTH_REQUIRED","TRANSPORT_SCOPE_MISMATCH","RECEIPT_SCOPE_MISMATCH"].includes(error?.message);

function supplyDeadline(startedAt, supply) {
  const nextRound = supply ? Number(supply.lastClosedRound) + 1 : 0;
  // S5 closes round zero at start, then round one after 20s and subsequent rounds every 25s.
  return nextRound === 0 ? startedAt : startedAt + (20 + (nextRound - 1) * 25) * 1000;
}

function PlayingGroup({ scope, transport, journal, makeRequestId, loadDocument, prepareLink, target, warningWindowMs, refreshMs, onPulse, subscribe, itemPresentation, kionDock, players = [], roomRoster, matchClock, roomActions, explorationHints, gameAudioRoute, audioControls, lifecycle, enteredFromLobby }) {
  const product = isProductS4Scope(scope);
  const s5 = isS5Scope(scope);
  const [moveMotion, approveMoveMotion] = useRaceMotion();
  const targetBrief = useItemRaceTarget(product ? target?.title : null);
  const [view, setView] = useState(null);
  const [document, setDocument] = useState(null);
  const [failure, setFailure] = useState("");
  const [documentFailure, setDocumentFailure] = useState(false);
  const [documentAttempt, setDocumentAttempt] = useState(0);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [liveCue, setLiveCue] = useState(null);
  const [disconnected, setDisconnected] = useState(false);
  const seenReceipts = useRef(new Set());
  const [trapChoices, setTrapChoices] = useState(null);
  const [s5Pending,setS5Pending] = useState(false);
  const [rewardGrants,setRewardGrants] = useState([]);
  const [itemToolbar, setItemToolbar] = useState(null);
  const [warningToolbar, setWarningToolbar] = useState(null);
  const active = useRef(null);
  const preparingLink = useRef(false);

  const finalAssets = s5 && itemPresentation?.finalAssets;
  useEffect(() => {
    if (finalAssets) preloadFinalInk();
    else if (product) preloadProductInkArt();
  }, [finalAssets,product]);

  const supply = view?.supply;
  const startedAt = Date.parse(lifecycle?.started_at);
  const supplyAt = supplyDeadline(startedAt, supply);
  const deadlineAt = Date.parse(lifecycle?.deadline_at);
  const endAt = Math.min(deadlineAt, lifecycle?.grace_ends_at ? Date.parse(lifecycle.grace_ends_at) : Infinity);
  const supplySeconds = Number.isFinite(supplyAt) && view && supplyAt < endAt
    ? Math.max(0, Math.ceil((supplyAt - view.now) / 1000)) : null;
  const suppliedGrant = useItemSupplyArrival(finalAssets && view && {
    round:supply?.lastClosedRound, initialRound:supply?.lastClosedRound==='0',
    outcome:supply?.outcome, grantId:supply?.lastClosedRound===supply?.round ? supply?.grantId : null,
    observedAt:view.now, dueAt:Date.parse(supply?.logicalDueAt), revision:Number(view.view.inventoryVersion),
    inventory:view.view.inventory.filter(Boolean).map(item=>item.grantId),
    live:!disconnected && !view.view.viewer.readOnly,
  },scope.sessionId,enteredFromLobby);

  useEffect(() => {
    const session = createGroupItemsSession({ scope, transport, journal, makeRequestId });
    const presentation = createS25InkPresentation({ useReactionClock: s5 });
    let alive = true;
    let refreshing = false;
    let queued = false;
    let queuedRecovery = false;
    let streamConnected = !subscribe;
    let failed = false;
    let shownResult = null;
    let resultCursor = null;
    let pulseTimer = null;
    let deadline = null;
    let deadlineTimer = null;
    const entry = { session, refresh, stop };
    active.current = entry;

    function draw() {
      clearTimeout(pulseTimer);
      if (!alive || failed) return;
      const state = session.snapshot();
      if (!state) return;
      const frame = presentation.frame();
      const self = frame.view;
      if (!self) return;
      if (finalAssets && streamConnected && !self.viewer.readOnly) {
        const supplyAt = supplyDeadline(startedAt, state.supply);
        const boundaries = self.warnings.map(warning=>warning.dueAt);
        if (Number.isFinite(supplyAt) && supplyAt < deadlineAt) boundaries.push(supplyAt);
        const next = Math.min(...boundaries.filter(at=>at > state.presentation.serverObservedAt));
        if (next !== deadline) {
          clearTimeout(deadlineTimer);
          deadline = next;
          if (Number.isFinite(next)) deadlineTimer = setTimeout(()=>void refresh(),
            Math.max(0,next-(self.warningNow??frame.now)+80));
        }
      }
      const nextPulse = product ? nextProductInkPulseDelay(self) : null;
      if (nextPulse !== null) pulseTimer = setTimeout(draw,nextPulse);
      const bookmark = state.bookmark;
      const display = { ...self, serverTransport:hasS4Effects(scope) ? "s4" : "s3", bookmarkRight:bookmark ? {
        rightId:bookmark.rightId, originLabel:bookmark.pageId, canReturn:bookmark.pageId!==state.self.currentPageId,
        unavailableReason:bookmark.pageId===state.self.currentPageId ? "same_document" : null,
      } : null };
      if (resultCursor === null) resultCursor = state.presentation.recipientEventSeq ?? 0n;
      else for (const result of state.presentation.projection.results) {
        if (!/^[0-9]+$/.test(result.eventSeq) || BigInt(result.eventSeq)<=resultCursor) continue;
        resultCursor = BigInt(result.eventSeq);
        if (streamConnected && !self.viewer.readOnly) itemPresentation?.playResult?.(result,scope.participantId,frame.now);
        if (result.targetParticipantId !== scope.participantId) continue;
        const event = { type:"attack_resolved", eventId:"result:"+result.eventSeq, childId:result.childId,
          recipientId:scope.participantId, outcome:result.outcome, at:Date.parse(result.resolvedAt) };
        const cue = itemPresentation ? itemPresentation.result(result,event,display) : defenseCue(event,display);
        if (cue || !product) shownResult = cue;
      }
      if (shownResult && frame.now - shownResult.at > (product ? productCueDuration(shownResult) : 1600)) shownResult = null;
      for (const pulse of frame.pulseEvents) {
        onPulse?.(pulse,display);
        itemPresentation?.playPulse(pulse,display);
      }
      const itemEffects = state.itemEffects ?? [];
      const censoredPages = s4CensoredPageIds(itemEffects,frame.now);
      const activeEffects = itemEffects.filter(effect=>effect.startsAt<=frame.now && frame.now<effect.expiresAt);
      const stun = activeEffects.find(effect=>effect.kind==='stun');
      const sealed = s5 && activeEffects.some(effect=>effect.kind==='thunder_seal');
      const restricted = s5 && (stun || sealed);
      const visible = restricted ? { ...display,
        warnings:display.warnings.map(warning=>({ ...warning,canParry:false })),
        inventory:display.inventory.map(item=>item && item.action!=='correction' ? { ...item,canSelect:false } : item),
        bookmarkRight:display.bookmarkRight ? { ...display.bookmarkRight,canReturn:false } : null,
      } : display;
      const stunned = Boolean(stun);
      setView({ ...frame, view:visible, self:state.self, supply:state.supply, defense:shownResult,
        finalVisual:itemPresentation?.observe?.(state,frame,streamConnected),
        censoredPages, trapArmed:state.trapArmed, stunned, stunSource:stun?.source, sealed, s5:state.s5,
        cues:itemPresentation?.effects(itemEffects,frame.now,{censored:censoredPages.length>0,stunned}) });
    }

    function stop(error) {
      if (!alive) return;
      failed = true;
      itemPresentation?.stop?.();
      clearTimeout(pulseTimer);
      clearTimeout(deadlineTimer);
      session.close();
      setView(null);
      setDocument(null);
      setLastReceipt(null);
      setTrapChoices(null);
      setFailure(error?.message ?? "SESSION_UNAVAILABLE");
    }
    async function refresh(recovering=false) {
      if (!alive || failed) return;
      if (refreshing) {
        if (product) { queued=true; queuedRecovery ||= recovering; }
        return;
      }
      refreshing = true;
      try {
        const restored = recovering ? await session.recover() : null;
        const state = recovering ? session.snapshot() : await session.refresh();
        if (!alive) return;
        presentation.accept(state.presentation,{ recovering });
        if (recovering && product) {
          itemPresentation?.recover?.(state);
          resultCursor = state.presentation.recipientEventSeq ?? 0n;
          shownResult = null;
          setLiveCue(null);
        }
        setDisconnected(!streamConnected);
        if (restored?.some(Boolean)) {
          const observed = restored.filter(Boolean);
          for (const receipt of observed) seenReceipts.current.add(receipt.receiptId);
          setLastReceipt(observed.at(-1));
        }
        draw();
      } catch (error) {
        if (product && error?.message === "JUNGLE_GATEWAY_UNAVAILABLE" && alive) {
          presentation.suspend();
          itemPresentation?.stop?.();
          setDisconnected(true);
        } else stop(error);
      } finally {
        refreshing = false;
        if (queued) {
          const recover = queuedRecovery;
          queued=false; queuedRecovery=false;
          void refresh(recover);
        }
      }
    }
    void refresh(true);
    const render = setInterval(draw,50);
    const poll = Number.isFinite(refreshMs) && refreshMs>0 ? setInterval(()=>void refresh(),refreshMs) : null;
    const unsubscribe = subscribe?.((recovering,connected)=>{
      streamConnected = connected;
      if (connected) void refresh(recovering);
      else {
        clearTimeout(deadlineTimer);
        deadline = null;
        presentation.suspend();
        itemPresentation?.stop?.();
        setDisconnected(true);
      }
    });
    return () => { alive=false; itemPresentation?.stop?.(); session.close(); active.current=null; clearInterval(render); clearInterval(poll); clearTimeout(pulseTimer); clearTimeout(deadlineTimer); unsubscribe?.(); };
  },[scope,transport,journal,makeRequestId,refreshMs,onPulse,subscribe,itemPresentation,product,s5,finalAssets,startedAt,deadlineAt]);

  const pageId = view?.self?.currentPageId;
  const revisionId = view?.self?.currentRevisionId;
  const snapshotId = view?.self?.currentSnapshotId;
  const progressVersion = product ? view?.self?.progressVersion : undefined;
  const article = document && document.pageId === pageId && document.revisionId === revisionId &&
    (!product || (document.snapshotId === snapshotId && document.progressVersion === progressVersion)) ? document : null;
  useEffect(() => {
    setDocumentFailure(false);
    if (!pageId || !revisionId) return;
    const abort = new AbortController();
    Promise.resolve().then(()=>loadDocument({ pageId,revisionId,snapshotId,progressVersion,signal:abort.signal })).then(result=>{
      if (abort.signal.aborted) return;
      if (result?.pageId !== pageId || result.revisionId !== revisionId || !Array.isArray(result.links) ||
          (product && (result.snapshotId !== snapshotId || result.progressVersion !== progressVersion))) throw new Error("STALE_DOCUMENT");
      setDocument(result);
    }).catch(error=>{
      if (abort.signal.aborted) return;
      if (isScopeFailure(error)) active.current?.stop(error);
      else setDocumentFailure(true);
    });
    return () => abort.abort();
  },[pageId,revisionId,snapshotId,progressVersion,loadDocument,product,documentAttempt]);

  useEffect(()=>{
    if (!liveCue) return;
    const timer = setTimeout(()=>setLiveCue(null),productCueDuration(liveCue));
    return ()=>clearTimeout(timer);
  },[liveCue]);

  const search = view?.s5?.search;
  const delayedSearch = search?.expiresAt > view?.now && search.lastResult?.count === null ? search.windowId : null;
  useEffect(() => {
    if (!delayedSearch || disconnected) return undefined;
    const poll = setInterval(()=>void active.current?.refresh(),500);
    return () => clearInterval(poll);
  },[delayedSearch,disconnected]);

  function run(operation, input) {
    const entry = active.current;
    if (!entry || disconnected) return;
    const panelCommand = s5 && ['search_execute','joker_claim','reward_claim','reward_discard'].includes(operation);
    if (s5 && operation!=='correction' && (view?.stunned || (view?.sealed && operation!=='normal_link'))) return;
    if (panelCommand && s5Pending) return;
    if (panelCommand) setS5Pending(true);
    if (operation === "trap_options") setTrapChoices(null);
    const snapshot = entry.session.snapshot();
    const warningItem = operation === "parry" ? snapshot?.warnings?.find(warning=>warning.childId===input.childId)?.itemId : null;
    const itemId = snapshot?.inventory?.find(grant=>grant.grantId===input.grantId)?.itemId;
    setFailure("");
    itemPresentation?.pending?.(operation,true);
    entry.session.dispatch(operation,input).then(receipt=>{
      if (active.current !== entry) return;
      if (receipt) setLastReceipt(receipt);
      if (receipt && !entry.session.isRetransmission(receipt)) {
        const grants = receipt.code === "REWARD_CLAIMED" ? [receipt.grantId] : receipt.grants?.map(item=>item.grantId);
        if (grants?.some(Boolean)) setRewardGrants(grants.filter(Boolean));
        if (product && receipt.ok && operation === "normal_link") {
          approveMoveMotion(`${scope.sessionId}:${receipt.receiptId}`, true);
          window.scrollTo({ top:0, behavior:"instant" });
        }
      }
      let cue = null;
      if (itemPresentation && receipt && !seenReceipts.current.has(receipt.receiptId)) {
        seenReceipts.current.add(receipt.receiptId);
        cue = itemPresentation.receipt(receipt,{live:!finalAssets || !entry.session.snapshot()?.terminal,itemId,warningItem,
          retransmitted:entry.session.isRetransmission(receipt)});
        if (cue) setLiveCue(cue);
      }
      if (receipt?.ok === false && !cue) {
        setFailure(receipt.code);
      }
      if (operation === "trap_install" && receipt) setTrapChoices(null);
      if (operation === "trap_options" && receipt?.code === "TRAP_OPTIONS") {
        setTrapChoices({ input, options:receipt.options });
      }
      void entry.refresh();
    }).catch(error=>{
      if (active.current !== entry) return;
      if (isScopeFailure(error)) entry.stop(error);
      else setFailure(error?.message ?? "REQUEST_FAILED");
    }).finally(()=>{
      itemPresentation?.pending?.(operation,false);
      if (panelCommand && active.current === entry) setS5Pending(false);
    });
    return { ok:true };
  }

  const frame = view?.view;
  const names = new Map(players.map(player => [player.participantId, player.nickname || player.name]));
  const itemFrame = frame && {
    ...frame,
    targets:frame.targets.map(target => ({ ...target, displayName:names.get(target.participantId) || target.displayName })),
    warnings:frame.warnings.map(warning => ({ ...warning, sourceLabel:names.get(warning.sourceParticipantId) || warning.sourceLabel })),
  };
  const readOnly = disconnected || (frame?.viewer.readOnly ?? true);
  useGameAudio({ identity: "s5:" + scope.sessionId + ":" + scope.actorId, route: gameAudioRoute,
    playing: Boolean(gameAudioRoute && !readOnly), ended: Boolean(frame?.viewer.readOnly),
    connection: gameAudioRoute && disconnected ? "lost" : null });
  const ownPath = players.find(player => player.participantId === scope.participantId)?.pathTitles ?? [];
  const roster = roomRoster ? <ParticipantRoster entries={roomRoster.entries} counts={roomRoster.counts} myUserId={scope.participantId} />
    : players.length > 0 && <section aria-label="참가자와 현재 문서">
    <h2>참가자</h2>
    <ul className="product-item-roster">
      {players.map(player => <li key={player.participantId}>
        <strong>{player.nickname || player.name}{player.participantId === scope.participantId ? " · 나" : ""}</strong>
        {player.currentTitle && <span>{player.currentTitle}</span>}
      </li>)}
    </ul>
  </section>;
  const censoredPages = new Set(view?.censoredPages ?? []);
  const verifiedSearchQuery = search?.expiresAt > view?.now && search.lastResult?.count > 0 && article
    ? search.lastResult.query : null;
  const censoredTitles = (article?.links ?? []).filter(link=>censoredPages.has(link.pageId))
    .map(link=>link.canonicalTitle ?? link.title);
  const onLinkClick = async title => {
    const matches = article?.links.filter(row=>normalizeTitle(row.canonicalTitle ?? row.title) === normalizeTitle(title));
    const link = matches?.[0];
    if (matches?.some(row=>row.pageId!==link.pageId)) return;
    if (link && !view?.stunned && !censoredPages.has(link.pageId)) {
      const input = { pageId: article.pageId, revisionId: article.revisionId,
        snapshotId: article.snapshotId, targetPageId: link.pageId };
      if (!prepareLink) { run("normal_link", input); return; }
      if (preparingLink.current) return;
      preparingLink.current = true;
      const entry = active.current;
      try {
        const targetSnapshotId = await prepareLink(link);
        if (entry === active.current) run("normal_link", { ...input, targetSnapshotId });
      } catch (error) {
        if (entry === active.current) setFailure(error?.code ?? "LINK_SNAPSHOT_MISSING");
      } finally {
        preparingLink.current = false;
      }
    }
  };
  return <div className="group-items-jungle">
    <RaceFrame mode="group" label="그룹 아이템 경기" motion={moveMotion}>
      {view && <ItemRaceStart matchKey={scope.sessionId} startedAt={lifecycle?.started_at}
        now={view.now} enteredFromLobby={enteredFromLobby} />}
      <RaceHud>
        <HudBrand mode="그룹 아이템전"/>
        <div className="product-item-race-course">
          <HudDoc label="현재 문서" title={article?.title}/>
          <HudArrow/><HudDoc kind="goal" label="목표 문서" title={target?.title}/>
        </div>
        <HudStat label="이동" value={view?.self?.moveCount ?? "–"}/>{matchClock}
        {finalAssets && <div className="group-items-hud-slots item-race-anchor" ref={setItemToolbar} />}
      </RaceHud>
      {(kionDock || audioControls || roomActions) && <div className="item-race-utility">
        {kionDock}
        {(audioControls || roomActions) && <details className="item-race-settings"><summary>경기 설정</summary>
          {audioControls}{roomActions}
        </details>}
      </div>}
      {explorationHints}
      {roomRoster && <MobileRouteNotes path={ownPath} />}
      {s5 && frame && !readOnly && <S5Panels state={view.s5} inventory={frame.inventory.filter(Boolean)} now={view.now} slots={frame.inventory.filter(slot=>!slot).length}
        inputsDisabled={s5Pending || view.stunned || view.sealed || !article} movementDisabled={view.stunned || !article}
        onAct={run} onLink={onLinkClick} censoredPages={censoredPages} lastReceipt={lastReceipt}/>}
      {frame && !readOnly && trapChoices && <div className="s5-panels" role="group" aria-label="깜짝상자 링크 선택">
        {trapChoices.options.map(option=><button key={option.pageId} type="button"
          onClick={()=>run("trap_install",{ ...trapChoices.input, selectionToken:option.selectionToken })}>
          {article?.links.find(link => link.pageId === option.pageId)?.title ?? option.pageId}
        </button>)}
        {trapChoices.options.length===0 && <p role="status">설치할 수 있는 링크가 없어요.</p>}
        <button type="button" onClick={()=>setTrapChoices(null)}>취소</button>
      </div>}
      {roster && <details className="product-item-mobile-roster"><summary>참가자 {players.length}명</summary>{roster}</details>}
      <div className={roster ? "wr-race-body" : "wr-race-body is-wide"}>
        {roster && <aside className="wr-race-side product-item-race-roster">{roster}
          {roomRoster && <RouteRail path={ownPath} currentTitle={article?.title} />}</aside>}
        <div className="gip-document" data-product-vfx={product && !finalAssets} data-s5-priority-vfx={finalAssets ? true : undefined}>
          <main className="wr-race-main" aria-label="문서 읽기 영역">
            {roomRoster && pageId && !article && !documentFailure && <PageLoadingOverlay />}
            <WikiViewer target={roomRoster ? targetBrief : target} currentTitle={article?.title ?? ""} currentSummary="" currentDocumentHtml={article?.html ?? ""}
              links={article?.links ?? []} isLoading={Boolean(pageId && !article && !documentFailure)}
              censoredTitles={censoredTitles} authorizedSearchQuery={s5 ? verifiedSearchQuery : undefined} onLinkClick={onLinkClick} readOnly={readOnly || !article || view?.stunned} showTargetBrief={Boolean(roomRoster)}/>
            {documentFailure && <div>
              <p role="status">현재 문서를 불러오지 못했습니다.</p>
              <button type="button" onClick={()=>setDocumentAttempt(attempt=>attempt+1)}>문서 다시 불러오기</button>
            </div>}
          </main>
          {frame && !readOnly && <>
            {finalAssets ? <FinalAssetOverlay value={view.finalVisual} pulse={view.pulse} frame={view}>
              <AttackWarningEdge view={itemFrame} events={view.events} running windowMs={warningWindowMs}/>
            </FinalAssetOverlay> : <>
              <AttackWarningEdge view={frame} events={view.events} running windowMs={warningWindowMs}/>
              {product ? <ProductInkVfx pulse={view.pulse} frame={view}/> :
                <ItemImpactEffect view={frame} pulse={view.pulse} events={view.events} running/>}
            </>}
            {product && !finalAssets && <>
              <ProductItemMotion key={view.defense?.key} cue={view.defense}/>
              <ProductItemMotion key={liveCue?.key} cue={liveCue}/>
            </>}
            {view.defense && (itemPresentation?.renderCue?.(view.defense) ??
              <DefenseFeedback cue={view.defense} showMotion={!product}/>)}
          </>}
        </div>
      </div>
      <div className={finalAssets ? "group-item-alerts" : "group-items-jungle-dock"} data-item-race-dock>
        {finalAssets && <span className="gip-feedback-sr" role="status">{view?.finalVisual?.scenes
          .filter(scene=>scene.key.startsWith("recipient:")).map(scene=>scene.label).join(" · ")}</span>}
        {finalAssets && <div className="s5-dock-warnings" ref={setWarningToolbar}/>}
        <div className="s5-dock-content">
        <PlaytestItemsHud view={itemFrame} numberSlots={s5} visible={Boolean(frame) && !readOnly} enhancedFeedback running warningWindowMs={warningWindowMs}
          toolbar={finalAssets ? itemToolbar : null} warningToolbar={warningToolbar} supplySeconds={supplySeconds} suppliedGrant={suppliedGrant} rewardGrants={rewardGrants}
          onParry={warning=>run("parry",{ childId:warning.childId })} onReturn={rightId=>run("bookmark_return",{ rightId })}
          onUse={input=>run(input.action,input)}/>
        {!itemPresentation && lastReceipt?.code==="TRAP_INSTALLED" && <p role="status">깜짝상자를 설치했어요.</p>}
        {[...(view?.cues ?? []), ...(liveCue ? [liveCue] : [])].map(cue=><React.Fragment key={cue.key}>
          {itemPresentation?.renderCue?.(cue) ?? <p role="status" data-item-cue={cue.kind}>{cue.message}</p>}
        </React.Fragment>)}
        {disconnected && <p role="status">경기 연결을 다시 확인하고 있어요. <button type="button" onClick={()=>void active.current?.refresh(true)}>경기 상태 다시 확인</button></p>}
        {failure && <p className="group-items-jungle-status" role="status">
          {Object.hasOwn(commandRejectionMessages, failure) ? commandRejectionMessages[failure] : commandFailureMessage}
        </p>}
        {frame?.viewer.readOnly && <p role="status">경기가 종료됐어요.</p>}
        </div>
      </div>
      {roomRoster && article && <ScrollToTopButton race />}
    </RaceFrame>
  </div>;
}

export default function GroupItemsJungle({ room,supported,scope,ordinary=null,...props }) {
  const route = selectGroupItemRoute(room,supported);
  if (route === "ordinary") return ordinary;
  if (route === "unsupported" || !scope || (!room.sessionId || room.sessionId!==scope.sessionId) ||
      selectGroupItemRoute({mode:"group_items",sessionId:scope.sessionId,protocol:scope.protocol,binding:scope.binding},supported)!=="item-group" ||
      !Number.isFinite(props.warningWindowMs) || props.warningWindowMs<=0) {
    return <p role="status">이 그룹 아이템 경기 버전은 지원되지 않아요.</p>;
  }
  const key = JSON.stringify([scope.actorId,scope.sessionId,scope.participantId,scope.ownerEpoch,scope.protocol,scope.binding]);
  return <PlayingGroup key={key} scope={scope} {...props}/>;
}
