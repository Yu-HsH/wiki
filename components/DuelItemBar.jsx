import React, { useEffect, useMemo, useRef, useState } from "react";

import {
    canUseDuelItem,
    DUEL_ITEM_COOLDOWN_MS,
    DUEL_ROLE_LABELS,
    DUEL_SLOT_COUNT,
    getDuelItem,
} from "../data/duelItems.js";

/**
 * 1:1 아이템 HUD — 5슬롯 + `link_preview` 패널 (트랙 C, P5).
 *
 * `components/ItemBar.jsx`는 **건드리지 않는다.** 싱글 아이템의 소비자가 그 파일이고
 * prop 계약이 동결이다 (`TRACKS.md` §2.3-③). 1:1은 슬롯 수·역할 축·서버 권위가 전부
 * 달라서 같은 컴포넌트로 묶으면 양쪽 계약이 얽힌다.
 *
 * ## 이 컴포넌트는 상태를 갖지 않는다 — 시계와 열림 여부만 갖는다
 *
 * 인벤토리·쿨타임·지속효과·실패는 전부 prop으로 받는다. 소유자는 `MultiplayerGamePage`이고
 * 그 값의 출처는 `services/duelItemService.js`다. 여기서 자체적으로 RPC를 부르지 않는다.
 *
 * ## 슬롯을 낙관적으로 소비 표시하지 않는다 `[P5 판정, 2026-09-04]`
 *
 * 누른 슬롯을 곧바로 "사용됨"으로 칠하지 않는다. `item.used`는 **서버 지급 행의
 * `consumed_at`에서만** 온다. 누른 동안에는 `pendingGrantId`로 **대기 표시**만 하고,
 * 응답이 오면 부모가 새 인벤토리를 내려 준다.
 *
 * 이 규칙이 실패 처리를 단순하게 만든다 — **잃을 슬롯이 애초에 없다.**
 * migration을 읽어 보면 `consumed_at`을 쓰는 곳은 `:984` 하나이고 그것은 원장
 * INSERT(`:970`) 뒤, 즉 **성공 경로에만** 있다. 즉 실패 코드 15종 어느 것도 슬롯을
 * 소비하지 않는다. 그래서 낙관적 표시를 안 하는 것만으로 "미소비인데 슬롯이 사라져
 * 보이는" 사고가 구조적으로 불가능해진다.
 *
 * 그 위에서 실패 봉투의 두 값을 나눠 읽는다:
 *
 * - `failure.slotRestored` (미소비 3종) — 로컬에서 증명된다. 다시 묻지 않고 안내만 띄운다.
 * - `failure.refetchState` (`rejected` 갈래, **헬퍼 3종 포함**) — 내 관점이 서버와
 *   갈렸을 수 있다. `onRequestStateRefresh()`를 부른다.
 *
 * **`slotRestored === false`가 "소비됐다"가 아니다.** 헬퍼 3종
 * (`PLAYER_NOT_FOUND`·`PLAYER_NOT_PLAYING`·`UNSUPPORTED_EVENT_TYPE`)이 그 함정이고,
 * 그 셋은 `refetchState`가 잡는다.
 *
 * ## `link_preview`를 여기 접어 넣는다 (Q4 결정)
 *
 * 별도 컴포넌트를 만들지 않고 이 파일의 패널로 둔다. 다만 **요약 본문을 여기서
 * 가져오지 않는다** — 아래 "부채" 주석 참고. 패널은 `linkPreview` prop을 그리기만 한다.
 */

