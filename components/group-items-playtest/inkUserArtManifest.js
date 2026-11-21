import {INK_PREVIEW_URLS} from "./inkPreviewUrls.js";
import normal1 from "./assets/ink-user-20261108/ink_normal_1.png?url";
import normal2 from "./assets/ink-user-20261108/ink_normal_2.png?url";
import normal3 from "./assets/ink-user-20261108/ink_normal_3.png?url";
import enhanced1 from "./assets/ink-user-20261108/ink_boost_1.png?url";
import enhanced2 from "./assets/ink-user-20261108/ink_boost_2.png?url";
import enhanced3 from "./assets/ink-user-20261108/ink_boost_3.png?url";
import weakened1 from "./assets/ink-user-20261108/ink_weak_1.png?url";
import weakened2 from "./assets/ink-user-20261108/ink_weak_2.png?url";
import weakened3 from "./assets/ink-user-20261108/ink_weak_3.png?url";
/** Preserve the nine originals as the local comparison format. */
const slots=(tier,...urls)=>Object.freeze(urls.map((src,index)=>Object.freeze({
 kind:"image",src,artMode:"png",previewSrc:INK_PREVIEW_URLS[tier][index],
})));
export const INK_USER_ART_MANIFEST=Object.freeze({
 normal:slots("normal",normal1,normal2,normal3),
 enhanced:slots("enhanced",enhanced1,enhanced2,enhanced3),
 weakened:slots("weakened",weakened1,weakened2,weakened3),
});
export function resolveInkUserArt(tier,index){return INK_USER_ART_MANIFEST[tier]?.[index]??null;}
