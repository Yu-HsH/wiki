import React from "react";

/**
 * PageLoadingOverlay
 * 문서 이동 시 화면 전체를 덮는 로딩 오버레이
 */
export default function PageLoadingOverlay() {
  return (
    <div className="page-loading-overlay">
      <div className="page-loading-content">
        <div className="page-loading-spinner" />
        <p className="page-loading-text">위키 문서를 불러오는 중...</p>
      </div>
    </div>
  );
}
