import React, { useEffect } from "react";

/**
 * 공통 구글 애드센스 배너 컴포넌트
 * - 재사용성을 위해 분리
 * - 로컬 개발 환경이나 광고 차단기 환경에서 오류가 나지 않도록 try-catch 방어
 */
export default function AdBanner() {
    useEffect(() => {
        try {
            // 구글 애드센스 스크립트가 로드되었을 때만 광고를 푸시합니다.
            if (window && typeof window !== "undefined") {
                (window.adsbygoogle = window.adsbygoogle || []).push({});
            }
        } catch (error) {
            console.error("AdSense push error:", error);
        }
    }, []);

    return (
        <div className="ad-banner-container">
            {/* 
        주의: 로컬 환경에서는 광고가 보이지 않을 수 있습니다. 
        data-ad-client와 data-ad-slot은 발급받은 실제 값으로 변경하세요.
      */}
            <ins
                className="adsbygoogle"
                style={{ display: "block", minHeight: "100px", width: "100%" }}
                data-ad-client="ca-pub-XXXXXXXXXXXX"
                data-ad-slot="XXXXXXXXXX"
                data-ad-format="auto"
                data-full-width-responsive="true"
            ></ins>
        </div>
    );
}
