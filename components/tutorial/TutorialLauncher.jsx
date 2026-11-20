import React from 'react';
import { useTutorial } from './TutorialProvider.jsx';
export default function TutorialLauncher() {
  const { module, session, control, realMatchActive } = useTutorial();
  const status = session.progress.status;
  if (status === 'active') return null;
  return <section className="wr-tutorial-launcher" aria-label="튜토리얼" lang="ko">
    {status === 'offered' && <p>첫 탐험을 함께 시작해 볼까요?</p>}
    {status === 'completed' && <p role="status">{module.completionMessage || '기본 조작 훈련을 마쳤어요. 실제 게임의 기록과 보상은 바뀌지 않았어요.'}</p>}
    {realMatchActive && <p>진행 중인 경기를 마친 뒤 연습하실 수 있어요.</p>}
    <button type="button" data-tutorial-return-focus disabled={realMatchActive} onClick={() => control(status === 'paused' ? 'resume' : ['dismissed', 'completed'].includes(status) ? 'restart' : 'start')}>{status === 'paused' ? '이어하기' : ['dismissed', 'completed'].includes(status) ? '다시 시작' : '훈련 시작'}</button>
    {status === 'offered' && <><button type="button" onClick={() => control('pause')}>나중에</button><button type="button" onClick={() => control('dismiss')}>다시 보지 않기</button></>}
  </section>;
}
