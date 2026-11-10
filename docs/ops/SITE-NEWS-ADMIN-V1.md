# Wiki Race 소식 운영 관리 v1 — 배포·계정 지정 안내

현재 소식은 `data/updateNotices.js`의 정적 파일에 고정돼 있었습니다. 이 변경은 `public.site_news_posts`에 게시된 글을 저장하고, `/admin/updates`에서 새 글 작성·수정·게시·비공개 전환을 할 수 있게 만듭니다. 일반 플레이어에게는 게시된 글만 보입니다.

## 버전과 기존 데이터

- 출시 공지 이름: **Wiki Race 2.0.2 — 탐험 환경 개선**
- 기존 게시글 3개와 2.0.2 업데이트 1개를 DB 초기 데이터로 이관합니다.
- 업데이트 글은 신규 기능 구현을 포함한 정상 운영 배포 후에 공개해야 합니다.
- 기존 게시글은 이름/날짜/본문이 유지됩니다. 클라이언트 정적 파일은 DB 네트워크 장애 때의 읽기 전용 대체 콘텐츠이며, DB 게시글이 있는 동안에는 덮어쓰지 않습니다.
- 새 소식 미열람 표시도 DB 최신 게시글 ID를 사용합니다.

## 권한 경계

- `private.site_news_admins`: **단 1명만** 가능한 슬롯 제약 `slot=1`. Auth UUID를 참조하며 회원 프로필의 닉네임·`user_metadata`를 인증 기준으로 사용하지 않습니다.
- 관리 권한은 로그인한 Auth 사용자 ID를 서버 함수 `public.is_site_news_admin()`가 검증합니다.
- `public.site_news_posts`: RLS 활성화. 모든 사용자와 게스트는 **게시된 글만 SELECT**, 운영자만 비공개 글 조회/INSERT/UPDATE 가능. 일반 사용자에게 DELETE 권한은 부여하지 않습니다.
- `/admin/updates`는 사용자 편의용 프런트 가드가 있으며 **최종 방어는 DB RLS**입니다.
- 일반 회원이 본인 프로필/브라우저/HTTP 요청을 변경해도 운영자 계정을 자기 것으로 등록할 수 없도록 합니다.

## 최초 운영자 1명 지정

**마이그레이션은 어떤 계정도 운영자로 자동 지정하지 않습니다.** 배포 전 실제 로그인 계정의 Wiki Race **아이디(username)**를 확인한 뒤 아래 SQL에서 플레이스홀더 한 곳만 실제 아이디로 교체하여 신뢰할 수 있는 DB 관리자 권한으로 단 한 번 실행합니다.

```sql
begin;
do $$
declare
  v_id uuid;
begin
  select p.id into v_id
  from public.profiles p
  where p.username = 'REPLACE_WITH_VERIFIED_USERNAME';
  if v_id is null then
    raise exception 'OPERATOR_ACCOUNT_NOT_FOUND';
  end if;
  if exists(select 1 from private.site_news_admins) then
    raise exception 'OPERATOR_ALREADY_ASSIGNED';
  end if;
  insert into private.site_news_admins(slot,user_id) values(1,v_id);
end $$;
commit;
```

계정을 바꿀 때도 관리자 권한으로 기존 운영자 확인 후 업데이트해야 합니다. 일반 사용자가 접근하는 관리자 생성 UI나 공개 RPC는 만들지 않습니다. 사용자 이메일, 비밀번호, UUID 등을 커밋하지 마세요.

## 수동 검증 순서

1. 격리 DB 및 CI 테스트 통과: 게스트 읽기/쓰기 차단, 일반 회원의 초안 조회 및 쓰기 차단, 운영자 1명만 작성/게시/비공개.
2. 운영 마이그레이션 적용. `site_news_posts` 행 4개, 공개 4개, `site_news_admins` 행 0개 확인.
3. 사이트 운영자 아이디 확인 후 관리자 한 명 지정. 기존 계정으로 다시 로그인하고 `/admin/updates` 접속.
4. 초안 생성 → 공개 소식 페이지에 보이지 않음 확인 → 게시 → 보임 확인 → 수정 → 비공개 → 다시 보이지 않음 확인. 다른 일반 회원·게스트 계정으로 동일 확인.
5. 모바일/PC 소식 화면과 미열람 점 복구 확인. 본문은 일반 텍스트로 렌더링해 HTML 삽입을 허용하지 않습니다.
6. 점검 시 RLS/ACL 및 개인정보가 로그에 포함되지 않는지 확인하고 운영 배포 진행.

### 운영 스키마 메모

프로젝트의 공개 API 환경에서는 인증 및 RLS가 함께 작동해야 합니다. 마이그레이션 이후 관리자 계정 지정 전에는 `/admin/updates` UI에 정상적으로 '접근 권한 없음'이 표시됩니다. 운영자의 보안 역할은 추후 다른 콘텐츠·설정 관리 화면에도 이 테이블 기준으로 확장할 수 있지만, 현재 1차 범위는 **소식 관리만**입니다.
