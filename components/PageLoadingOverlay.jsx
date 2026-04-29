import React from "react";

/**
 * 페이지 이동 시 화면 전체를 덮는 로딩 오버레이
 */
export default function PageLoadingOverlay() {
    return (
        <div style={overlayStyle}>
            <div style={containerStyle}>
                <div className="page-loading-spinner" style={spinnerStyle} />
                <p style={textStyle}>문서 불러오는 중...</p>
            </div>
            <style>{`
        @keyframes pageSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .page-loading-spinner {
          animation: pageSpin 1s linear infinite;
        }
      `}</style>
        </div>
    );
}

const overlayStyle = {
    position: "fixed",
    inset: 0,
    zIndex: 3000, // 최상단 배치
    background: "rgba(255, 255, 255, 0.7)",
    backdropFilter: "blur(4px)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
};

const containerStyle = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "16px",
};

const spinnerStyle = {
    width: "48px",
    height: "48px",
    border: "4px solid rgba(0, 164, 149, 0.1)",
    borderTop: "4px solid #00a495",
    borderRadius: "50%",
};

const textStyle = {
    fontSize: "16px",
    fontWeight: "600",
    color: "#007d73",
    margin: 0,
};
