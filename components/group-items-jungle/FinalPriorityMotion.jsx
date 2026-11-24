import React, { useId } from 'react';
import './finalPriorityMotion.css';

// Layered artwork from the selected package's 02-original-five-locked preview.
// The product supplies an already settled event. The art never makes a gameplay decision.
function Parry({reflect}) {
  const prefix = useId();
  return <>
    <i className="s5-parry-vignette"/>
    <svg viewBox="0 0 600 360" className="s5-priority-art" focusable="false">
      <defs>
        <radialGradient id={prefix + "-paOcean"}>
          <stop stopColor="#074944" stopOpacity=".96"/>
          <stop offset=".52" stopColor="#146e71" stopOpacity=".73"/>
          <stop offset="1" stopColor="#0b4f61" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id={prefix + "-paMetal"} x1="0" x2="1" y1="0" y2="1">
          <stop stopColor="#e8ffcd"/>
          <stop offset=".28" stopColor="#9ffce0"/>
          <stop offset=".6" stopColor="#138f95"/>
          <stop offset="1" stopColor="#215e73"/>
        </linearGradient>
        <linearGradient id={prefix + "-paCore"} x1="0" x2="1" y1="0" y2="1">
          <stop stopColor="#0b525b"/>
          <stop offset=".6" stopColor="#0e8490"/>
          <stop offset="1" stopColor="#073a53"/>
        </linearGradient>
        <linearGradient id={prefix + "-paHeat"} x1="1" x2="0">
          <stop stopColor="#c62642" stopOpacity="0"/>
          <stop offset=".38" stopColor="#ff5b5d"/>
          <stop offset=".78" stopColor="#ffca6a"/>
          <stop offset="1" stopColor="#fff5bd"/>
        </linearGradient>
        <linearGradient id={prefix + "-paReturn"} x1="0" x2="1">
          <stop stopColor="#edfff0"/>
          <stop offset=".25" stopColor="#affff2"/>
          <stop offset=".65" stopColor="#31d4e2"/>
          <stop offset="1" stopColor="#209ab9" stopOpacity="0"/>
        </linearGradient>
        <radialGradient id={prefix + "-paHit"}>
          <stop stopColor="#ffffff"/>
          <stop offset=".25" stopColor="#fffbd1"/>
          <stop offset=".5" stopColor="#a8fff1"/>
          <stop offset="1" stopColor="#4ecabf" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <g className="s5-parry-back">
        <ellipse cx="304" cy="163" rx="185" ry="145" fill={`url(#${prefix}-paOcean)`}/>
      </g>
      <g className="s5-parry-ring-a" fill="none" strokeLinecap="round">
        <circle cx="304" cy="164" r="114" stroke="#3af6d8" strokeWidth="8" strokeDasharray="110 27 45 35" opacity=".84"/>
        <circle cx="304" cy="164" r="135" stroke="#9afee1" strokeWidth="2" strokeDasharray="12 19"/>
        <path d="M210 96Q304-24 401 103M196 229Q307 340 409 220" stroke="#c2fff2" strokeWidth="7" opacity=".8"/>
      </g>
      <g className="s5-parry-ring-b" fill="none" strokeLinecap="round">
        <circle cx="304" cy="164" r="90" stroke="#1aafb0" strokeWidth="11" strokeDasharray="90 15 40 27" opacity=".75"/>
        <path d="M254 65Q391 80 407 167M361 267Q220 256 199 155" stroke="#d8fff2" strokeWidth="5"/>
        <path d="M221 110q-45 39-41 88M389 236q43-38 31-92" stroke="#47ead5" strokeWidth="4"/>
      </g>
      <g className="s5-parry-attack">
        <path d="M553 146L388 146L373 164L385 180L553 180L507 162Z" fill={`url(#${prefix}-paHeat)`} opacity=".9"/>
        <path d="M579 131L397 154L365 164L397 173L579 196L528 167Z" fill="#ff653c" opacity=".55"/>
        <path d="M540 162L415 162L381 164L412 168L540 168" fill="#fff6d1" stroke="#ffc575" strokeWidth="4"/>
        <path d="M566 103L433 143M570 213L436 187M549 119L469 146" stroke="#ff8b5e" strokeWidth="5" strokeLinecap="round" opacity=".85"/>
      </g>
      <g className="s5-parry-shield">
        <path d="M305 70L378 96L372 191Q360 243 305 271Q250 244 239 191L231 97Z" fill="#073f56" stroke="#b6fff2" strokeWidth="13" strokeLinejoin="round"/>
        <path d="M305 83L362 103L355 184Q351 222 305 247Q264 225 255 181L249 105Z" fill={`url(#${prefix}-paCore)`} stroke="#6ceedd" strokeWidth="4"/>
        <path d="M305 91L331 104L324 201L305 239L293 214L299 103Z" fill={`url(#${prefix}-paMetal)`} opacity=".46"/>
        <path d="M305 135C293 112 278 119 279 134C260 123 266 156 296 167C276 184 291 196 307 179C326 197 339 182 319 167C345 155 348 129 330 135C332 121 318 113 305 135Z" fill="#e4fff1" stroke="#60d9ba" strokeWidth="3"/>
        <path d="M306 149L306 192" stroke="#52bf9f" strokeWidth="4" strokeLinecap="round"/>
        <path d="M262 120L305 101L348 120" stroke="#b6fff2" strokeWidth="3" fill="none" opacity=".7"/>
        <path d="M265 207Q304 238 344 206" stroke="#d9fff4" strokeWidth="4" fill="none" opacity=".65"/>
      </g>
      <g className="s5-parry-impact">
        <ellipse cx="386" cy="162" rx="80" ry="82" fill={`url(#${prefix}-paHit)`} opacity=".96"/>
        <path d="M384 35L401 127L463 63L418 142L533 105L427 158L536 178L422 176L486 251L402 193L385 299L366 196L304 268L344 177L259 171L350 157L300 79L373 139Z" fill="#fffbd6" opacity=".86"/>
        <path d="M374 102L394 147L428 116L411 157L459 160L412 174L436 213L398 188L378 242L376 189L339 217L361 178L321 158L368 153Z" fill="#ffffff"/>
      </g>
      <g className="s5-parry-shock" fill="none" stroke="#c3fff4">
        <circle cx="384" cy="164" r="67" strokeWidth="11" opacity=".85"/>
        <circle cx="384" cy="164" r="93" strokeWidth="3" opacity=".55"/>
      </g>
      <g className="s5-parry-sparks" strokeLinecap="round">
        <path d="M391 36L402 83M474 79L436 122M497 170L443 169M462 242L422 206M376 279L380 223M315 247L346 209M279 140L334 154M299 82L346 129" stroke="#ffefb2" strokeWidth="8"/>
        <path d="M429 46L433 78M514 121L478 143M500 218L466 197M419 269L403 238M338 274L354 240" stroke="#58fff1" strokeWidth="5"/>
        <path d="M447 92l11-17M323 52l-12-19M470 244l25 17M295 231l-22 24" stroke="#ff954e" strokeWidth="5"/>
      </g>
      {reflect && (
        <g className="s5-parry-counter" data-vfx-part="parry-counter">
          <path d="M374 149L577 120L541 145L598 163L535 177L579 206L374 176L398 161Z" fill={`url(#${prefix}-paReturn)`} opacity=".85"/>
          <path d="M378 158L598 163L387 174Z" fill="#fffce0"/>
          <path d="M398 144L555 88M416 185L559 238M433 137L513 119" fill="none" stroke="#79fff2" strokeWidth="9" strokeLinecap="round"/>
          <path d="M391 151L578 142M407 180L558 190" fill="none" stroke="#f4fff7" strokeWidth="4" strokeLinecap="round"/>
        </g>
      )}
      <g className="s5-parry-glints" fill="#bbffdf">
        <path d="M208 67l9 21 21 9-21 10-9 22-9-22-22-10 22-9Z"/>
        <path d="M432 62l6 13 14 6-14 6-6 14-6-14-14-6 14-6Z"/>
        <path d="M193 249l6 15 16 6-16 6-6 15-6-15-15-6 15-6Z"/>
        <circle cx="267" cy="50" r="5"/>
        <circle cx="473" cy="218" r="5"/>
      </g>
      <g className="s5-parry-mark">
        <path d="M277 96L302 117L330 83" fill="none" stroke="#e6fff2" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
      </g>
    </svg>
    <i className="s5-parry-flash"/>
  </>;
}

