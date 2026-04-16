import React, { useEffect, useState } from "react";

const STEPS = [3, 2, 1, "시작!"];

export default function CountdownOverlay({ onComplete }) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (stepIndex >= STEPS.length) {
      onComplete();
      return;
    }

    const delay = stepIndex === STEPS.length - 1 ? 500 : 700;
    const timer = setTimeout(() => {
      setStepIndex((prev) => prev + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [stepIndex, onComplete]);

  if (stepIndex >= STEPS.length) return null;

  return (
    <div className="countdown-overlay" aria-live="assertive" aria-atomic="true">
      <div className="countdown-number" key={stepIndex}>
        {STEPS[stepIndex]}
      </div>
    </div>
  );
}
