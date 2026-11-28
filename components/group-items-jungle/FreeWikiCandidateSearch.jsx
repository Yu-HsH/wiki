import React, { useState } from "react";
import { searchWikiTitleCandidates } from "../../services/wikiService.js";
import GroupCandidateSearch from "../wiki-race/GroupCandidateSearch.jsx";
import { prepareFreeWikiDestination } from "./freeWikiDocument.js";

export default function FreeWikiCandidateSearch({ selectedTitle, disabled, onSelect }) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function search() {
    if (disabled || saving || searching || !query.trim()) return;
    setSearching(true);
    setMessage("");
    try {
      const results = await searchWikiTitleCandidates(query.trim(), 7);
      setCandidates(results);
      if (!results.length) setMessage("검색 결과가 없어요.");
    } catch {
      setCandidates([]);
      setMessage("문서를 검색하지 못했어요.");
    } finally {
      setSearching(false);
    }
  }

  async function choose(candidate) {
    if (saving || disabled) return;
    setSaving(true);
    setMessage("");
    try {
      const accepted = await onSelect(await prepareFreeWikiDestination(candidate));
      if (accepted) {
        setCandidates([]);
        setQuery("");
      }
    } catch {
      setMessage("문서 후보를 준비하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <GroupCandidateSearch query={query} candidates={candidates} selectedTitle={selectedTitle}
      searching={searching} disabled={disabled || searching || saving}
      onQueryChange={value => { setQuery(value); setCandidates([]); setMessage(""); }}
      onSearch={search} onSelect={choose} />
    {saving && <p role="status">제출할 문서를 확인하고 있어요.</p>}
    {message && <p role="status">{message}</p>}
    {selectedTitle && <p className="wr-course-note">내 후보 <strong>{selectedTitle}</strong>{" "}
      <button type="button" className="wr-link-btn" disabled={disabled || saving}
        onClick={() => void onSelect(null)}>후보 취소</button>
    </p>}
  </>;
}
