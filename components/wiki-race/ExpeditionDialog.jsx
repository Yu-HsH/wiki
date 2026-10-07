import React, { useEffect, useRef } from "react";

export default function ExpeditionDialog({ className, titleId, onClose, children }) {
  const panel = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const node = panel.current;
    const focusable = () => [...node.querySelectorAll('button:not(:disabled), input, a[href], [tabindex="0"]')];
    (focusable()[0] || node).focus();
    const onKey = (event) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) { event.preventDefault(); node.focus(); return; }
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    node.addEventListener("keydown", onKey);
    return () => { node.removeEventListener("keydown", onKey); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div ref={panel} className={className} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onClick={e => e.stopPropagation()}>{children}</div>;
}
