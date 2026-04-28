import React from "react";

export default function EffectOverlay({ blindActive, floatingMessage, immune }) {
    return (
        <>
            {blindActive && (
                <div className="ink-overlay">
                    <div className="ink-splat splat-1" />
                    <div className="ink-splat splat-2" />
                    <div className="ink-splat splat-3" />
                    <div className="ink-splat splat-4" />
                    <div className="ink-splat splat-5" />
                </div>
            )}

            {floatingMessage && (
                <div className="floating-message">
                    {floatingMessage}
                </div>
            )}

            {immune && (
                <div className="immune-badge">
                    방어 중
                </div>
            )}
        </>
    );
}
