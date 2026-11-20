// Authored teaching examples, not Wikipedia snapshots. No hidden achievement data.
export const practiceDocuments = Object.freeze({
  apple: Object.freeze({ title: '사과', path: ['사과'], html: '<p>사과는 <a href="#" data-wiki-title="과일" data-tutorial-anchor="solo.link.fruit" data-tutorial-protect>과일</a>의 한 종류예요.</p>' }),
  fruit: Object.freeze({ title: '과일', path: ['사과', '과일'], html: '<p data-tutorial-anchor="solo.choices"><a href="#" data-wiki-title="식물">식물</a>에서 열매가 자라요. <a href="#" data-wiki-title="요리">요리</a>에 쓰이기도 해요.</p>' }),
  detour: Object.freeze({ title: '요리', path: ['사과', '과일', '요리'], html: '<p>요리는 여러 재료로 음식을 만드는 과정이에요. 이번에는 다른 연결을 골라 볼까요?</p>' }),
  plant: Object.freeze({ title: '식물', path: ['사과', '과일', '식물'], html: '<p>목표 문서에 도착했어요. 이 글은 연습용으로 작성한 짧은 예시예요.</p>' }),
});
