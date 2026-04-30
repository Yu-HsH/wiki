import React, { useEffect, useRef } from "react";

export default function AdBanner({
    adSlot,
    style = { display: "block" },
    format = "auto",
    responsive = "true",
    className = "",
}) {
    const adRef = useRef(null);
    const pushedRef = useRef(false);

    useEffect(() => {
        if (!adSlot || adSlot === "YOUR_AD_SLOT_ID") return;
        if (pushedRef.current) return;

        try {
            if (
                typeof window !== "undefined" &&
                window.adsbygoogle &&
                adRef.current &&
                !adRef.current.dataset.adsbygoogleStatus
            ) {
                window.adsbygoogle.push({});
                pushedRef.current = true;
            }
        } catch (error) {
            console.error("AdSense render error:", error);
        }
    }, [adSlot]);

    if (!adSlot || adSlot === "YOUR_AD_SLOT_ID") {
        return null;
    }

    return (
        <div
            className={className}
            style={{
                width: "100%",
                textAlign: "center",
                margin: "16px 0",
            }}
        >
            <ins
                ref={adRef}
                className="adsbygoogle"
                style={style}
                data-ad-client="ca-pub-6320749220035323"
                data-ad-slot={adSlot}
                data-ad-format={format}
                data-full-width-responsive={responsive}
            />
        </div>
    );
}