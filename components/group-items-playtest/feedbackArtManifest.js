import normal1 from "./assets/attack-feedback/ink-normal-1.svg?url";
import normal2 from "./assets/attack-feedback/ink-normal-2.svg?url";
import normal3 from "./assets/attack-feedback/ink-normal-3.svg?url";
import enhanced1 from "./assets/attack-feedback/ink-enhanced-1.svg?url";
import enhanced2 from "./assets/attack-feedback/ink-enhanced-2.svg?url";
import enhanced3 from "./assets/attack-feedback/ink-enhanced-3.svg?url";
import weakened1 from "./assets/attack-feedback/ink-weakened-1.svg?url";
import weakened2 from "./assets/attack-feedback/ink-weakened-2.svg?url";
import weakened3 from "./assets/attack-feedback/ink-weakened-3.svg?url";
/** Trusted local authored candidate imports only; no remote/path input or final adoption. */
const candidate=src=>Object.freeze({kind:"image",src});
export const FEEDBACK_ART_CANDIDATES=Object.freeze({normal:Object.freeze([normal1,normal2,normal3].map(candidate)),enhanced:Object.freeze([enhanced1,enhanced2,enhanced3].map(candidate)),weakened:Object.freeze([weakened1,weakened2,weakened3].map(candidate))});
export function resolveFeedbackArt(tier,index){return Object.hasOwn(FEEDBACK_ART_CANDIDATES,tier)?FEEDBACK_ART_CANDIDATES[tier][index]??null:null;}
