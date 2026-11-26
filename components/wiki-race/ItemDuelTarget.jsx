import React, { useState } from "react";
import { searchWikiTitleCandidates } from "../../services/wikiService.js";
import { LobbyIcon } from "./LobbyParts.jsx";

export default function ItemDuelTarget({ title, isHost, busy, onSelect, onSearchBusy }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [status, setStatus] = useState("");
  const [searching, setSearching] = useState(false);
  const showSearch = isHost && (!title || editing);

  async function search(event) {
    event.preventDefault();
    if (!query.trim() || searching || busy) return;
    setSearching(true);
    onSearchBusy(true);
    setStatus("");
    setCandidates([]);
    try {
      const results = await searchWikiTitleCandidates(query);
      const parser = new DOMParser();
      setCandidates(results.map(candidate => ({ ...candidate,
        summary: parser.parseFromString(candidate.snippet ?? "", "text/html").body.textContent,
      })));
      if (!results.length) setStatus("검색 결과가 없습니다. 다른 검색어를 입력해 주세요.");
    } catch {
      setStatus("검색 결과를 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSearching(false);
      onSearchBusy(false);
    }
  }

  async function choose(candidate) {
    if (await onSelect(candidate.title)) closeSearch();
  }

  function closeSearch() {
    setEditing(false);
    setQuery("");
    setCandidates([]);
    setStatus("");
  }

  return <section className="wr-duel-target room-target-section" aria-labelledby="item-duel-target-heading" aria-busy={busy || searching}>
    <div className="wr65-duel-target-head">
      <h2 className="wr-section-label" id="item-duel-target-heading"><LobbyIcon name="flag" /> 공통 목표</h2>
      <span className={`wr65-target-state ${title ? "is-confirmed" : ""}`} role="status">
        {busy && showSearch ? "목표 저장 중" : title ? "목표 확정" : isHost ? "목표 미확정" : "방장이 목표를 고르는 중"}
      </span>
    </div>
    {title && <div className="wr65-saved-target"><strong className="wr-duel-center-title wr-gold-pill">{title}</strong></div>}
    <div className="wr-duel-target-body">
      {isHost && title && !showSearch && <button type="button" className="wr-link-btn" disabled={busy}
        onClick={() => setEditing(true)}>목표 변경</button>}
      {showSearch && <form className="wr-target-search" role="search" aria-label="목표 문서 검색" onSubmit={search}>
        <label className="wr-search-field">
          <LobbyIcon name="search" size={14} />
          <span className="wr-visually-hidden">목표 문서 검색어</span>
          <input className="room-target-input" value={query} required disabled={searching || busy}
            placeholder="위키백과 문서 검색" onChange={event => {
              setQuery(event.target.value);
              setCandidates([]);
              setStatus("");
            }} />
        </label>
        <button type="submit" className="wr-btn wr-btn--secondary" disabled={searching || busy || !query.trim()}>
          {searching ? "검색 중…" : "검색"}
        </button>
        {title && <button type="button" className="wr-link-btn" disabled={searching || busy} onClick={closeSearch}>취소</button>}
        <span className="wr-target-help">검색 결과에서 문서를 고르면 공통 목표로 저장됩니다.</span>
      </form>}
      {!isHost && <p className="wr-target-pending">방장이 목표를 선택하고 경기를 시작합니다.</p>}
    </div>
    <span className="wr-target-note">출발 문서는 경기 시작 시 결정됩니다</span>
    {status && <p className="wr-lobby-muted" role="status">{status}</p>}
    {showSearch && candidates.length > 0 && <ul className="wr-search-results" aria-label="목표 문서 검색 결과">
      {candidates.map(candidate => <li key={candidate.title}>
        <button type="button" className="search-item" disabled={busy} onClick={() => void choose(candidate)}>
          <span className="search-item-title">{candidate.title}</span>
          {candidate.summary && <span className="search-item-snippet" aria-hidden="true">{candidate.summary}</span>}
          <span className="wr-search-pick" aria-hidden="true">선택</span>
        </button>
      </li>)}
    </ul>}
  </section>;
}
