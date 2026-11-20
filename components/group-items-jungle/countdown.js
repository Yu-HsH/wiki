export function remainingTime(lifecycle,serverNow,elapsedMs=0){
 const deadline=Date.parse(lifecycle?.deadline_at),grace=Date.parse(lifecycle?.grace_ends_at);
 const end=Math.min(deadline,Number.isFinite(grace)?grace:Infinity);
 if(!Number.isFinite(end)||!Number.isFinite(serverNow)||!Number.isFinite(elapsedMs))return null;
 return{end,seconds:Math.max(0,Math.ceil((end-serverNow-Math.max(0,elapsedMs))/1000)),grace:Number.isFinite(grace)};
}