function Trap({open}) {
  const prefix = useId();
  return <svg viewBox="0 0 480 340" className="s5-priority-art" focusable="false">
      <defs>
        <radialGradient id={prefix + "-jackBlast"}>
          <stop stopColor="#fff7bd"/>
          <stop offset=".32" stopColor="#ffdb4d" stopOpacity=".93"/>
          <stop offset=".73" stopColor="#f47452" stopOpacity=".55"/>
          <stop offset="1" stopColor="#f47452" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id={prefix + "-jackWood"} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#ffdc87"/>
          <stop offset=".4" stopColor="#c77c45"/>
          <stop offset="1" stopColor="#88503b"/>
        </linearGradient>
        <linearGradient id={prefix + "-jackFace"} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fffdf0"/>
          <stop offset="1" stopColor="#dddcf0"/>
        </linearGradient>
        <linearGradient id={prefix + "-jackPurple"} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#bb74e9"/>
          <stop offset="1" stopColor="#6237b7"/>
        </linearGradient>
        <linearGradient id={prefix + "-jackRed"} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#ff816d"/>
          <stop offset="1" stopColor="#d63a51"/>
        </linearGradient>
      </defs>
      {open && (
        <g className="s5-jack-flash">
          <ellipse cx="240" cy="180" rx="210" ry="150" fill={`url(#${prefix}-jackBlast)`}/>
          <g stroke="#ffe46b" strokeWidth="7" strokeLinecap="round">
            <path d="M240 8v55M240 287v37M40 178l64 0M380 178h64M90 50l47 42M370 50l-47 42M87 294l50-50M386 292l-54-50"/>
          </g>
        </g>
      )}
      {open && (
        <g className="s5-jack-impact" data-vfx-part="jack-impact">
          <path d="M230 24L255 86 290 23 296 95 373 47 340 121 446 97 371 160 450 192 351 203 412 284 314 244 297 321 258 254 211 330 185 256 110 312 143 228 38 248 111 187 25 142 135 132 94 55 188 101Z" fill="#fbd34d" stroke="#fff6cf" strokeWidth="7" strokeLinejoin="round" opacity=".75"/>
        </g>
      )}
      {open && (
        <g className="s5-jack-stars" fill="#fff4a6">
          <path d="M87 115l9 21 22 9-22 9-9 20-9-20-22-9 22-9Z"/>
          <path d="M393 93l8 17 18 8-18 8-8 17-9-17-18-8 18-8Z"/>
          <path d="M390 233l7 14 14 7-14 7-7 14-7-14-14-7 14-7Z"/>
        </g>
      )}
      <ellipse cx="242" cy="307" rx="127" ry="20" fill="#4a3026" opacity=".3"/>
      {open && (
        <g className="s5-jack-spring" stroke="#765364" strokeWidth="11" strokeLinejoin="round" strokeLinecap="round" fill="none" data-vfx-part="jack-spring">
          <path d="M238 256C178 249 292 239 238 226S184 207 238 197S292 178 238 168S184 149 238 137"/>
          <path d="M238 256C178 249 292 239 238 226S184 207 238 197S292 178 238 168S184 149 238 137" stroke="#c5c3e1" strokeWidth="6"/>
        </g>
      )}
      {open && (
        <g className="s5-jack-clown" data-vfx-part="jack-clown">
          <path d="M175 176Q143 175 117 153M306 176Q340 175 363 151" stroke="#9a4e76" strokeWidth="13" strokeLinecap="round" fill="none"/>
          <g stroke="#85516b" strokeWidth="3" fill="#fff9eb">
            <path d="M118 150q-23-12-23-27q4-8 13 4q-7-20 2-21q7 0 11 19q0-20 9-17q8 4 1 22q20-11 21-2q2 12-34 22Z"/>
            <path d="M365 148q24-11 24-24q-4-11-13 3q7-20-2-21q-8 0-11 18q0-20-9-17q-8 4-1 22q-20-10-21-1q-3 12 33 20Z"/>
          </g>
          <path d="M188 180L172 188 195 203 196 220 219 207 238 224 258 206 281 219 285 200 306 185 287 179Z" fill="#eb548a" stroke="#9b3967" strokeWidth="4"/>
          <path d="M189 180L185 191 212 199 224 210 243 194 261 209 274 193 299 185" stroke="#ffd0df" strokeWidth="5" fill="none"/>
          <circle cx="159" cy="137" r="20" fill="#ff9aac" stroke="#9b3967" strokeWidth="4"/>
          <circle cx="320" cy="137" r="20" fill="#ff9aac" stroke="#9b3967" strokeWidth="4"/>
          <ellipse cx="240" cy="135" rx="89" ry="80" fill={`url(#${prefix}-jackFace)`} stroke="#68526d" strokeWidth="6"/>
          <ellipse cx="193" cy="155" rx="17" ry="11" fill="#ffa6bd" opacity=".9"/>
          <ellipse cx="288" cy="155" rx="17" ry="11" fill="#ffa6bd" opacity=".9"/>
          <path d="M164 96Q118 36 135 20Q163 34 205 69Q237 13 260 17Q278 45 277 69Q338 35 355 49Q355 76 321 102Z" fill={`url(#${prefix}-jackPurple)`} stroke="#5b3f7c" strokeWidth="6" strokeLinejoin="round"/>
          <path d="M164 96Q118 36 135 20Q163 34 205 69L205 91Z" fill={`url(#${prefix}-jackRed)`}/>
          <path d="M260 17Q278 45 277 69L259 86L218 82Z" fill="#f8bd4d"/>
          <circle cx="133" cy="20" r="13" fill="#ffd25c" stroke="#9e6534" strokeWidth="4"/>
          <circle cx="258" cy="15" r="13" fill="#ffd25c" stroke="#9e6534" strokeWidth="4"/>
          <circle cx="356" cy="48" r="13" fill="#ffd25c" stroke="#9e6534" strokeWidth="4"/>
          <path d="M183 116Q201 91 216 119M266 120Q282 92 299 114" stroke="#46384e" strokeWidth="7" fill="none" strokeLinecap="round"/>
          <ellipse cx="204" cy="127" rx="9" ry="14" fill="#342d43"/>
          <ellipse cx="280" cy="127" rx="9" ry="14" fill="#342d43"/>
          <circle cx="201" cy="123" r="3" fill="white"/>
          <circle cx="277" cy="123" r="3" fill="white"/>
          <path d="M178 124l-13-7M303 124l13-7" stroke="#9c59c1" strokeWidth="4" strokeLinecap="round"/>
          <circle cx="242" cy="144" r="16" fill="#e54854" stroke="#fff1d6" strokeWidth="4"/>
          <ellipse cx="237" cy="140" rx="5" ry="4" fill="#ffbcc1"/>
          <path d="M198 169Q240 202 285 165Q282 219 240 222Q205 218 198 169Z" fill="#672d50" stroke="#852e4e" strokeWidth="4"/>
          <path d="M202 175Q242 195 282 174" stroke="#fff9d9" strokeWidth="7" fill="none" strokeLinecap="round"/>
          <path d="M226 210Q236 194 253 214" stroke="#f47d9a" strokeWidth="10" fill="none" strokeLinecap="round"/>
        </g>
      )}
      <g className="s5-jack-chest" data-vfx-part="jack-chest">
        <path d="M151 231L239 247 328 231 319 306 240 320 162 306Z" fill={`url(#${prefix}-jackWood)`} stroke="#694534" strokeWidth="7" strokeLinejoin="round"/>
        <path d="M151 231L240 247 240 320 162 306Z" fill="#c3844c" opacity=".8"/>
        <path d="M240 247L328 231 319 306 240 320Z" fill="#8b573d" opacity=".65"/>
        <path d="M155 234L239 248 327 234" stroke="#ffe6a2" strokeWidth="6" fill="none"/>
        <path d="M232 252h16v61h-16Z" fill="#f5c85d"/>
        <path d="M166 269l44 10M266 279l45-10" stroke="#eab771" strokeWidth="5"/>
        <path d="M240 258l8 13 15 2-11 11 2 15-14-7-14 7 2-15-11-11 15-2Z" fill="#ffe389" stroke="#9a5f38" strokeWidth="3"/>
      </g>
      <g className="s5-jack-lid" data-vfx-part="jack-lid">
        <path d="M142 217L239 234 340 218 328 196 240 178 156 196Z" fill="#d99750" stroke="#644532" strokeWidth="7" strokeLinejoin="round"/>
        <path d="M156 196L240 178 328 196 240 213Z" fill="#f5c77e" stroke="#644532" strokeWidth="5"/>
        <path d="M240 178v36" stroke="#a16b45" strokeWidth="5"/>
        <path d="M167 196l-8 18M314 193l10 20" stroke="#f8e0a1" strokeWidth="6"/>
      </g>
      {open && (
        <g className="s5-jack-confetti">
          <path d="M81 86l22 18-13 11-15-22ZM389 43l17 21-16 6-10-19ZM75 221l19-6 8 17-20 8ZM398 230l17-14 8 20-16 7Z" fill="#ef6b70"/>
          <circle cx="130" cy="55" r="7" fill="#ffe08f"/>
          <circle cx="381" cy="173" r="8" fill="#b28ff0"/>
          <path d="M329 45l-14 20M145 265l-9 16" stroke="#49c6ae" strokeWidth="8"/>
        </g>
      )}
  </svg>;
}

