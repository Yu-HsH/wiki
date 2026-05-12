import React, { useEffect, useRef } from "react";

const AD_CLIENT = "ca-pub-6320749220035323";
const AD_SCRIPT_ID = "adsense-script";

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
        if (typeof window === "undefined") return;

        let cancelled = false;

        const pushAd = () => {
            if (cancelled || pushedRef.current) return;

            try {
                window.adsbygoogle = window.adsbygoogle || [];
                if (adRef.current && !adRef.current.dataset.adsbygoogleStatus) {
                    window.adsbygoogle.push({});
                    pushedRef.current = true;
                }
            } catch (error) {
                console.error("AdSense render error:", error);
            }
        };

        const existingScript = document.getElementById(AD_SCRIPT_ID);
        if (existingScript) {
            if (existingScript.dataset.loaded === "true") {
                pushAd();
            } else {
                existingScript.addEventListener("load", pushAd, { once: true });
            }
            return () => {
                cancelled = true;
                existingScript.removeEventListener("load", pushAd);
            };
        }

        const script = document.createElement("script");
        script.id = AD_SCRIPT_ID;
        script.async = true;
        script.crossOrigin = "anonymous";
        script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CLIENT}`;
        script.addEventListener("load", () => {
            script.dataset.loaded = "true";
            pushAd();
        });
        document.head.appendChild(script);

        return () => {
            cancelled = true;
        };
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
                data-ad-client={AD_CLIENT}
                data-ad-slot={adSlot}
                data-ad-format={format}
                data-full-width-responsive={responsive}
            />
        </div>
    );
}
