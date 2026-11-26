# 키온 튜토리얼 정지 원화 제작 인계

2026-11-26 KST · 기준 `650ee70` 위 미커밋 최종 후보 · 7포즈 적용

키온은 작은 정글 탐험 동료입니다. 승인된 이모티콘의 둥근 연녹색 얼굴과 크림색 볼, 초록 점, 잎 모자, 황동 고글, 녹색 소용돌이 꼬리를 캐릭터 식별 기준으로 사용합니다. 기존 콘셉트의 노트와 나침반은 튜토리얼 장면의 도구로 씁니다. 탐험복, 장식의 위치, 눈과 입의 기본 비율은 7포즈에서 같은 모델로 유지합니다.

- 기존 이야기와 장면 기준 · [시나리오 v1.1](<C:/Project/wiki-integrate-20261105/.temp/parallel-20261105/references/WikiRace-Handoff-20261105/01_tutorial_primary/WikiRace_Tutorial_Scenario_v1.1_Kion.md>) · [콘셉트 보드 1](<C:/Project/wiki-integrate-20261105/.temp/parallel-20261105/references/WikiRace-Handoff-20261105/02_visual_references/Kion_concept_board_01.png>) · [콘셉트 보드 2](<C:/Project/wiki-integrate-20261105/.temp/parallel-20261105/references/WikiRace-Handoff-20261105/02_visual_references/Kion_concept_board_02.png>)
- 승인된 실제 외형 기준 · [hello](../../public/assets/wiki-race/emotes/kion-hello.webp) · [ready](../../public/assets/wiki-race/emotes/kion-ready.webp) · [good](../../public/assets/wiki-race/emotes/kion-good.webp) · [wow](../../public/assets/wiki-race/emotes/kion-wow.webp) · [wait](../../public/assets/wiki-race/emotes/kion-wait.webp)
- 현재 제품 프레이밍 · [모바일 첫 환영 캡처](<C:/Project/wiki/deliverables/kion-audit-20261125/captures/tutorial-mobile-01-kion.png>) · [승인된 제작 요구](<C:/Project/wiki/deliverables/improvement-prep-20261125/B-키온-자산-제작-명세.md>)

## 포즈별 주문

| 상태 · 예정 파일 | 정지 포즈 | 그림 확인 기준 |
|---|---|---|
| `idle` · `kion-idle.webp` | 열린 노트를 가슴 앞에 들고 화면과 눈을 맞춰 환영합니다. | 노트와 눈 윤곽은 축소해도 구분됩니다. |
| `point` · `kion-point.webp` | 한 손을 바깥쪽으로 내밀어 클릭 위치로 시선을 보냅니다. 반대 손으로 노트를 받칩니다. | 글자와 실제 대상은 DOM에서 표시합니다. 손가락은 캔버스 안전 영역에 둡니다. |
| `think` · `kion-think.webp` | 고개를 살짝 기울이고 한 손을 턱 근처에 댑니다. 시선은 링크가 있는 쪽을 향합니다. | 눈썹과 입은 차분한 탐색을 표현합니다. |
| `surprise` · `kion-surprise.webp` | 눈이 둥글게 커지고 한 손이 살짝 들린 모자를 잡습니다. | 고개와 모자의 작은 자세 변화로 친근한 놀람을 보여 줍니다. |
| `cheer` · `kion-cheer.webp` | 양손을 들고 웃습니다. 나침반을 작은 강조 소품으로 사용합니다. | 움직이지 않는 그림에서도 성공 표정이 보입니다. 반짝이는 별도 레이어에 둡니다. |
| `serious` · `kion-serious.webp` | 노트를 덮고 양손을 차분히 모아 설명합니다. | 표정은 또렷하고 부드럽게 유지합니다. |
| `wave` · `kion-wave.webp` | 어깨 가까이 손을 들어 작별 인사를 합니다. 남은 손은 노트를 아래로 잡습니다. | `hello`의 손과 고글 비율을 기준으로 삼고 글자·이모티콘 말풍선은 원화 밖에 둡니다. |

## 납품 규격과 검토

1. 동일 1:1 캔버스의 정지 7포즈 비교 시트를 먼저 받습니다. 편집 원본에서 몸, 얼굴, 모자·고글, 손과 도구, 효과를 나눕니다. 발 기준선, 머리 크기, 중앙축을 고정합니다.
2. 투명 PNG 마스터와 실제 표시 크기 비교용 알파 WebP를 준비합니다. 256px는 첫 내보내기 확인값입니다. 390px 모바일과 1440px 데스크톱의 기존 말풍선에 정지 이미지를 합성해 선명도, 잘림, 클릭 영역 가림을 확인한 뒤 배포 해상도를 정합니다.
3. WebP 7개는 원화 승인 후 `public/assets/wiki-race/tutorial/kion/`에서 연결합니다. 등록 전에는 기존 SVG를 사용합니다. 말풍선, 문자, 화면 조작 방식은 DOM이 맡으므로 원화에 글자나 버튼을 합성하지 않습니다.
4. 7포즈의 모델 일관성, 축소 가독성, 사용 장면 적합성을 먼저 검토합니다. 최종 원화가 승인된 뒤 모션 작업으로 넘깁니다.

## 등록 지점

`components/tutorial/KionView.jsx`의 기본 등록표는 승인 ZIP의 512×512 WebP 7개를 포즈 키로 연결합니다. 미등록 포즈와 이미지 로드 실패는 기존 SVG를 표시합니다. 기존 말풍선에 반신 그림을 아래쪽 기준으로 놓고, 등장·호흡·응원 모션을 CSS에서 적용했습니다. 모션 감소 설정에서는 정지 표시합니다. 390px·1440px에서 로딩과 배치를 확인했고 390px 기본 튜토리얼은 완주 영상을 남겼습니다.
