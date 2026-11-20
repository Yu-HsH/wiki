import React from 'react';
export const KION_POSES = Object.freeze(['idle', 'point', 'think', 'surprise', 'cheer', 'serious', 'wave']);
// Replace with approved per-pose transparent assets; concept boards are never cropped here.
export default function KionView({ actor = 'idle', assets = null }) {
  const pose = KION_POSES.includes(actor) ? actor : 'idle';
  return <span className="wr-tutorial-kion" data-pose={pose} aria-hidden="true">
    {assets?.[pose] ? <img src={assets[pose]} alt="" /> : <svg viewBox="0 0 110 104" focusable="false">
      <ellipse cx="55" cy="93" rx="35" ry="5" fill="#173b2f" opacity=".13" />
      <path d="M25 60Q15 94 48 93H72Q95 82 80 58" fill="#9abc87" stroke="#254e3a" strokeWidth="3" />
      <ellipse cx="55" cy="53" rx="35" ry="30" fill="#e5edc8" stroke="#254e3a" strokeWidth="3" />
      <path d="M16 34Q55 20 94 34L90 41Q55 33 20 42Z" fill="#cfb87b" stroke="#254e3a" strokeWidth="3" />
      <path d="M32 31L38 13Q56 3 74 14L80 31" fill="#dec994" stroke="#254e3a" strokeWidth="3" />
      <circle cx="42" cy="53" r="4" fill="#254e3a" /><circle cx="68" cy="53" r="4" fill="#254e3a" />
      <path d={pose === 'surprise' ? 'M51 67Q55 61 59 67Q55 74 51 67' : 'M47 65Q55 72 63 65'} fill="none" stroke="#254e3a" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M32 83L74 77L77 92L36 97Z" fill="#fff7db" stroke="#254e3a" strokeWidth="2" />
      <circle cx="81" cy="72" r="7" fill="#dbb752" stroke="#254e3a" strokeWidth="2" /><path d="M81 67L84 75L78 75Z" fill="#254e3a" />
    </svg>}
  </span>;
}
