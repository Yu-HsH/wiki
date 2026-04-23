import React from "react";

export default function EffectOverlay({
    blindActive = false,
    floatingMessage = "",
    immune = false,
}) {
    return (
        <>
            {blindActive && <div className="effect-overlay effect-overlay--blind" />}

            {(floatingMessage || immune) && (
                <div className="effect-badge-group">
                    {immune && <div className="effect-badge">면역</div>}
                    {floatingMessage && <div className="effect-badge">{floatingMessage}</div>}
                </div>
            )}
        </>
    );
}