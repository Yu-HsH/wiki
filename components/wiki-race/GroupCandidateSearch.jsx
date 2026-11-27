import React from "react";
import { LobbyIcon } from "./LobbyParts.jsx";

function Snippet({ html }) {
  const template = document.createElement("template");
  template.innerHTML = html || "";
  return Array.from(template.content.childNodes, (node, index) =>
    node.nodeType === Node.ELEMENT_NODE && node.classList.contains("searchmatch")
      ? <span className="searchmatch" key={index}>{node.textContent}</span>
      : node.textContent
  );
}

export default function GroupCandidateSearch({
  query, candidates, selectedTitle, searching, disabled, onQueryChange, onSearch, onSelect,
}) {
  return <>
    <form className="wr-target-search wr-target-search--stack" role="search" aria-label="내 문서 후보 검색"
      onSubmit={event => { event.preventDefault(); onSearch(); }}>
      <label className="wr-search-field">
        <LobbyIcon name="search" size={14} />
        <span className="wr-visually-hidden">문서 후보 검색어</span>
        <input className="mp-room-input" value={query} disabled={disabled} placeholder="위키백과 문서 검색"
          onChange={event => onQueryChange(event.target.value)} />
      </label>
      <button className="wr-btn wr-btn--secondary" type="submit" disabled={searching || disabled || !query.trim()}>
        {searching ? "검색 중..." : "검색"}
      </button>
    </form>
    {candidates.length > 0 ? (
      <ul className="wr-search-results room-target-suggestions group-suggestions" aria-label="문서 후보 검색 결과">
        {candidates.map(candidate => <li key={candidate.title}>
          <button type="button" onClick={() => onSelect(candidate)} disabled={disabled}
            className={`search-item ${selectedTitle === candidate.title ? "active" : ""}`}>
            <span className="search-item-title">{candidate.title}</span>
            <span className="search-item-snippet"><Snippet html={candidate.snippet} /></span>
            <span className="wr-search-pick" aria-hidden="true">선택</span>
          </button>
        </li>)}
      </ul>
    ) : <span className="wr-target-help">예: 세종대왕 · 반도체 · 르네상스</span>}
  </>;
}
