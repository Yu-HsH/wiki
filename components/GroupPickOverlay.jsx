import React, { useEffect, useMemo, useState } from "react";

export default function GroupPickOverlay({
    candidates = [],
    startTitle,
    targetTitle,
    onComplete,
}) {
    const safeCandidates = useMemo(() => {
        const unique = [...new Set(candidates.filter(Boolean))];
        return unique.length > 0 ? unique : ["???"];
    }, [candidates]);

    const [tick, setTick] = useState(0);
    const [step, setStep] = useState("rolling-start");

    useEffect(() => {
        const interval = setInterval(() => {
            setTick((prev) => prev + 1);
        }, 80);

        const t1 = setTimeout(() => {
            setStep("fixed-start");
        }, 1800);

        const t2 = setTimeout(() => {
            setStep("rolling-target");
        }, 2600);

        const t3 = setTimeout(() => {
            setStep("fixed-target");
        }, 4400);

        const t4 = setTimeout(() => {
            onComplete?.();
        }, 5400);

        return () => {
            clearInterval(interval);
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
            clearTimeout(t4);
        };
    }, [onComplete]);

    const rollingTitle = safeCandidates[tick % safeCandidates.length];

    const shownStart =
        step === "rolling-start" ? rollingTitle : startTitle || "시작 문서";

    const shownTarget =
        step === "rolling-target" ? rollingTitle : targetTitle || "목표 문서";

    return (
        <div className="group-pick-overlay">
            <div className="group-pick-card">
                <div className="group-pick-badge">GROUP MODE</div>
                <h2>랜덤 문서 선택 중...</h2>

                <div className="group-pick-slots">
                    <div className={`group-pick-slot ${step.includes("start") ? "active" : ""}`}>
                        <span>시작 문서</span>
                        <strong>{shownStart}</strong>
                    </div>

                    <div className={`group-pick-slot ${step.includes("target") ? "active" : ""}`}>
                        <span>목표 문서</span>
                        <strong>{shownTarget}</strong>
                    </div>
                </div>

                <p className="group-pick-desc">
                    참가자들이 제출한 문서 중에서 이번 라운드의 시작과 목표가 정해집니다.
                </p>
            </div>
        </div>
    );

}

