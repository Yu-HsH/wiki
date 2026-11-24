import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../authContext.jsx";
import WikiViewer from "../components/group-items-jungle/S5WikiViewer.jsx";
import { LinkList } from "../components/group-items-jungle/S5Panels.jsx";
import { FinalInkVfx, FinalItemIcon, FinalItemMotion } from "../components/group-items-jungle/FinalAssetVfx.jsx";
import { createFinalAssetAudio } from "../components/group-items-jungle/finalAssetAudio.js";
import { itemName, tierLabel } from "../components/group-items-jungle/s5UiContract.js";
import { duelV4 } from "../services/duelV4Service.js";
import { fetchDistinctRandomTitle, fetchPageData, normalizeTitle, sanitizeWikiDocumentHtml } from "../services/wikiService.js";
import { ensureWikiSnapshot } from "../services/wikiSnapshotService.js";
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

const audioCues = {
  SHIELD_ACTIVE: "edit_protection/activate",
  PARRY_REFLECTED: "reverse_link_parry/reflect",
  PARRY_BLOCKED: "reverse_link_parry/block",
  BOOKMARK_SAVED: "path_bookmark/save",
  BOOKMARK_RETURNED: "path_bookmark/return",
  ITEM_ENHANCED: "enhance_scroll/apply",
  ITEM_WEAKENED: "weakening_curse/apply",
  LINK_INDEX_OPEN: "links_only/reveal",
  EFFECT_CLEARED: "emergency_correction/success",
  THUNDER_SELF_PENALTY: "thunder_judgment/self",
  THUNDER_SELF_STUN: "thunder_judgment/self",
  THIEF_STOLEN: "thief_hand/steal",
  THIEF_EMPTY: "thief_hand/empty",
  CANNON_LANDED: "dimension_cannon/arrive",
  CANNON_RETURNED: "dimension_cannon/fire",
  TRAP_STOPPED: "surprise_box/hit",
  TRAP_ARRIVAL: "surprise_box/hit",
  ROULETTE_WON: "chaos_roulette/win",
  ROULETTE_FAILED: "chaos_roulette/fail",
  ROULETTE_BOOSTED: "chaos_roulette/boost",
};

const motionCues = {
  CANNON_LANDED: "cannon-arrive",
  CANNON_RETURNED: "cannon-fire",
  TRAP_STOPPED: "trap-hit",
  TRAP_ARRIVAL: "trap-hit",
  ROULETTE_WON: "roulette-win",
  ROULETTE_FAILED: "roulette-fail",
  ROULETTE_BOOSTED: "roulette-boost",
};

function explanation(code) {
  return messages[code] || "요청을 처리하지 못했습니다. 연결과 경기 상태를 확인해주세요.";
}

async function findSnapshot(title) {
  const page = await fetchPageData(title);
  return ensureWikiSnapshot(page);
}

