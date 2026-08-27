# slice-public.awk — 전체 데이터 덤프에서 public 이외 스키마의 COPY 블록과 setval만 제거한다.
# 나머지(preamble의 SET 문, 주석, RESET ALL)는 그대로 통과시킨다.
# COPY 블록 종료는 단독 종료행뿐이다 — 데이터 행이 --로 시작할 수 있으므로 주석을 지우지 않는다.
BEGIN { TERM = sprintf("%c.", 92); mode = 0 }
mode == 1 { print; if ($0 == TERM) mode = 0; next }          # public COPY 본문: 통과
mode == 2 { if ($0 == TERM) mode = 0; next }                 # 비-public COPY 본문: 제거
index($0, "COPY \"public\".") == 1 { print; mode = 1; next }
index($0, "COPY \"") == 1 { mode = 2; next }
index($0, "setval") > 0 && index($0, "\"public\".") == 0 { next }
{ print }
