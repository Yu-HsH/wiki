import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../authContext";
import WikiRaceShell from "../components/wiki-race/WikiRaceShell.jsx";
import {
  getManagedSiteNews, isSiteNewsAdmin, saveSiteNewsForm,
} from "../services/siteNewsService.js";

const EMPTY = { id:null, title:"", summary:"", details:"", type:"업데이트", status:"draft", published_at:null };
const toForm = row => row ? {
  id:row.id, title:row.title, summary:row.summary, details:(row.details || []).join("\n"),
  type:row.type, status:row.status, published_at:row.published_at,
} : { ...EMPTY };

export default function AdminUpdatesPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [allowed, setAllowed] = useState(null);
  const [posts, setPosts] = useState([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const ok = Boolean(user && !user.isGuest && user.mode === "supabase" && await isSiteNewsAdmin());
        if (!active) return;
        setAllowed(ok);
        if (ok) {
          const rows = await getManagedSiteNews();
          if (active) setPosts(rows);
        }
      } catch {
        if (active) { setAllowed(false); setError("운영자 권한을 확인하지 못했습니다."); }
      }
    })();
    return () => { active = false; };
  }, [user?.id, user?.mode, user?.isGuest]);

  const save = async kind => {
    if (!allowed || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await saveSiteNewsForm(form, {
        id:form.id,
        publish:kind === "publish",
        hide:kind === "hide",
      });
      const rows = await getManagedSiteNews();
      setPosts(rows); setForm(toForm(result));
      setMessage(kind === "publish" ? "소식을 게시했습니다." :
        kind === "hide" ? "소식을 비공개로 전환했습니다." : "소식을 저장했습니다.");
    } catch (cause) {
      setError(cause?.message || "소식을 저장하지 못했습니다.");
    } finally { setBusy(false); }
  };
  const edit = (field, value) => setForm(old => ({ ...old, [field]:value }));
  const onLogout = async () => { await logout(); navigate("/"); };

  return (
    <WikiRaceShell user={user} level={null} view="updates" onLogout={onLogout}>
      <section className="wr-updates-page wr-news-admin" aria-labelledby="wr-news-admin-title">
        <div className="wr-updates-heading">
          <p className="wr-kicker">EXPLORER JOURNAL</p>
          <h1 id="wr-news-admin-title">소식 운영 관리</h1>
          <p>작성·수정·게시·비공개 전환을 관리합니다. 저장만 하면 공개되지 않습니다.</p>
          <button type="button" className="wr-news-admin-link" onClick={() => navigate("/updates")}>소식 페이지로 돌아가기</button>
        </div>
        {allowed === null ? <p role="status">운영자 권한 확인 중…</p> : !allowed
          ? <p role="alert">접근 권한이 없습니다. 운영자로 등록된 계정으로 로그인해 주세요.</p>
          : <div className="wr-updates-layout">
              <aside className="wr-updates-list" aria-label="관리할 소식">
                <button type="button" className="wr-news-create" onClick={() => { setForm(toForm(null)); setMessage(""); setError(""); }}>+ 새 소식 작성</button>
                {posts.map(post => (
                  <button type="button" className={`wr-updates-item${form.id === post.id ? " is-selected" : ""}`}
                    key={post.id} onClick={() => { setForm(toForm(post)); setMessage(""); setError(""); }}>
                    <span className="wr-updates-item-meta"><span>{post.status === "published" ? "게시됨" : "비공개 초안"}</span><span>{post.type}</span></span>
                    <strong>{post.title}</strong>
                    <span>{post.summary}</span>
                  </button>
                ))}
              </aside>
              <div className="wr-updates-article wr-news-editor">
                <h2>{form.id ? "소식 수정" : "새 소식"}</h2>
                <label htmlFor="news-type">구분</label>
                <select id="news-type" value={form.type} onChange={e => edit("type",e.target.value)} disabled={busy}>
                  <option>업데이트</option><option>공지</option><option>점검</option>
                </select>
                <label htmlFor="news-title">제목</label>
                <input id="news-title" value={form.title} onChange={e => edit("title",e.target.value)}
                  maxLength={120} disabled={busy} placeholder="예: Wiki Race 2.0.3 업데이트" />
                <label htmlFor="news-summary">한 줄 요약</label>
                <textarea id="news-summary" rows={2} maxLength={360} value={form.summary}
                  onChange={e => edit("summary",e.target.value)} disabled={busy} />
                <label htmlFor="news-details">본문 — 줄마다 항목 하나</label>
                <textarea id="news-details" rows={11} value={form.details}
                  onChange={e => edit("details",e.target.value)} disabled={busy}
                  placeholder="업데이트 항목을 한 줄씩 입력해 주세요." />
                <p className="wr-news-editor-hint">게시된 글도 수정할 수 있습니다. '비공개로 전환'하면 일반 사용자에게 표시되지 않습니다.</p>
                {error && <p role="alert" className="wr-news-error">{error}</p>}
                {message && <p role="status" className="wr-news-success">{message}</p>}
                <div className="wr-news-actions">
                  <button type="button" disabled={busy} onClick={() => void save("save")}>임시 저장</button>
                  <button type="button" disabled={busy} onClick={() => void save("publish")}>게시하기</button>
                  {form.id && form.status === "published" &&
                    <button type="button" disabled={busy} onClick={() => void save("hide")}>비공개로 전환</button>}
                </div>
              </div>
            </div>}
      </section>
    </WikiRaceShell>
  );
}
