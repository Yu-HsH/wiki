// 이 파일은 JSX를 쓴다. vite.config.js가 없어 esbuild 기본값인 classic 변환이
// 적용되므로 JSX는 React.createElement로 컴파일된다 — React가 스코프에 있어야 한다.
import React, { useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";

/**
 * 진행 중인 게임에서 라우트 이동을 명시적인 이탈 절차로 통일한다.
 *
 * 브라우저의 새로고침/탭 닫기는 서버 heartbeat와 F5 복구가 담당하므로
 * 이 컴포넌트는 앱 내부 이동(뒤로가기, 로비 버튼 등)만 처리한다.
 */
export function useExitGuard({ enabled, onConfirm }) {
  const bypassRef = useRef(false);
  const blocker = useBlocker(() => enabled && !bypassRef.current);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (blocker.state === "blocked") setIsOpen(true);
  }, [blocker.state]);

  const close = () => {
    setIsOpen(false);
    if (blocker.state === "blocked") blocker.reset();
  };

  const confirm = async () => {
    setIsOpen(false);
    bypassRef.current = true;
    try {
      await onConfirm?.();
      if (blocker.state === "blocked") blocker.proceed();
    } finally {
      // proceed()가 완료되면 컴포넌트가 사라지지만, 네비게이션 실패에도
      // 다음 이탈 시 guard가 다시 작동하도록 원복한다.
      bypassRef.current = false;
    }
  };

  const requestExit = () => setIsOpen(true);

  const dialog = isOpen ? (
    <div className="app-modal-backdrop" role="presentation">
      <section
        className="app-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-guard-title"
      >
        <h2 id="exit-guard-title">게임을 나갈까요?</h2>
        <p>지금 나가면 현재 경기에서 이탈 처리됩니다. F5 복구와 다른 상태입니다.</p>
        <div className="app-modal-actions">
          <button type="button" className="app-btn app-btn-ghost" onClick={close}>
            계속하기
          </button>
          <button type="button" className="app-btn app-btn-danger" onClick={confirm}>
            이탈하기
          </button>
        </div>
      </section>
    </div>
  ) : null;

  return { requestExit, dialog };
}
