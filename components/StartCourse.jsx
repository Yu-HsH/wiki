import React from "react";

/** Only supplied canonical titles, always readable even before a decorative sequence ends. */
export default function StartCourse({ startTitle, targetTitle }) {
  if (!startTitle || !targetTitle) return <p className="wr-start-note">서버의 공통 코스를 확인하고 있습니다.</p>;
  return <div className="wr-start-course" aria-label="확정 출발·목표 문서">
    <div><small>출발 문서</small><strong>{startTitle}</strong></div>
    <span className="wr-start-path" aria-hidden="true">······ →</span>
    <div><small>목표 문서</small><strong>{targetTitle}</strong></div>
  </div>;
}
