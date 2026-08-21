import React from "react";

/**
 * 점검 화면 — 외부 의존이 없어야 한다.
 *
 * React 외의 import를 추가하지 않는다. css/ 파일을 import 하면 Vite가 진입 청크에
 * 스타일시트를 붙이고, 점검 중에도 그 파일을 받아오는 요청이 생긴다. 그래서 인라인 스타일만 쓴다.
 * 폰트·이미지·네트워크 호출도 넣지 않는다.
 */

const pageStyle = {
  minHeight: "100vh",
  margin: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  boxSizing: "border-box",
  background: "#0f172a",
  color: "#e2e8f0",
  fontFamily:
    "system-ui, -apple-system, 'Segoe UI', 'Malgun Gothic', sans-serif",
  lineHeight: 1.6,
};

const cardStyle = {
  width: "100%",
  maxWidth: "480px",
  textAlign: "center",
  border: "1px solid #33415580",
  borderRadius: "16px",
  padding: "32px 24px",
  background: "#1e293b",
};

const titleStyle = {
  margin: "0 0 12px",
  fontSize: "1.5rem",
  fontWeight: 700,
};

const bodyStyle = {
  margin: "0 0 8px",
  fontSize: "1rem",
};

const noteStyle = {
  margin: "16px 0 0",
  fontSize: "0.875rem",
  color: "#94a3b8",
};

export default function MaintenanceScreen() {
  return (
    <main style={pageStyle}>
      <section style={cardStyle} role="status" aria-live="polite">
        <h1 style={titleStyle}>서비스 점검 중입니다</h1>
        <p style={bodyStyle}>
          데이터베이스 업데이트를 위해 위키 레이스를 일시적으로 중단했습니다.
        </p>
        <p style={bodyStyle}>
          점검은 <strong>약 1~2시간</strong> 소요될 예정이며, 완료되면 별도 조치 없이
          다시 이용할 수 있습니다.
        </p>
        <p style={noteStyle}>
          점검 중에는 게임 진행과 기록 저장이 되지 않습니다. 잠시 후 새로고침해 주세요.
        </p>
      </section>
    </main>
  );
}
