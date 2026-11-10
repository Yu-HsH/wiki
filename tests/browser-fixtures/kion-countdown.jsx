import React, {useState} from "react";
import {createRoot} from "react-dom/client";
import KionCountdownCompanion from "../../components/KionCountdownCompanion.jsx";

function Stage({mode, stepIndex}) {
  return <article className="stage">
    <div className="count">{[3,2,1,"시작!"][stepIndex]}</div>
    <KionCountdownCompanion mode={mode} stepIndex={stepIndex} />
  </article>;
}
function App() {
  const [pressed, setPressed] = useState(0);
  return <main className="preview">
    <h1>키온 · 출발 카운트다운</h1>
    {["duel","group"].map((mode)=>
      <section key={mode} id={mode}><h2>{mode === "duel"?"1:1 대전":"그룹 레이스"}</h2>
        <div className="stages">{[0,1,2,3].map((step)=><Stage key={step} mode={mode} stepIndex={step}/>)}</div>
      </section>)}
    <section className="under"><button onClick={()=>setPressed((v)=>v+1)}>다른 동작 {pressed}</button></section>
    <div id="unsupported"><KionCountdownCompanion mode="single" stepIndex={0}/></div>
    <div id="recovered"><KionCountdownCompanion mode="duel" stepIndex={0} motionEligible={false}/></div>
  </main>;
}
createRoot(document.getElementById("root")).render(<App/>);