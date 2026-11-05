import React, { memo, useEffect, useId, useState } from "react";
import { junglePropAssets } from "./junglePropAssets.js";

const tileUrl = file => "/assets/wiki-race/jungle65/layers/" + file;
const sizes = { landing: "1672 941", home: "1535 436" };
const tilesFor = prop => [prop.patch, prop.sprite, ...(prop.flame ? [prop.flame] : [])];

function Tile({ tile, onError }) {
  const [x, y, width, height] = tile.box;
  return <image href={tileUrl(tile.file)} x={x} y={y} width={width} height={height}
    onError={onError} />;
}

function MovingProp({ prop, onError }) {
  const chamber = useId();
  const style = {
    transformOrigin: prop.pivot.map(n => n + "px").join(" "),
    "--wr-prop-period": prop.period + "ms",
    "--wr-prop-phase": prop.phase + "ms",
    "--wr-prop-start": prop.idle[0],
    "--wr-prop-end": prop.idle[1],
  };
  return <g className="wr65-prop-idle" data-jungle-prop={prop.id} style={style}>
    <g className="wr65-prop-reply" style={{ transformOrigin: style.transformOrigin }}>
      <Tile tile={prop.sprite} onError={onError} />
      {prop.flame && <>
        <clipPath id={chamber}><path d={prop.glassPath} /></clipPath>
        <g clipPath={"url(#" + chamber + ")"}>
          <g className="wr65-prop-flame" style={{ transformOrigin: prop.flamePivot.map(n => n + "px").join(" ") }}>
            <Tile tile={prop.flame} onError={onError} />
          </g>
        </g>
      </>}
    </g>
  </g>;
}

// Mount the repairs and their sprites together, after every tile is decoded.
// The original artwork stays underneath and covers failed or missing tiles.
export default memo(function JunglePropLayers({ scene }) {
  const [ready, setReady] = useState(false);
  const props = junglePropAssets[scene];
  useEffect(() => {
    let mounted = true;
    Promise.all(props.flatMap(tilesFor).map(async tile => {
      const img = new Image();
      img.src = tileUrl(tile.file);
      await img.decode();
    })).then(() => { if (mounted) setReady(true); }, () => {});
    return () => { mounted = false; };
  }, [props]);

  if (!ready) return null;
  const fallback = () => setReady(false);
  return <svg className="wr65-prop-layers" viewBox={"0 0 " + sizes[scene]} aria-hidden="true" focusable="false">
    {props.map(prop => <Tile key={prop.id} tile={prop.patch} onError={fallback} />)}
    {props.map(prop => <MovingProp key={prop.id} prop={prop} onError={fallback} />)}
  </svg>;
});

export function reactJungleProp(scene, id, event) {
  if (document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const stage = event.currentTarget.parentElement;
  if (stage.querySelector(".wr65-atmosphere.is-paused")) return;
  const layer = stage.querySelector(`[data-jungle-prop="${id}"] .wr65-prop-reply`);
  if (!layer?.animate) return;
  const prop = junglePropAssets[scene].find(candidate => candidate.id === id);
  const start = getComputedStyle(layer).transform;
  layer.getAnimations().forEach(animation => animation.cancel());
  const reaction = layer.animate([
    { transform: start, easing: "cubic-bezier(.17,.74,.26,1)" },
    { transform: prop.click[0], offset: .27, easing: "ease-in-out" },
    { transform: prop.click[1], offset: .64, easing: "ease-out" },
    { transform: "none" },
  ], { duration: prop.press, fill: "none" });
  reaction.id = "wr65-scene-pulse";
}