/* ────────────────────────────────────────────────────────────
 * 등재된 부채 — `link_preview` 요약 본문 `[P5, 2026-09-04]`
 *
 * 확정 스펙 §5.5는 "연결 문서 **첫 문장**"을 요구한다. 그 문장의 출처는
 * `services/wikiService.js`의 `fetchPageSummary(title)`이고(그 함수의 `extract`가 그것이다),
 * **위키백과 REST**를 부른다 — 우리 Supabase가 아니다. 즉 새 RPC는 필요하지 않다.
 *
 * 그런데도 P5에서 부르지 않는 이유는 둘이다:
 *
 *   1. **P5의 범위는 이 컴포넌트와 CSS 추가뿐이다.** 여기서 fetch를 하면 컴포넌트가
 *      abort·캐시·중복요청을 갖게 되고, 그 세 가지는 이미 `MultiplayerGamePage`가
 *      `pageData.links`와 함께 들고 있는 것이다. 있는 자리에 붙이는 것이 맞다.
 *   2. 그래서 이 패널은 `linkPreview.entries`를 **받아서 그린다.** 채우는 쪽은 P6/P7이다.
 *
 * **범위 안에서 실제로 하는 것:** 링크 제목, 남은 미리보기 횟수, 15초 카운트다운,
 * 그리고 **지금 봉인된 링크 표시**(`link_censorship`의 `metadata.censoredTitles`).
 * 마지막 것은 요약 없이도 15초 창에서 바로 쓸모가 있다 — 눌러 봐야 막힌 링크를 미리 안다.
 *
 * **부채 ① 닫힘** `[P7, 2026-09-04]` — `linkPreview.entries`를 부모가 채운다.
 *   `pages/MultiplayerGamePage.jsx`의 `handlePreviewLink`가 `fetchPageSummary`를 부르고
 *   `{status, extract, description, thumbnailUrl}`을 내려 준다. **이 컴포넌트는 그대로다**
 *   — 여전히 fetch를 갖지 않고 받은 것을 그린다. 위 1·2가 그 이유였고 바뀌지 않았다.
 *   횟수는 `ready`·`loading`만 세므로 요약을 못 가져온 클릭은 한도를 깎지 않는다.
 *
 * **부채 ② ⚠ `maxPreviews: 3`에 서버 권위가 없다.** `data/duelItems.js`에만 있는 값이고
 *   migration에는 미리보기 카운터가 아예 없다 — 카탈로그 행(`:79`)이
 *   `(duration_ms 15000, charges 0)`뿐이다. 즉 **이 3회 제한은 클라이언트만 세고 서버는
 *   모른다.** 확정 스펙 §5.1이 아이템 권위를 서버에 두기로 한 것과 어긋나는 유일한
 *   잔여 지점이다. 서버가 세게 하려면 원장에 미리보기 행을 남기는 RPC가 필요하고
 *   그것은 v4 범위다. **지금은 표시상의 제한이며 우회가 가능하다.**
 *   (같은 성격의 선례: `random_teleport` 부채 — `data/duelItems.js` 머리말.)
 * ──────────────────────────────────────────────────────────── */

const ROLE_ICONS = Object.freeze({
    attack: "⚔",
    search: "🔍",
    defense: "🛡",
    joker: "🃏",
});

/** 쿨타임 게이지가 멈춰 보이지 않을 만큼만 자주 돈다. 쿨타임은 2.5초다. */
const TICK_MS = 100;

function formatSeconds(remainingMs) {
    return (Math.max(0, remainingMs) / 1000).toFixed(1);
}

/**
 * 지금 시각을 재는다. **쿨타임과 지속효과가 스스로 풀리게 하는 유일한 장치다.**
 * 값이 없으면 타이머를 아예 걸지 않는다 — 경기 내내 도는 인터벌을 만들지 않는다.
 */
function useTicker(active) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!active) return undefined;
        const timer = setInterval(() => setNow(Date.now()), TICK_MS);
        return () => clearInterval(timer);
    }, [active]);

    return active ? now : Date.now();
}