function Shield({impact}) {
  return <>
    {impact && <i className="s5-shield-attack"/>}
    <svg viewBox="0 0 240 210" className="s5-priority-art" focusable="false">
      <g className="s5-shield-crest" data-vfx-part="shield-crest" strokeLinejoin="round">
        <path d="M120 17L204 45 193 132Q178 171 120 196Q62 171 47 132L36 45Z"
          fill="#24867e" fillOpacity=".82" stroke="#b7f4d9" strokeWidth="8"/>
        <path d="M120 32L188 55 179 126Q166 157 120 179Q74 157 61 126L52 55Z"
          fill="#54caba" fillOpacity=".48" stroke="#a0e8cf" strokeWidth="3"/>
        <path d="M89 100L112 125 153 78" fill="none" stroke="#ecfff3" strokeWidth="12" strokeLinecap="round"/>
      </g>
      <g className="s5-shield-leaves" fill="#b0eed4">
        <path d="M34 80Q8 67 13 46Q37 50 34 80ZM206 79Q232 67 229 46Q204 50 206 79Z"/>
        <path d="M57 164Q34 172 28 151Q44 145 57 164ZM183 164Q206 172 212 151Q196 145 183 164Z"/>
        <circle cx="45" cy="32" r="4"/><circle cx="195" cy="30" r="5"/>
      </g>
      {impact && <circle className="s5-shield-shock" data-vfx-part="shield-impact"
        cx="120" cy="98" r="63" fill="none" stroke="#c8ffeb" strokeWidth="8"/>}
    </svg>
  </>;
}

