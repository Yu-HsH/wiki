import React, { useEffect } from "react";

export default function AdBanner({
    adSlot = "YOUR_AD_SLOT_ID",
    style = { display: "block" },
    format = "auto",
    responsive = "true",
    className = "",
}) {
    useEffect(() => {
        try {
            if (typeof window !== "undefined" && window.adsbygoogle) {
                window.adsbygoogle.push({});
            }
        } catch (error) {
            console.error("AdSense render error:", error);
        }
    }, []);

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