export default function DuelItemBar({
    inventory = [],
    useItems = true,
    phaseReady = false,
    cooldownUntil = null,
    linkCount = 0,
    historyLength = 0,
    activeEffects = [],
    pendingDefenses = [],
    pendingGrantId = null,
    failure = null,
    linkPreview = null,
    onUseItem,
    onDismissFailure,
    onRequestStateRefresh,
    onPreviewLink,
    onClosePreview,
}) {
    const hasDeadline =
        cooldownUntil != null ||
        activeEffects.length > 0 ||
        pendingDefenses.length > 0 ||
        linkPreview?.expiresAt != null;
    const now = useTicker(hasDeadline);

    const cooldownRemaining = cooldownUntil == null ? 0 : Math.max(0, cooldownUntil - now);
    const onCooldown = cooldownRemaining > 0;

    /**
     * 실패가 `refetchState`면 서버 상태를 다시 읽어 슬롯 관점을 맞춘다.
     *
     * **같은 실패 객체로 두 번 부르지 않는다** — 부모가 리렌더될 때마다 RPC가 나가면
     * 거부 하나가 조회 폭풍이 된다. 봉투의 정체성으로 한 번만 통과시킨다.
     */
    const handledFailure = useRef(null);
    useEffect(() => {
        if (!failure || handledFailure.current === failure) return;
        handledFailure.current = failure;
        if (failure.refetchState) onRequestStateRefresh?.();
    }, [failure, onRequestStateRefresh]);

    /** 5칸을 항상 그린다. 서버가 덜 준 자리는 빈 슬롯으로 남겨 배치가 흔들리지 않게 한다. */
    const slots = useMemo(() => {
        const filled = [...inventory].sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
        return Array.from({ length: DUEL_SLOT_COUNT }, (_, index) => filled[index] ?? null);
    }, [inventory]);

    const usableCount = slots.filter(
        (item) =>
            item &&
            canUseDuelItem(item, { phaseReady, cooldownUntil, linkCount, historyLength })
    ).length;

    if (!useItems) {
        return (
            <aside className="duel-item-bar duel-item-bar--off" aria-label="1:1 아이템">
                <p className="duel-item-bar__off-note">아이템을 쓰지 않는 경기입니다.</p>
            </aside>
        );
    }

    const busy = pendingGrantId != null;

    return (
        <aside className="duel-item-bar" aria-label="1:1 아이템">
            <div className="duel-item-bar__head">
                <span className="duel-item-bar__count">
                    아이템 <strong>{usableCount}</strong>
                </span>
                {onCooldown && (
                    <span className="duel-item-bar__cooldown" role="timer">
                        {formatSeconds(cooldownRemaining)}초
                    </span>
                )}
            </div>

            {onCooldown && (
                <div
                    className="duel-item-bar__gauge"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={DUEL_ITEM_COOLDOWN_MS}
                    aria-valuenow={DUEL_ITEM_COOLDOWN_MS - cooldownRemaining}
                >
                    <span
                        className="duel-item-bar__gauge-fill"
                        style={{
                            width: `${Math.min(
                                100,
                                ((DUEL_ITEM_COOLDOWN_MS - cooldownRemaining) /
                                    DUEL_ITEM_COOLDOWN_MS) *
                                    100
                            )}%`,
                        }}
                    />
                </div>
            )}

            <DuelEffectStrip
                activeEffects={activeEffects}
                pendingDefenses={pendingDefenses}
                now={now}
            />

            <div className="duel-item-bar__slots">
                {slots.map((item, index) => (
                    <DuelItemSlot
                        key={item?.instanceId ?? `empty-${index}`}
                        item={item}
                        slotIndex={index}
                        // 대기 중에는 전체를 잠근다. 쿨타임이 공통이라 두 번째 클릭은
                        // 어차피 ITEM_COOLDOWN으로 거부된다 — 미리 막는 편이 조용하다.
                        locked={busy}
                        pending={item != null && item.grantId === pendingGrantId}
                        usable={
                            item != null &&
                            canUseDuelItem(item, {
                                phaseReady,
                                cooldownUntil,
                                linkCount,
                                historyLength,
                            })
                        }
                        onUseItem={onUseItem}
                    />
                ))}
            </div>

            {failure && (
                <DuelItemNotice failure={failure} onDismissFailure={onDismissFailure} />
            )}

            {linkPreview?.active && (
                <DuelLinkPreviewPanel
                    linkPreview={linkPreview}
                    now={now}
                    onPreviewLink={onPreviewLink}
                    onClosePreview={onClosePreview}
                />
            )}
        </aside>
    );
}

/* ────────────────────────────────────────────────────────────
 * 슬롯 하나
 * ──────────────────────────────────────────────────────────── */

