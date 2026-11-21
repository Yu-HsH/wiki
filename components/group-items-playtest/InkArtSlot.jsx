import React,{useEffect,useRef,useState} from "react";
/** A decoded full image replaces the inline silhouette within the same impact slot. */
export default function InkArtSlot({asset,index,animate=false,reduced=false,hidden=false,staticFallback=false,impactEventId}){
 const [liveMount]=useState(()=>animate&&!reduced),[endedAsset,setEndedAsset]=useState(null);
 const assetKey=asset?[asset.kind,asset.src,asset.poster].join(":"):"none";
 useEffect(()=>{if(reduced)setEndedAsset(assetKey);},[reduced,assetKey]);
 const video=asset?.kind==="video"&&liveMount&&!reduced&&endedAsset!==assetKey,key=assetKey+":"+video;
 const [loadedKey,setLoadedKey]=useState(null),[failedKey,setFailedKey]=useState(null);
 const pending=asset&&failedKey!==key,shown=pending&&loadedKey===key;
 const currentKey=useRef(key);currentKey.current=key;
 const loaded=event=>{const node=event.currentTarget;Promise.resolve(node.decode?.()).then(()=>{if(currentKey.current===key&&node.isConnected)setLoadedKey(key);}).catch(()=>{if(currentKey.current===key)setFailedKey(key);});},failed=()=>setFailedKey(key);
 const hasPreview=Boolean(asset?.previewSrc);
 const mediaStatus=shown?"ready":failedKey===key?"error":asset?"pending":"fallback";
 return <div className={"gip-ink-splash"+(animate&&!reduced&&(hasPreview||!staticFallback||shown)?" is-new":"")+(shown?" has-art":"")} data-index={index+1} data-art-mode={asset?.artMode||"legacy"} data-media-ready={shown?"true":"false"} data-media-status={mediaStatus} data-art={shown?asset.kind:hasPreview?"preview":"fallback"} data-impact-event-id={impactEventId} data-visual-hidden={hidden?"true":"false"}>
  {hasPreview&&<span className="gip-ink-preview" style={{backgroundImage:'url("'+asset.previewSrc+'")'}} aria-hidden="true"/>}
  {pending&&(video?<video key={key} src={asset.src} poster={asset.poster} muted playsInline autoPlay onLoadedData={event=>{loaded(event);Promise.resolve(event.currentTarget.play()).catch(failed);}} onEnded={()=>setEndedAsset(assetKey)} onError={()=>setEndedAsset(assetKey)} aria-hidden="true"/>:<img key={key} src={asset.kind==="video"?asset.poster:asset.src} onLoad={loaded} onError={failed} alt="" draggable="false"/>)}
 </div>;
}
