import {INK_PREVIEW_URLS} from "./inkPreviewUrls.js";
import normal1 from "./assets/ink-webp-20261109/ink_normal_1.webp?url";
import normal2 from "./assets/ink-webp-20261109/ink_normal_2.webp?url";
import normal3 from "./assets/ink-webp-20261109/ink_normal_3.webp?url";
import enhanced1 from "./assets/ink-webp-20261109/ink_boost_1.webp?url";
import enhanced2 from "./assets/ink-webp-20261109/ink_boost_2.webp?url";
import enhanced3 from "./assets/ink-webp-20261109/ink_boost_3.webp?url";
import weakened1 from "./assets/ink-webp-20261109/ink_weak_1.webp?url";
import weakened2 from "./assets/ink-webp-20261109/ink_weak_2.webp?url";
import weakened3 from "./assets/ink-webp-20261109/ink_weak_3.webp?url";

const slots=(tier,...urls)=>Object.freeze(urls.map((src,index)=>Object.freeze({
 kind:"image",src,artMode:"webp",previewSrc:INK_PREVIEW_URLS[tier][index],
})));
export const INK_WEBP_ART_MANIFEST=Object.freeze({
  normal: slots("normal", normal1, normal2, normal3),
  enhanced: slots("enhanced", enhanced1, enhanced2, enhanced3),
  weakened: slots("weakened", weakened1, weakened2, weakened3)
});
export function resolveInkWebpArt(tier,index){return INK_WEBP_ART_MANIFEST[tier]?.[index]??null;}