function DuelItemSlot({ item, slotIndex, locked, pending, usable, onUseItem }) {
    if (!item) {
        return (
            <div
                className="duel-item-slot duel-item-slot--empty"
                aria-hidden="true"
                data-slot={slotIndex}
            />
        );
    }

    const role = item.slotRole || getDuelItem(item.id)?.role || null;
    const classes = [
        "duel-item-slot",
        item.used ? "duel-item-slot--used" : "",
        item.isWildcard ? "duel-item-slot--wildcard" : "",
        pending ? "duel-item-slot--pending" : "",
        role ? `duel-item-slot--${role}` : "",
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <button
            type="button"
            className={classes}
            data-slot={slotIndex}
            // 대기 중인 슬롯 자신도 disabled다 — 같은 슬롯 두 번 누르기를 막는다.
            disabled={!usable || locked}
            onClick={() => onUseItem?.(item.grantId)}
            title={`${item.name} — ${item.description}`}
        >
            <span className="duel-item-slot__icon" aria-hidden="true">
                {ROLE_ICONS[role] || "✦"}
            </span>
            <span className="duel-item-slot__name">{item.name}</span>
            <span className="duel-item-slot__role">
                {DUEL_ROLE_LABELS[role] || "아이템"}
                {item.isWildcard ? " · 변칙" : ""}
            </span>
            {item.used && <span className="duel-item-slot__stamp">사용</span>}
            {pending && (
                <span className="duel-item-slot__spinner" aria-label="서버 확인 중" />
            )}
        </button>
    );
}

/* ────────────────────────────────────────────────────────────
 * 지속효과 · 방어 대기
 *
 * 전부 서버가 판정한 결과다. 차단·무효 행은 `get_duel_item_state_v3`가 이미 걸러서
 * 보내지 않으므로 여기서 다시 판정하지 않는다.
 * ──────────────────────────────────────────────────────────── */

function DuelEffectStrip({ activeEffects, pendingDefenses, now }) {
    const live = activeEffects.filter((effect) => (effect.expiresAt ?? 0) > now);
    const guards = pendingDefenses.filter((defense) => (defense.expiresAt ?? 0) > now);
    if (live.length === 0 && guards.length === 0) return null;

    return (
        <ul className="duel-item-effects" aria-live="polite">
            {guards.map((defense) => (
                <li
                    key={defense.itemEventId}
                    className="duel-item-effects__row duel-item-effects__row--guard"
                >
                    <span className="duel-item-effects__label">
                        {getDuelItem(defense.itemId)?.name || defense.itemId}
                    </span>
                    <span className="duel-item-effects__time">
                        {formatSeconds((defense.expiresAt ?? now) - now)}초
                    </span>
                </li>
            ))}
            {live.map((effect) => (
                <li
                    key={effect.itemEventId}
                    className="duel-item-effects__row duel-item-effects__row--hit"
                >
                    <span className="duel-item-effects__label">
                        {getDuelItem(effect.itemId)?.name || effect.itemId}
                    </span>
                    <span className="duel-item-effects__time">
                        {formatSeconds((effect.expiresAt ?? now) - now)}초
                    </span>
                </li>
            ))}
        </ul>
    );
}

/* ────────────────────────────────────────────────────────────
 * 실패 안내
 *
 * 문구는 서비스가 코드별로 들고 있다 (`getDuelItemFailureMessage`). 여기서 새 문구를
 * 만들지 않는다 — 만들면 같은 코드에 두 표현이 생긴다.
 * ──────────────────────────────────────────────────────────── */

function DuelItemNotice({ failure, onDismissFailure }) {
    return (
        <div
            className={`duel-item-notice duel-item-notice--${failure.kind}`}
            role="status"
            data-code={failure.code}
        >
            <p className="duel-item-notice__text">{failure.message}</p>
            {failure.slotRestored && (
                // 미소비 3종. 슬롯이 그대로라는 것을 말해 주지 않으면 사용자는
                // 아이템을 날린 것으로 읽는다.
                <p className="duel-item-notice__hint">아이템은 그대로 남아 있습니다.</p>
            )}
            {onDismissFailure && (
                <button
                    type="button"
                    className="duel-item-notice__close"
                    onClick={onDismissFailure}
                    aria-label="안내 닫기"
                >
                    ✕
                </button>
            )}
        </div>
    );
}

