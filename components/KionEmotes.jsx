import React, { useEffect, useId, useRef, useState } from "react";
import "./KionEmotes.css";

/** Shared sticker renderer. If a WebP is missing, never show a broken image. */
export function KionEmoteSticker({ preset, size = 36, className = "" }) {
  const source = preset?.image || "";
  const [failedSource, setFailedSource] = useState(null);
  return (
    <span className={"wr-kion-sticker " + className} style={{ "--wr-kion-size": size + "px" }}>
      {source && failedSource !== source
        ? <img src={source} alt="" draggable="false" loading="lazy" decoding="async" onError={() => setFailedSource(source)} />
        : <span className="wr-kion-sticker__fallback" aria-hidden="true">{preset?.emoji || "✨"}</span>}
    </span>
  );
}

/** Short-lived player reaction; text remains readable with images disabled. */
export function KionEmoteBubble({ preset, stale = false, className = "" }) {
  if (!preset) return null;
  return (
    <span className={"wr-kion-bubble " + className + (stale ? " is-stale" : "")} aria-label={"감정표현: " + preset.label}>
      <KionEmoteSticker preset={preset} size={30} />
      <span className="wr-kion-bubble__label">{preset.label}</span>
    </span>
  );
}

/** Accessible standalone picker for future lobby, race and result contexts. */
export function KionEmotePicker({ presets, onSend, disabled = false, label = "감정표현" }) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState("above");
  const root = useRef(null);
  const trigger = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onOutside = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    const onEscape = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const toggle = () => {
    // The compact spectator dock opens above, while a lobby picker near the top
    // of the viewport must open below rather than escape the screen.
    const top = trigger.current?.getBoundingClientRect().top ?? 0;
    setDirection(top < Math.min(window.innerHeight * 0.55, 420) ? "below" : "above");
    setOpen((wasOpen) => !wasOpen);
  };

  const selected = (preset) => {
    setOpen(false);
    onSend?.(preset.id);
    trigger.current?.focus();
  };

  return (
    <div className="wr-kion-picker" ref={root}>
      <button type="button" ref={trigger} className="wr-kion-picker__trigger" disabled={disabled}
        aria-haspopup="true" aria-expanded={open} aria-controls={open ? panelId : undefined}
        onClick={toggle}>
        🙂 {label} <span aria-hidden="true">{open ? "▾" : "▴"}</span>
      </button>
      {open && !disabled && (
        <div id={panelId} role="group" aria-label="키온 감정표현 선택" data-position={direction} className="wr-kion-picker__panel">
          <div className="wr-kion-picker__grid">
            {(presets || []).map((preset) => (
              <button type="button" key={preset.id} className="wr-kion-picker__option"
                aria-label={"감정표현 보내기: " + preset.label}
                onClick={() => selected(preset)}>
                <KionEmoteSticker preset={preset} size={48} />
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
