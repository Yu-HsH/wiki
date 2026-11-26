import React from 'react';
import { useTutorial } from './TutorialProvider.jsx';

export default function GuidedPracticeSurface() {
  const { module, step, session, act, token } = useTutorial();
  const { title, description, facts, path, rows } = step.scene;
  const actionReady = step.action && session.progress.status === 'active';
  const capturedAction = actionReady ? token(step.action.id) : null;

  return (
    <section className="wr-tutorial-practice wr-tutorial-guided" aria-label={module.label}>
      <h1>{module.label}</h1>
      <p className="wr-tutorial-notice" role="note">모의 연습 · 실제 방, 기록, 아이템, 보상과 분리돼요.</p>
      <article className="wr-tutorial-guided-scene">
        <h2>{title}</h2>
        <p>{description}</p>
        {facts && <dl className="wr-tutorial-guided-facts">
          {facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>}
        {rows && <table className="wr-tutorial-guided-ranking" aria-label={description + ' 예시 랭킹'}>
          <thead><tr><th scope="col">순위</th><th scope="col">탐험가</th><th scope="col">시간</th><th scope="col">이동</th></tr></thead>
          <tbody>{rows.map(([name, time, moves], index) => (
            <tr key={name}><td>{index + 1}</td><th scope="row">{name}</th><td>{time}</td><td>{moves}</td></tr>
          ))}</tbody>
        </table>}
        {path && <ol className="wr-tutorial-guided-path" aria-label="예시 이동 경로">
          {path.map(name => <li key={name}>{name}</li>)}
        </ol>}
        {actionReady && <button type="button" className="app-btn app-btn-primary" data-tutorial-anchor={step.anchor}
          onClick={() => act(capturedAction)}>{step.action.label}</button>}
      </article>
    </section>
  );
}