/* ────────────────────────────────────────────────────────────
 * link_preview 패널 (Q4 — 여기 접어 넣는다)
 *
 * 요약 본문은 `linkPreview.entries`로 받는다. 채우는 쪽은 P6/P7이다 —
 * 이 파일 머리말의 "부채 ①".
 * ──────────────────────────────────────────────────────────── */

function DuelLinkPreviewPanel({ linkPreview, now, onPreviewLink, onClosePreview }) {
    const {
        expiresAt = null,
        candidates = [],
        entries = {},
        selectedTitle = null,
        usedPreviews = 0,
        maxPreviews = 3,
    } = linkPreview;

    const remainingMs = expiresAt == null ? null : Math.max(0, expiresAt - now);
    const remainingPreviews = Math.max(0, maxPreviews - usedPreviews);
    const selected = selectedTitle ? entries[selectedTitle] : null;

    return (
        <section className="duel-item-preview" aria-label="링크 미리보기">
            <header className="duel-item-preview__head">
                <span className="duel-item-preview__title">링크 미리보기</span>
                <span className="duel-item-preview__meta">
                    남은 {remainingPreviews}/{maxPreviews}
                    {remainingMs != null ? ` · ${formatSeconds(remainingMs)}초` : ""}
                </span>
                {onClosePreview && (
                    <button
                        type="button"
                        className="duel-item-preview__close"
                        onClick={onClosePreview}
                        aria-label="미리보기 닫기"
                    >
                        ✕
                    </button>
                )}
            </header>

            <ul className="duel-item-preview__links">
                {candidates.map((candidate) => {
                    const title = candidate.title;
                    const entry = entries[title];
                    const isSelected = title === selectedTitle;
                    // 이미 본 링크는 남은 횟수를 다시 쓰지 않는다.
                    const seen = entry != null;
                    const exhausted = remainingPreviews <= 0 && !seen;

                    return (
                        <li key={title}>
                            <button
                                type="button"
                                className={[
                                    "duel-item-preview__link",
                                    isSelected ? "duel-item-preview__link--on" : "",
                                    candidate.censored
                                        ? "duel-item-preview__link--censored"
                                        : "",
                                ]
                                    .filter(Boolean)
                                    .join(" ")}
                                disabled={candidate.censored || exhausted}
                                onClick={() => onPreviewLink?.(title)}
                                title={
                                    candidate.censored
                                        ? "지금 봉인된 링크입니다"
                                        : candidate.canonicalTitle || title
                                    }
                            >
                                <span className="duel-item-preview__link-text">{title}</span>
                                {candidate.censored && (
                                    <span className="duel-item-preview__tag">봉인</span>
                                )}
                                {seen && !candidate.censored && (
                                    <span className="duel-item-preview__tag">확인</span>
                                )}
                            </button>
                        </li>
                    );
                })}
                {candidates.length === 0 && (
                    <li className="duel-item-preview__empty">미리볼 링크가 없습니다.</li>
                )}
            </ul>

            <div className="duel-item-preview__body">
                {!selectedTitle && (
                    <p className="duel-item-preview__placeholder">
                        링크를 눌러 첫 문장을 확인하세요.
                    </p>
                )}
                {selectedTitle && selected?.status === "loading" && (
                    <p className="duel-item-preview__placeholder">불러오는 중…</p>
                )}
                {selectedTitle && selected?.status === "unavailable" && (
                    <p className="duel-item-preview__placeholder">
                        요약을 불러오지 못했습니다.
                    </p>
                )}
                {selectedTitle && selected?.status === "ready" && (
                    <>
                        {selected.description && (
                            <p className="duel-item-preview__desc">{selected.description}</p>
                        )}
                        <p className="duel-item-preview__extract">{selected.extract}</p>
                    </>
                )}
                {selectedTitle && selected == null && (
                    // 부모가 아직 entries에 아무것도 넣지 않은 상태. 부채 ①이 닫히기
                    // 전까지 실제로 보이는 화면이므로 빈 칸으로 두지 않는다.
                    <p className="duel-item-preview__placeholder">
                        요약 연결은 준비 중입니다. 링크 제목과 봉인 여부만 확인할 수 있습니다.
                    </p>
                )}
            </div>
        </section>
    );
}
