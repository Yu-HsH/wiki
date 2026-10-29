import React, { useEffect, useRef, useState } from "react";
import StartCourse from "./StartCourse.jsx";
import useSceneSequence from "../hooks/useSceneSequence.js";
import { audioManager } from '../services/audioManager.js';

const STEPS = [3, 2, 1, "시작!"];

export default function CountdownOverlay({ onComplete, startTitle, targetTitle, sceneKey = null, mode = "", motionEligible = true }) {
  const sequence = useSceneSequence(sceneKey && `scene:start:${mode}:${sceneKey}`, { eligible: motionEligible, confirmed: Boolean(startTitle && targetTitle) });
  const [stepIndex, setStepIndex] = useState(0);
  const onCompleteRef = useRef(onComplete);
  const freshSound = useRef(motionEligible && !document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const stop = () => { freshSound.current = false; audioManager.stopEffects(); };
    const hidden = () => { if (document.hidden) stop(); };
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    document.addEventListener('visibilitychange', hidden); media.addEventListener('change', stop);
    return () => { document.removeEventListener('visibilitychange', hidden); media.removeEventListener('change', stop); };
  }, []);
  useEffect(() => {
    if (sceneKey && stepIndex < STEPS.length && freshSound.current) {
      void audioManager.play(stepIndex === 3 ? 'go' : 'tick', { key: `count:${mode}:${sceneKey}:${stepIndex}` });
    }
  }, [sceneKey, mode, stepIndex]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (stepIndex >= STEPS.length) {
      onCompleteRef.current?.();
      return;
    }

    const delay = stepIndex === STEPS.length - 1 ? 500 : 700;
    const timer = setTimeout(() => {
      setStepIndex((prev) => prev + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [stepIndex]);

  if (stepIndex >= STEPS.length) return null;

  return (
    <div className="countdown-overlay wr-page wr-start-overlay" aria-live="assertive" aria-atomic="true">
      <div className={`countdown-journal${startTitle && targetTitle ? " has-course" : ""}${sequence ? " is-start-sequence" : ""}`}>
      <span className="wr-start-kicker">탐험 출발 준비</span>
      {(startTitle || targetTitle) && <StartCourse startTitle={startTitle} targetTitle={targetTitle} />}
      <div className="countdown-number" key={stepIndex}>
        {STEPS[stepIndex]}
      </div>
      <span className="countdown-note">본문 링크를 따라 목표 문서로</span>
      </div>
    </div>
  );
}
