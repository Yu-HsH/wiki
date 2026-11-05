import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../authContext";
import WikiRaceShell from "../components/wiki-race/WikiRaceShell.jsx";
import { UPDATE_NOTICES, markUpdatesRead } from "../data/updateNotices.js";

export default function UpdatesPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [selected, setSelected] = useState(UPDATE_NOTICES[0]?.id ?? null);

  useEffect(() => { markUpdatesRead(); }, []);

  const onLogout = async () => { await logout(); navigate("/"); };
  const active = UPDATE_NOTICES.find(item => item.id === selected) ?? UPDATE_NOTICES[0];

  return (
    <WikiRaceShell user={user} level={null} onLogout={onLogout} view="updates">
      <section className="wr-updates-page" aria-labelledby="wr-updates-title">
        <div className="wr-updates-heading">
          <p className="wr-kicker">EXPLORER JOURNAL</p>
          <h1 id="wr-updates-title">탐험대 소식</h1>
          <p>새로운 탐험 소식, 업데이트와 수정 내역을 이곳에서 확인하세요.</p>
        </div>
        <div className="wr-updates-layout">
          <div className="wr-updates-list" aria-label="소식 목록">
            {UPDATE_NOTICES.map(notice => (
              <button type="button" key={notice.id} aria-pressed={active?.id === notice.id}
                className={`wr-updates-item${active?.id === notice.id ? " is-selected" : ""}`}
                onClick={() => setSelected(notice.id)}>
                <span className="wr-updates-item-meta"><span>{notice.date}</span><span>{notice.type}</span></span>
                <strong>{notice.title}</strong>
                <span>{notice.summary}</span>
              </button>
            ))}
          </div>
          {active && <article className="wr-updates-article" aria-live="polite">
            <div className="wr-updates-article-meta"><time dateTime={active.date}>{active.date}</time>
              <span>{active.status === "planned" ? "준비 중" : "배포 완료"}</span></div>
            <h2>{active.title}</h2>
            <p className="wr-updates-article-summary">{active.summary}</p>
            <ul>{active.details.map(detail => <li key={detail}>{detail}</li>)}</ul>
          </article>}
        </div>
      </section>
    </WikiRaceShell>
  );
}
