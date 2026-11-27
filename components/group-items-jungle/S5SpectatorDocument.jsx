import { ensureWikiSnapshot } from "../../services/wikiSnapshotService.js";
import React, { useEffect, useState } from "react";
import { productId, wikiId } from "./productContract.js";
import { sanitizeWikiDocumentHtml } from "./S5WikiSanitizer.js";
import "./s5SpectatorDocument.css";

function readReply(value, roomId, sessionId, targetId) {
  const eligible = value?.activeParticipantIds;
  if (value?.roomId !== roomId || value.sessionId !== sessionId ||
      !Array.isArray(eligible) || !eligible.every(productId)) {
    throw new Error("SPECTATOR_DOCUMENT_SCOPE_MISMATCH");
  }
  if (!targetId) return { eligible };
  if (!eligible.includes(targetId) || value.participantId !== targetId ||
      !wikiId(value.pageId) || !wikiId(value.revisionId) ||
      typeof value.canonicalTitle !== "string" || !value.canonicalTitle.trim() ||
      (value.documentHtml !== null && typeof value.documentHtml !== "string")) {
    throw new Error("SPECTATOR_DOCUMENT_SCOPE_MISMATCH");
  }
  return {
    eligible, title: value.canonicalTitle, pageId:value.pageId, revisionId:value.revisionId,
    html: value.documentHtml ? sanitizeWikiDocumentHtml(value.documentHtml, { currentTitle: value.canonicalTitle, apiLinks: [] }) : "",
  };
}

function saveSelection(key, participant) {
  try { sessionStorage.setItem(key, participant); } catch { /* Session storage can be blocked. */ }
}

export default function S5SpectatorDocument({ room, actorId, readIdentity, rpc }) {
  const { roomId, sessionId, binding, version } = room;
  const storageKey = "s5-spectator-target:" + sessionId + ":" + actorId;
  const [selected, setSelected] = useState(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      return productId(saved) ? saved : "";
    } catch { return ""; }
  });
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState(null);
  const [notice, setNotice] = useState("");
  const requestKey = [sessionId, selected, version, retry].join(":");
  const current = result?.key === requestKey ? result : null;
  const targets = room.players.filter(player => result?.eligible.includes(player.participantId));

  useEffect(() => {
    const recover = () => { if (!document.hidden) setRetry(value => value + 1); };
    window.addEventListener("online", recover);
    document.addEventListener("visibilitychange", recover);
    return () => {
      window.removeEventListener("online", recover);
      document.removeEventListener("visibilitychange", recover);
    };
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      try {
        const identity = await readIdentity();
        if (identity.actorId !== actorId || abort.signal.aborted) return;
        const value = await rpc("get_group_items_spectator_document_v1", {
          p_room: roomId, p_session: sessionId, p_binding: binding, p_target_participant: selected || null,
        }, identity.accessToken, abort.signal);
        const data = readReply(value, roomId, sessionId, selected);
        if (room.freeWiki && selected && !data.html) {
          const pinned = await ensureWikiSnapshot(data, { includeDocument:true, signal:abort.signal });
          if (pinned.pageId !== data.pageId || pinned.revisionId !== data.revisionId) throw new Error("STALE_DOCUMENT");
          data.html = sanitizeWikiDocumentHtml(pinned.documentHtml, { currentTitle:data.title, apiLinks:[] });
        }
        if (!abort.signal.aborted) setResult({ key: requestKey, ...data });
      } catch (error) {
        if (abort.signal.aborted) return;
        if (error.code === "42501") {
          setResult(null);
          if (selected) {
            saveSelection(storageKey, "");
            setSelected("");
            setNotice("이 탐험가의 문서를 지금 볼 수 없어요.");
          }
          return;
        }
        setResult(previous => previous ? { key: requestKey, eligible: previous.eligible, failed: true } : null);
      }
    }
    void load();
    return () => abort.abort();
  }, [actorId, binding, readIdentity, requestKey, roomId, room.freeWiki, rpc, selected, sessionId, storageKey]);

  if (!targets.length && !notice) return null;
  return <section className="s5-spectator-document" aria-label="상대 문서 관전">
    {targets.length > 0 && <label>따라볼 탐험가{" "}
      <select value={selected} onChange={event => {
        const participant = event.target.value;
        setSelected(participant);
        setNotice("");
        saveSelection(storageKey, participant);
      }}>
        <option value="">탐험가 선택</option>
        {targets.map(player => <option key={player.participantId} value={player.participantId}>{player.name}</option>)}
      </select>
    </label>}
    {notice && <p role="status">{notice}</p>}
    {current?.failed && <p>이 탐험가의 문서를 확인하지 못했어요.{" "}
      <button type="button" onClick={() => setRetry(value => value + 1)}>다시 보기</button></p>}
    {selected && (!current ? <p role="status">문서를 불러오는 중…</p>
      : current.title && <article className="s5-spectator-document__body" key={current.title}>
        <h2>{current.title}</h2>
        {current.html
          ? <div dangerouslySetInnerHTML={{ __html: current.html }} />
          : <p>이 문서의 본문을 불러올 수 없어요.</p>}
      </article>)}
  </section>;
}
