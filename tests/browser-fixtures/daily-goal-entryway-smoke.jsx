import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import WikiViewer from "../../components/WikiViewer.jsx";
import { fetchPageData } from "../../services/wikiService.js";
import "../../css/app.css";

/**
 * Real public wiki page -> Wiki Race sanitizer -> actual WikiViewer click bridge.
 * Research only; no authenticated account, Supabase calls, or server-side move.
 */
function Fixture() {
  const query = new URLSearchParams(window.location.search);
  const source = query.get("source") || "";
  const targetTitle = query.get("target") || "";
  const [page, setPage] = useState(null);
  const [error, setError] = useState("");
  const [lastClick, setLastClick] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetchPageData(source)
      .then(next => { if (!cancelled) setPage(next); })
      .catch(reason => { if (!cancelled) setError(String(reason?.message || reason)); });
    return () => { cancelled = true; };
  }, [source]);
  return (
    <main>
      <p data-testid="load-state">{error ? "ERROR" : page ? "READY" : "LOADING"}</p>
      <p data-testid="load-error">{error}</p>
      <p data-testid="page-title">{page?.canonicalTitle || ""}</p>
      <p data-testid="last-click">{lastClick}</p>
      {page && (
        <WikiViewer
          target={{ title: targetTitle, summary: "목표 문서" }}
          currentTitle={page.canonicalTitle}
          currentSummary={page.summary}
          currentDocumentHtml={page.documentHtml}
          links={page.links}
          isLoading={false}
          onLinkClick={setLastClick}
          showTargetBrief={false}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")).render(<Fixture />);