function Match({ roomId, userId }) {
  const navigate = useNavigate();
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
  const [scene, setScene] = useState(null);
  const activeWork = useRef(false);
  const audio = useRef(null);
  const mounted = useRef(false);
  const article = useRef(null);
  const activeMatch = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const next = await duelV4.state(roomId);
      if (!mounted.current) return;
      setConnectionError("");
      setState((previous) => previous && (previous.version > next.version ||
        (previous.version === next.version && Date.parse(previous.serverTime) > Date.parse(next.serverTime))) ? previous
        : { ...next, receivedAt: Date.now() });
    } catch (cause) {
      if (mounted.current) setConnectionError(explanation(cause.message));
    }
  }, [roomId]);

  const me = state?.players.find((player) => player.id === userId);
  const opponent = state?.players.find((player) => player.id !== userId);
  const current = me?.page;
  const started = Boolean(state?.startedAt);
  const finished = Boolean(state?.finishedAt);
  const now = state ? clock + Date.parse(state.serverTime) - state.receivedAt : clock;
  const expires = (value) => value === "infinity" ? Infinity : Date.parse(value);
  const warning = state?.warnings.find((row) => expires(row.dueAt) > now);
  const ink = state?.effects.find((effect) => effect.kind === "ink" && expires(effect.expiresAt) > now);
  const thunder = state?.effects.some((effect) => effect.kind === "stun" && expires(effect.expiresAt) > now);
  const stunned = thunder || state?.effects.some((effect) =>
    (effect.kind === "cannon_stun" || effect.kind === "trap_stun") && expires(effect.expiresAt) > now);
  const protectedByShield = state?.effects.some((effect) => effect.kind === "shield" && expires(effect.expiresAt) > now);
  const parry = state?.inventory.find((item) => item.itemId === "parry");
  const chosen = state?.inventory.find((item) => item.id === selected);
  const search = state?.search;
  const reward = expires(state?.reward?.expiresAt) > now ? state.reward : null;
  const linkIndex = expires(state?.linkIndex?.expiresAt) > now ? state.linkIndex : null;
  const searchReady = search && searchDocument?.windowId === search.id && searchDocument.snapshotId === current?.snapshotId;
  const searchResult = searchReady ? search.lastResult : null;
  const highlightedQuery = searchResult?.count > 0 ? searchResult.query : "";

  useEffect(() => {
    setTrapLink("");
  }, [opponent?.progressVersion, selected]);

  useEffect(() => {
    mounted.current = true;
    audio.current = createFinalAssetAudio(window);
    void refresh();
    const unsubscribe = duelV4.subscribe(roomId, userId, refresh);
    const poll = setInterval(refresh, 4500);
    const ticker = setInterval(() => setClock(Date.now()), 100);
    window.addEventListener("online", refresh);
    return () => {
      mounted.current = false;
      unsubscribe();
      clearInterval(poll);
      clearInterval(ticker);
      window.removeEventListener("online", refresh);
      audio.current?.stop();
    };
  }, [refresh, roomId, userId]);

  const boundary = [
    state?.warnings[0]?.dueAt, state?.nextSupplyAt, search?.expiresAt, search?.lastResult?.availableAt, reward?.expiresAt,
    linkIndex?.expiresAt,
    ...(state?.effects.filter((effect) => effect.kind === "censor")
      .flatMap((effect) => [effect.startsAt, effect.expiresAt]) || []),
  ].filter((value) => value && expires(value) > Date.parse(state?.serverTime)).sort()[0];
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
        if (pinned.revisionId !== current.revisionId || pinned.pageId !== current.pageId || !pinned.documentHtml) throw new Error("PINNED_DOCUMENT_REQUIRED");
        setDocument({ id: current.snapshotId, html: sanitizeWikiDocumentHtml(pinned.documentHtml, { currentTitle: current.title }), links: [], summary: "" });
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

  useEffect(() => {
    if (!ink || Date.now() + skew - Date.parse(ink.startsAt) > 900) return;
    audio.current?.play("ink_blind/three_splashes");
  }, [ink?.id]);

  useEffect(() => {
    if (warning?.itemId === "lost_link") audio.current?.play("lost_way/activate");
  }, [warning?.id]);

  async function run(operation, makeInput, previousRequest) {
    if (activeWork.current) return;
    activeWork.current = true;
    setBusy(true);
    setError("");
    let request = previousRequest;
    try {
      request ??= { id: crypto.randomUUID(), operation, input: await makeInput() };
      let result;
      if (operation === "search") result = await duelV4.search(roomId, { ...request.input, id: request.id });
      else if (operation === "reward") result = await duelV4.reward(roomId, request);
      else result = await duelV4.act(roomId, request);
      setRetry(null);
      if (!result.ok || result.code === "ITEM_CHANCE_FAILED") {
        setError(explanation(result.code));
      }
      if (result.ok) {
        const asset = audioCues[result.code];
        if (asset) audio.current?.play(asset);
        const motion = motionCues[result.code];
        if (motion) setScene({ key: request.id, kind: motion, until: Date.now() + 1800 });
        if (operation === "item") setSelected(null);
        if (result.roomId) navigate("/multiplayer/duel-v4/" + result.roomId);
      }
      await refresh();
    } catch (cause) {
      setRetry(request && !cause.code ? request : null);
      setError(explanation(cause.message));
    } finally {
      activeWork.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  if (!state) return <main className="duel-v4"><Link to="/play">플레이</Link><p role="status">{connectionError || "경기를 불러오는 중…"}</p></main>;

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
  });
  const navigateLink = (link) => run("move", async () => {
    const next = await findSnapshot(typeof link === "string" ? link : link.title);
    return { snapshotId: next.snapshotId, fromSnapshotId: current.snapshotId, expectedProgressVersion: me.progressVersion };
  });
  const resolveReward = (claim, replaceGrantId) => run("reward", async () => ({
    rewardId: reward.id, claim, replaceGrantId, inventoryToken: claim ? reward.inventoryToken : null,
  }));
  const frame = ink && { now, view: { effects: [{ effectId: ink.id, startsAt: Date.parse(ink.startsAt), expiresAt: expires(ink.expiresAt), tier: ink.tier }] } };
  const pulse = ink && { effectId: ink.id, index: Math.min(3, Math.max(1, 1 + Math.floor((now - Date.parse(ink.startsAt)) / 180))), tier: ink.tier };
  function stepSearch(direction) {
    const marks = article.current?.querySelectorAll("mark.game-search-highlight");
    if (!marks?.length) return;
    activeMatch.current = (activeMatch.current + direction + marks.length) % marks.length;
    marks[activeMatch.current].scrollIntoView({ block: "center" });
  }

  return <main className="duel-v4" data-duel-v4-version={state.version}>
    <header className="duel-v4-header">
      <Link to="/play">플레이</Link><h1>1:1 아이템전 v4</h1>
      <p>목표 {state.target?.title || "선택 대기"}</p>
      {opponent && <p>{opponent.name} {opponent.page?.title} {opponent.moves}회</p>}
    </header>
    <div className="duel-v4-messages" aria-live="polite">
      {(error || connectionError) && <p>{error || connectionError}</p>}
      {retry && <button onClick={() => run(retry.operation, null, retry)} disabled={busy}>같은 요청 재시도</button>}
      {documentError && <p>{documentError}</p>}
    </div>
    {!started && <section>
      <p>방 코드 <strong data-duel-v4-code>{state.code}</strong></p>
      <p>참가자 {state.players.map((player) => player.name).join(", ")}</p>
      {state.hostId === userId ? <>
        <form onSubmit={(event) => {
          event.preventDefault();
          void run("target", async () => ({ snapshotId: (await findSnapshot(target)).snapshotId }));
        }}>
          <label>목표 문서 <input value={target} onChange={(event) => setTarget(event.target.value)} required /></label>
          <button disabled={busy}>목표 저장</button>
        </form>
        <button disabled={busy || !opponent || !state.target} onClick={() => run("start", async () => {
          const title = await fetchDistinctRandomTitle(new Set([normalizeTitle(state.target.title)]));
          return { snapshotId: (await findSnapshot(title)).snapshotId };
        })}>게임 시작</button>
      </> : <p>방장이 목표를 선택하고 시작합니다.</p>}
    </section>}
    {started && !finished && <>
      <section className="duel-v4-document" ref={article}>
        {stunned && <p role="status">{messages.STUNNED}</p>}
        {search && <section aria-label="문서 내 검색">
          {searchError ? <button onClick={() => setSearchAttempt((attempt) => attempt + 1)}>검색 본문 다시 불러오기</button>
            : !searchReady && <p role="status">검색 본문을 준비하고 있습니다.</p>}
          {searchReady && search.remaining > 0 && <form onSubmit={(event) => {
            event.preventDefault();
            void run("search", async () => ({ windowId: search.id, query: searchQuery.trim(), documentHash: searchDocument.documentHash }));
          }}>
            <label>문서 검색어 <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} maxLength={4096} /></label>
            <button disabled={busy || stunned || !searchQuery.trim()}>검색</button>
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
      {state.bookmark?.page.snapshotId !== current?.snapshotId && state.bookmark &&
        <button onClick={() => run("bookmark", async () => ({}))} disabled={busy}>책갈피로 돌아가기</button>}
      <button onClick={() => run("forfeit", async () => ({}))} disabled={busy}>기권</button>
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
            disabled={busy || (chosen.itemId === "trap" && !trapLink)}>사용</button>}
        </aside>}
        {warning && <div className="duel-v4-warning" role="status">
          <span>{itemName(warning.itemId)} 공격</span>
          {parry && <button className="duel-v4-parry" onClick={() => useItem(parry, warning.id)} disabled={busy}>패링</button>}
        </div>}
        <div className="duel-v4-slots">
          {[1, 2].map((slot) => {
            const item = state.inventory.find((row) => row.slot === slot);
            return <button key={slot} type="button" disabled={!item || busy} onClick={() => setSelected(item.id)} data-duel-v4-item={item?.itemId}>
              {item && <FinalItemIcon item={{ ...item, effectiveTier: item.tier }} />}
              {item ? itemName(item.itemId) + (tierLabel(item.tier) ? " " + tierLabel(item.tier) : "") : "빈 슬롯"}
            </button>;
          })}
          <span>보급 {Math.max(0, Math.ceil((expires(state.nextSupplyAt) - now) / 1000))}초</span>
        </div>
      </footer>
    </>}
    {finished && <section aria-label="경기 결과">
      <h2>{state.winnerId === userId ? "승리" : state.winnerId ? "패배" : "경기 무효"}</h2>
      <p>획득 XP +{state.xp}</p>
      {state.players.map((player) => <p key={player.id}>{player.name} {player.moves}회 · {player.path?.map((page) => page.title).join(" → ")}</p>)}
      <button disabled={busy} onClick={() => run("rematch", async () => ({}))}>재경기</button>
    </section>}
  </main>;
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
  return <main className="duel-v4">
    <Link to="/play">플레이</Link><h1>1:1 아이템전 v4</h1>
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
  </main>;
}

export default function DuelV4Page() {
  const { roomId } = useParams();
  const { user } = useAuth();
  if (!user) return null;
  return roomId ? <Match key={roomId} roomId={roomId} userId={user.id} /> : <Entry />;
}
