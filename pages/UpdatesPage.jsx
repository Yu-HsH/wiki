import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../authContext";
import WikiRaceShell from "../components/wiki-race/WikiRaceShell.jsx";
import { UPDATE_NOTICES, getLatestNoticeId, markUpdatesRead } from "../data/updateNotices.js";
import { getPublishedSiteNews, isSiteNewsAdmin } from "../services/siteNewsService.js";

export default function UpdatesPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [notices, setNotices] = useState(UPDATE_NOTICES);
  const [selected, setSelected] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getPublishedSiteNews().then(data => {
      if (!active) return;
      setNotices(data);
      markUpdatesRead(undefined, getLatestNoticeId(data));
      window.dispatchEvent(new Event("wiki-race-news-read"));
    }).catch(() => {
      if (!active) return;
      markUpdatesRead(undefined, getLatestNoticeId(UPDATE_NOTICES));
      window.dispatchEvent(new Event("wiki-race-news-read"));
    }).finally(() => { if (active) setLoading(false); });
    if (user && !user.isGuest && user.mode === "supabase") {
      isSiteNewsAdmin().then(ok => { if (active) setIsAdmin(ok); }).catch(() => {});
    }
    return () => { active = false; };
  }, [user?.id, user?.mode, user?.isGuest]);

  const onLogout = async () => { await logout(); navigate("/"); };
  const active = notices.find(item => item.id === selected) ?? notices[0];

  return (
    <WikiRaceShell user={user} level={null} onLogout={onLogout} view="updates">
      <section className="wr-updates-page" aria-labelledby="wr-updates-title">
        <div className="wr-updates-heading">
          <p className="wr-kicker">EXPLORER JOURNAL</p>
          <h1 id="wr-updates-title">탐험대 소식</h1>
          <p>새로운 탐험 소식, 업데이트와 수정 내역을 이곳에서 확인하세요.</p>
          {isAdmin && <button type="button" className="wr-news-admin-link" onClick={() => navigate("/admin/updates")}>소식 관리</button>}
        </div>
        {loading && <p role="status">새로운 소식을 확인하고 있습니다…</p>}
        <div className="wr-updates-layout">
          <div className="wr-updates-list" aria-label="소식 목록">
            {notices.map(notice => (
              <button type="button" key={notice.id} aria-pressed={active?.id === notice.id}
                className={`wr-updates-item${active?.id === notice.id ? " is-selected" : ""}`}
                onClick={() => setSelected(notice.id)}>
                <span className="wr-updates-item-meta"><span>{notice.date}</span><span>{notice.type}</span></span>
                <strong>{notice.title}</strong>
                <span>{notice.summary}</span>
              </button>
            ))}
          </div>
          {active ? <article className="wr-updates-article" aria-live="polite">
            <div className="wr-updates-article-meta"><time dateTime={active.date}>{active.date}</time>
              <span>{active.status === "planned" ? "준비 중" : "배포 완료"}</span></div>
            <h2>{active.title}</h2>
            <p className="wr-updates-article-summary">{active.summary}</p>
            <ul>{active.details.map((detail, i) => <li key={i}>{detail}</li>)}</ul>
          </article> : <p>게시된 소식이 없습니다.</p>}
        </div>
      </section>
    </WikiRaceShell>
  );
}