function Correction({success}) {
  return <div className="s5-correction-scene">
    <i className="s5-correction-sweep" data-vfx-part="correction-sweep"/>
    {success ? <svg viewBox="0 0 96 76" className="s5-correction-mark" data-vfx-part="correction-clean"
      focusable="false">
      <path d="M18 39L38 57 74 20" fill="none" stroke="#eafff5" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M20 8l4 10 10 4-10 4-4 10-4-10-10-4 10-4ZM76 48l3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill="#a8ffee"/>
    </svg> : <span className="s5-correction-failed" data-vfx-part="correction-miss">×</span>}
  </div>;
}

function PriorityScene({kind}) {
  switch (kind) {
    case 'parry-reflect': return <Parry reflect/>;
    case 'parry-block': return <Parry reflect={false}/>;
    case 'trap-install': return <Trap open={false}/>;
    case 'trap-reveal':
    case 'trap-hit': return <Trap open/>;
    case 'shield':
    case 'shield-activate': return <Shield impact={false}/>;
    case 'shield-block': return <Shield impact/>;
    case 'correction': return <Correction success/>;
    case 'correction-fail': return <Correction success={false}/>;
    case 'censor':
    case 'censor-release': return <i className="s5-censor-confirmation"/>;
    default: return null;
  }
}

const priorityKinds = new Set([
  'parry-reflect', 'parry-block', 'trap-install', 'trap-reveal', 'trap-hit',
  'shield', 'shield-activate', 'shield-block', 'correction', 'correction-fail', 'censor', 'censor-release',
]);

export function FinalPriorityMotion({scene, shieldActive = false}) {
  const kind = scene?.kind;
  const showScene = priorityKinds.has(kind);
  if (!showScene && !shieldActive) return null;
  return <>
    {shieldActive && <i className="s5-shield-active-rim" data-item-vfx="shield-active" aria-hidden="true"/>}
    {showScene && <div key={scene.key} className="s5-final-priority" data-item-vfx={kind} aria-hidden="true">
      <PriorityScene kind={kind}/>
    </div>}
  </>;
}
