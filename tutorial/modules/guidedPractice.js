// Self-contained mock scenes. The tutorial engine stores only the checkpoint ID.
export const GUIDED_PRACTICE_ROUTE = '/tutorial/practice/course';

const scene = (title, description, details = {}) => ({ title, description, ...details });

const step = (id, actor, dialogue, example) => ({
  id, chapter: 'guided-practice', route: GUIDED_PRACTICE_ROUTE,
  actor, dialogue, heading: example.title, scene: example, mode: 'observe',
});

const actionStep = (id, actor, dialogue, example, action, label, destination) => ({
  ...step(id, actor, dialogue, example),
  mode: 'focus-click', anchor: 'guided.action',
  action: { id: action, label },
  next: { [action]: destination },
});

const dailyRows = [
  ['키온', '00:12', '2회'],
  ['숲 탐험가', '00:16', '3회'],
];
const allTimeRows = [
  ['바람 탐험가', '00:10', '2회'],
  ['키온', '00:12', '2회'],
];

const course = (id, label, steps) => ({ id, label, steps, version: 1, autoOffer: 'manual',
  completionMessage: '선택한 모의 연습을 마쳤어요.' });

export const guidedPracticeModules = [
  course('rank-route', '랭킹·경로 복기 연습', [
    step('R00', 'wave', '예시 순위를 비교하고, 한 번의 경기에서 왜 그 길을 골랐는지 돌아봐요.',
      scene('순위와 이동 경로', '순위표와 경로는 이 과정에서 만든 예시입니다.')),
    actionStep('R01', 'point', '오늘의 도전 기록과 참고용 전체 시간 기록의 구분을 연습해요.',
      scene('예시 랭킹', '오늘의 도전', { rows: dailyRows }),
      'ranking.all-time', '참고용 전체 시간 보기', 'R02'),
    actionStep('R02', 'think', '전체 시간 예시에서는 키온이 두 번째예요. 이어서 예시 경기 결과에서 이동 경로를 펼쳐 보세요.',
      scene('예시 랭킹', '참고용 전체 시간', { rows: allTimeRows }),
      'ranking.open-route', '예시 결과에서 경로 보기', 'R03'),
    actionStep('R03', 'point', '사과에서 식물로 가는 길 가운데 과일을 골라 이유를 확인해 보세요.',
      scene('키온의 예시 경로', '사과에서 식물까지 2회 이동했어요.', { path: ['사과', '과일', '식물'] }),
      'ranking.check-stop', '과일 구간 확인', 'R04'),
    step('R04', 'cheer', '다음 경기에서도 목표에 가까워진 링크를 복기해 보세요.',
      scene('과일을 고른 이유', '사과보다 넓은 과일 문서에서 식물 개념으로 이어지는 링크를 찾았어요.', { path: ['사과', '과일', '식물'] })),
  ]),
  course('duel-basics', '1:1 기본 연습', [
    step('D00', 'wave', '방장이 목표 문서를 선택하고 참가자와 함께 출발하는 예시예요.',
      scene('1:1 모의 대기실', '두 자리는 예시 플레이어로 채워져 있어요.', { facts: [['방장', '키온'], ['참가자', '숲 탐험가']] })),
    actionStep('D01', 'point', '방장 자리에서 이 경기의 목표 문서를 골라 보세요.',
      scene('목표 후보', '출발 문서는 과일이에요.', { facts: [['출발', '과일'], ['목표 후보', '식물']] }),
      'duel.select-goal', '식물 선택', 'D02'),
    actionStep('D02', 'serious', '목표가 정해졌어요. 방장이 출발하면 두 참가자가 같은 목표를 찾아요.',
      scene('출발 준비', '두 참가자가 입장했고 목표를 선택했어요.', { facts: [['출발', '과일'], ['목표', '식물']] }),
      'duel.start', '1:1 연습 출발', 'D03'),
    actionStep('D03', 'point', '현재 문서에서 목표와 같은 이름의 링크를 따라가세요.',
      scene('과일', '과일은 식물에서 자라는 열매예요.', { facts: [['현재', '과일'], ['목표', '식물']] }),
      'duel.follow-link', '식물로 이동', 'D04'),
    step('D04', 'cheer', '목표 도착! 예시 결과에서 이동 경로를 확인할 수 있어요.',
      scene('1:1 연습 결과', '식물에 도착했어요.', { path: ['과일', '식물'] })),
  ]),
  course('group-basics', '그룹 기본 연습', [
    step('G00', 'wave', '모의 그룹 대기실에서 후보를 고른 뒤 READY로 제출해 봐요.',
      scene('그룹 모의 대기실', '참가자와 문서는 연습 예시예요.', { facts: [['방장', '키온'], ['참가자', '별 탐험가 · 숲 탐험가']] })),
    actionStep('G01', 'point', '출발·목표의 후보가 될 문서를 고르세요.',
      scene('후보 선택', '이번 예시에서 고를 문서는 사과예요.', { facts: [['내 후보', '미선택']] }),
      'group.choose', '사과 후보 선택', 'G02'),
    actionStep('G02', 'point', '사과를 골랐어요. READY를 누르면 선택한 문서가 후보로 제출돼요.',
      scene('참가 준비', '사과를 선택했어요. 아직 후보로 제출되지 않았어요.', { facts: [['내 후보', '사과'], ['준비 상태', '대기']] }),
      'group.ready', 'READY로 후보 제출', 'G03'),
    actionStep('G03', 'serious', '이제 다 같이 준비됐어요. 이 예시에서는 방장 자리에서 출발해요.',
      scene('출발 준비', '세 참가자가 모두 READY를 눌렀고 후보 목록에 서로 다른 문서가 두 개 이상 있어요.', { facts: [['출발', '사과'], ['목표', '식물'], ['준비 상태', '3명 준비 완료']] }),
      'group.start', '그룹 연습 출발', 'G04'),
    actionStep('G04', 'point', '식물 링크로 이동해 이 모의 경기를 완주해 보세요.',
      scene('과일', '과일은 식물에서 자라는 열매예요.', { facts: [['현재', '과일'], ['목표', '식물']], path: ['사과', '과일'] }),
      'group.follow-link', '식물로 이동', 'G05'),
    actionStep('G05', 'point', '내 연습 경기가 끝났어요. 남은 참가자의 진행 여부를 보는 예시를 열어 보세요.',
      scene('그룹 경기 진행', '키온은 도착했고, 다른 예시 참가자는 아직 이동 중이에요.',
        { facts: [['키온', '도착'], ['별 탐험가', '이동 중'], ['숲 탐험가', '이동 중']] }),
      'group.spectate-summary', '관전 예시 열기', 'G06'),
    step('G06', 'cheer', '관전 예시에서는 참가자 상태를 살펴볼 수 있어요.',
      scene('그룹 관전 상태 예시', '다른 참가자가 도착할 때까지 진행 상태를 살펴봐요.',
        { facts: [['키온', '도착'], ['별 탐험가', '이동 중'], ['숲 탐험가', '도착']] })),
  ]),
  course('duel-items', 'v4 아이템 조작 연습', [
    step('V00', 'wave', 'v4 아이템 효과에 대응하는 순서를 모의 경고로 익혀 봐요.',
      scene('v4 모의 경기', '고정 예시를 눌러 보는 과정이에요. 실제 방의 설정과 입장 조건은 PLAY에서 확인해요.')),
    actionStep('V01', 'point', '먼저 슬롯에 어떤 아이템이 있는지 열어 보세요.',
      scene('연습 아이템 슬롯', '한 슬롯에는 방어 아이템, 다른 슬롯에는 빈칸을 담은 예시예요.',
        { facts: [['슬롯 1', '패링'], ['슬롯 2', '비어 있음']] }),
      'v4.inspect-item', '패링 슬롯 살펴보기', 'V02'),
    actionStep('V02', 'surprise', '공격 경고가 떴어요. 이 예시에서 패링 입력을 눌러 보세요.',
      scene('모의 공격 경고', '패링 아이템을 가진 예시 참가자에게 대응 버튼이 표시돼요. 이 연습에는 제한 시간이 없어요.',
        { facts: [['모의 상대', '효과 발동'], ['방어 아이템', '패링 준비']] }),
      'v4.parry', '패링 눌러 보기', 'V03'),
    step('V03', 'cheer', '패링 입력을 마쳤어요. 경고가 먼저 보이고 대응 조작이 뒤따라요.',
      scene('모의 대응 결과', '연습 입력으로 모의 경고를 닫았어요.', { facts: [['경고', '해제'], ['처리 결과', '연습 화면에만 반영']] })),
  ]),
  course('group-items', 'S5 아이템·도크 연습', [
    step('I00', 'wave', 'S5에서 보급과 아이템 슬롯을 살펴보는 모의 조작이에요.',
      scene('S5 모의 경기', '고정 예시를 눌러 보는 과정이에요. 실제 방의 설정과 입장 조건은 PLAY에서 확인해요.')),
    actionStep('I01', 'point', '보급 예시를 열어 어떤 아이템이 들어오는지 확인해 보세요.',
      scene('보급 예시', '연습용 보급을 확인하면 편집보호가 슬롯에 표시돼요.', { facts: [['내 연습 슬롯', '비어 있음']] }),
      's5.inspect-supply', '보급 예시 확인', 'I02'),
    actionStep('I02', 'think', '보급으로 채워진 슬롯을 확인하면 어떤 입력이 가능한지 알 수 있어요.',
      scene('아이템 도크 예시', '보급 예시에서 받은 편집보호가 표시돼요.', { facts: [['내 연습 슬롯', '편집보호'], ['입력 상태', '사용 가능']] }),
      's5.inspect-slot', '연습 슬롯 확인', 'I03'),
    actionStep('I03', 'point', '연습 방어 아이템을 사용한 뒤 도크가 어떻게 바뀌는지 보세요.',
      scene('아이템 사용 예시', '이 예시에서는 편집보호 사용을 연습해요.', { facts: [['선택한 연습 아이템', '편집보호']] }),
      's5.use-item', '연습 편집보호 사용', 'I04'),
    step('I04', 'cheer', '사용한 아이템 슬롯을 다시 확인해 보세요.',
      scene('S5 연습 결과', '모의 사용을 마쳤어요.', { facts: [['내 연습 슬롯', '비어 있음'], ['처리 결과', '연습 화면에만 반영']] })),
  ]),
];

export function findGuidedPracticeModule(id) {
  return guidedPracticeModules.find(module => module.id === id);
}
