import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../authContext";
import {
    fetchGroupRoom,
    fetchGroupRoomPlayers,
    joinGroupRoom,
    leaveGroupRoom,
    submitGroupKeyword,
    unreadyGroupPlayer,
    startGroupRoomGame,
} from "../services/groupMultiplayerService";
import { fetchPageSummary, searchWikiTitleCandidates } from "../services/wikiService";
import { ensureWikiSnapshot } from "../services/wikiSnapshotService";
import { createGroupEntryMarker } from "../utils/groupGameFlow";
import UserProfileModal from "../components/UserProfileModal"; // 1. 모달 import
import ProfileCard from "../components/ProfileCard";
import useProfileCards from "../hooks/useProfileCards.js";
import { DENSITY, NAME_FALLBACK, buildProfileCard, mergeRewardSlots, resolveDisplayName } from "../utils/profileCard.js";
import { getGroupStartState } from "../utils/groupLobbyState.js";
import {
    CopyCodeButton,
    HostTag,
    LobbyHeader,
    LobbyIcon,
    LobbyShell,
    LobbyStateScreen,
    MeTag,
    StatusMark,
    TrailLine,
} from "../components/wiki-race/LobbyParts";

const GROUP_RULES = "3–8명 · 20분 · 무아이템 · 동일 코스";
const nameOfPlayer = (player) =>
    resolveDisplayName(buildProfileCard({ nickname: player?.nickname_snapshot }), NAME_FALLBACK.PARTICIPANT);

export default function GroupRoomPage() {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    const [room, setRoom] = useState(null);
    const [players, setPlayers] = useState([]);
    const [pending, setPending] = useState(true);
    const [submitError, setSubmitError] = useState("");
    const [starting, setStarting] = useState(false);

    const [keywordInput, setKeywordInput] = useState("");
    const [selectedTarget, setSelectedTarget] = useState(null);
    const [targetSuggestions, setTargetSuggestions] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    // 2. 모달 상태 추가
    const [selectedUserId, setSelectedUserId] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handlePlayerClick = (userId) => {
        if (!userId) return;
        setSelectedUserId(userId);
        setIsModalOpen(true);
    };

    const myPlayer = useMemo(
        () => players.find((player) => player.user_id === user?.id),
        [players, user?.id]
    );

    // 참가자 행의 칭호·아이콘 — 스냅샷을 늘리지 않고(C5-②) 대기실에서 배치 1회 조회한다 (17b).
    // 참가자 집합이 바뀔 때만 다시 부른다. 경기 중 화면(GroupGamePage)은 동결이라 대상이 아니다.
    const rewardCards = useProfileCards([user?.id, ...players.map((player) => player.user_id)]);

    const isHost = room?.host_user_id === user?.id;
    const readyCount = players.filter((player) => player.is_ready).length;
    const maxPlayers = room?.max_players ?? 8;
    // START 표시는 서버(start_group_room_game_v2)의 거부 조건을 그대로 비춘다. 판정은 서버가 한다.
    const startState = getGroupStartState({
        players,
        status: room?.status,
        myUserId: user?.id,
        nameOf: nameOfPlayer,
    });
    const canStart = isHost && startState.ok;

    // 표시 전용 상태 — 방 데이터·서비스 호출과 무관하다.
    const [rosterOpen, setRosterOpen] = useState(true);
    const [hostNotice, setHostNotice] = useState(null);
    const seenNamesRef = useRef(new Map());
    const previousHostRef = useRef(null);
    // 초기 로드(직접 진입 시 join 포함)의 진행 중 promise. 이동/로그아웃의 leave는 이것이 끝난 뒤에 보낸다.
    const initialLoadRef = useRef(null);
    players.forEach((player) => seenNamesRef.current.set(player.user_id, nameOfPlayer(player)));

    // 방장 승계는 서버 trigger가 한다. 화면은 host_user_id가 바뀐 것을 알리기만 한다.
    useEffect(() => {
        const hostId = room?.host_user_id ?? null;
        const previousHostId = previousHostRef.current;
        previousHostRef.current = hostId;
        if (!previousHostId || !hostId || previousHostId === hostId) return;
        setHostNotice({
            from: seenNamesRef.current.get(previousHostId) ?? null,
            to: seenNamesRef.current.get(hostId) ?? null,
            toMe: hostId === user?.id,
        });
    }, [room?.host_user_id, user?.id]);

    useEffect(() => {
        const loadRoom = async () => {
            if (!roomId || !user?.id) return;

            try {
                setPending(true);
                setSubmitError("");

                const roomData = await fetchGroupRoom(roomId);

                if (roomData.status === "waiting") {
                    await joinGroupRoom(roomId).catch(() => { });
                }

                const playerData = await fetchGroupRoomPlayers(roomId);

                setRoom(roomData);
                setPlayers(playerData);
            } catch (error) {
                setSubmitError(
                    error instanceof Error
                        ? error.message
                        : "단체모드 방 정보를 불러오지 못했습니다."
                );
            } finally {
                setPending(false);
            }
        };

        initialLoadRef.current = loadRoom();
    }, [roomId, user?.id]);

    useEffect(() => {
        if (!roomId || !supabase) return;

        const channel = supabase
            .channel(`group-room:${roomId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "game_rooms",
                    filter: `id=eq.${roomId}`,
                },
                async () => {
                    try {
                        const latestRoom = await fetchGroupRoom(roomId);
                        setRoom(latestRoom);
                    } catch (error) {
                        console.error("group room refresh failed:", error);
                    }
                }
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "room_players",
                    filter: `room_id=eq.${roomId}`,
                },
                async () => {
                    try {
                        const latestPlayers = await fetchGroupRoomPlayers(roomId);
                        setPlayers(latestPlayers);
                    } catch (error) {
                        console.error("group players refresh failed:", error);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [roomId]);

    useEffect(() => {
        if (!room || room.status !== "starting") return;

        const entryToken = createGroupEntryMarker({
            roomId,
            storage: sessionStorage,
        });
        navigate(`/multiplayer/group/game/${roomId}`, {
            state: { groupEntryToken: entryToken },
        });
    }, [room, roomId, navigate]);

    // 제출된 후보가 바뀔 때만 복원한다. 참가자 목록 재조회마다 다시 쓰면 "다시 선택"이 되돌아간다.
    const mySubmittedTitle = myPlayer?.submitted_target_title;
    useEffect(() => {
        if (mySubmittedTitle) {
            setKeywordInput(mySubmittedTitle);
            setSelectedTarget({
                title: mySubmittedTitle,
                snippet: "",
            });
        }
    }, [mySubmittedTitle]);

    const handleSearch = async () => {
        if (!keywordInput.trim() || myPlayer?.is_ready) return;

        try {
            setIsSearching(true);
            setSubmitError("");
            setSelectedTarget(null);

            const results = await searchWikiTitleCandidates(keywordInput.trim(), 7);
            setTargetSuggestions(results);

            if (results.length === 0) {
                setSubmitError("검색 결과가 없습니다. 다른 키워드를 입력해 주세요.");
            }
        } catch (error) {
            console.error(error);
            setSubmitError("검색 중 오류가 발생했습니다.");
        } finally {
            setIsSearching(false);
        }
    };

    const handleSelectTarget = (item) => {
        setSelectedTarget(item);
        setKeywordInput(item.title);
        setTargetSuggestions([]);
        setSubmitError("");
    };

    const handleReady = async () => {
        if (!roomId || !user?.id) return;

        if (!selectedTarget?.title) {
            setSubmitError("검색 결과에서 목표 문서를 선택해주세요.");
            return;
        }

        try {
            setSubmitError("");

            const selectedPage = await fetchPageSummary(selectedTarget.title);
            await ensureWikiSnapshot({
                title: selectedPage.canonicalTitle || selectedTarget.title,
                canonicalTitle: selectedPage.canonicalTitle || selectedTarget.title,
                pageId: selectedPage.pageId,
                revisionId: selectedPage.revisionId,
            });
            await submitGroupKeyword(roomId, {
                rawKeyword: keywordInput.trim(),
                selectedTitle: selectedTarget.title,
                selectedPageId: selectedPage.pageId,
                selectedRevisionId: selectedPage.revisionId,
            });

            const latestPlayers = await fetchGroupRoomPlayers(roomId);
            setPlayers(latestPlayers);
        } catch (error) {
            setSubmitError(
                error instanceof Error ? error.message : "준비 완료에 실패했습니다."
            );
        }
    };

    const handleUnready = async () => {
        if (!roomId || !user?.id) return;

        try {
            setSubmitError("");
            await unreadyGroupPlayer(roomId);

            const latestPlayers = await fetchGroupRoomPlayers(roomId);
            setPlayers(latestPlayers);
        } catch (error) {
            setSubmitError(
                error instanceof Error ? error.message : "준비 해제에 실패했습니다."
            );
        }
    };

    const handleStart = async () => {
        if (!roomId) return;

        try {
            setStarting(true);
            setSubmitError("");
            await startGroupRoomGame(roomId);
        } catch (error) {
            setSubmitError(
                error instanceof Error ? error.message : "단체모드 시작에 실패했습니다."
            );
        } finally {
            setStarting(false);
        }
    };

    const handleLeave = async () => {
        try {
            if (roomId && user?.id) {
                await leaveGroupRoom(roomId);
            }
        } catch (error) {
            console.error("leave group room failed:", error);
        } finally {
            navigate("/multiplayer");
        }
    };

    // 이동/로그아웃 전 leave 판정. 로딩 중 클릭이면 진행 중인 초기 join을 먼저 끝내고(그래야 leave가
    // 마지막이다), 클릭 시점의 room 상태 대신 방 상태를 다시 읽는다 — 대기실 전용 RPC다.
    const isStillWaiting = async () => {
        if (!roomId || !user?.id) return false;
        await initialLoadRef.current;
        const current = await fetchGroupRoom(roomId).catch(() => null);
        return current?.status === "waiting";
    };

    // 로그아웃은 기존 대기실 나가기 RPC를 먼저 부른다 — 대기 중일 때만.
    const handleLogout = async () => {
        try {
            if (await isStillWaiting()) await leaveGroupRoom(roomId);
        } catch (error) {
            console.error("leave group room before logout failed:", error);
        }
        await logout();
        navigate("/");
    };

    // 헤더 이동(HOME/PLAY 등)도 "방 나가기"와 같은 기존 RPC로 먼저 방을 떠난다.
    // 대기실 전용 RPC라 시작 이후에는 부르지 않는다.
    const handleNavigateAway = async (to) => {
        try {
            if (await isStillWaiting()) await leaveGroupRoom(roomId);
        } catch (error) {
            console.error("leave group room before navigation failed:", error);
        } finally {
            navigate(to);
        }
    };

    // 표시 전용: 로컬 선택만 지우고 검색으로 돌아간다. 제출/READY는 건드리지 않는다.
    const handleReselect = () => {
        setSelectedTarget(null);
        setTargetSuggestions([]);
        setSubmitError("");
    };

    if (pending || (submitError && !room)) {
        return (
            <LobbyShell user={user} onLogout={handleLogout} onNavigate={handleNavigateAway} mode="group">
                <LobbyStateScreen
                    kicker={pending ? "GROUP · 대기실" : "GROUP · ERROR"}
                    title={pending ? "그룹 대기실 불러오는 중..." : "방 정보를 불러오지 못했습니다"}
                    message={pending ? "참가자 정보를 확인하고 있습니다." : submitError}
                    error={!pending}
                    // 로딩 중 클릭: 같은 이동 정리 경로 — 초기 join 완료 → 방 상태 재조회 → waiting일 때만 leave.
                    onLeave={() => handleNavigateAway("/multiplayer")}
                    leaveLabel="← 온라인 플레이로"
                />
            </LobbyShell>
        );
    }

    const isWaiting = room?.status === "waiting";
    const meReady = !!myPlayer?.is_ready;
    const meSelected = !meReady && !!selectedTarget?.title;
    const hostPlayer = players.find((player) => player.user_id === room?.host_user_id);
    const hostName = hostPlayer ? nameOfPlayer(hostPlayer) : null;
    // 방장을 먼저, 나머지는 입장 순서 (표시 순서만).
    const orderedPlayers = [
        ...players.filter((player) => player.user_id === room?.host_user_id),
        ...players.filter((player) => player.user_id !== room?.host_user_id),
    ];
    const emptySlots = Math.max(0, maxPlayers - players.length);
    const roomCode = room?.room_code ?? roomId;

    const searchForm = (
        <>
            <form
                className="wr-target-search wr-target-search--stack"
                role="search"
                aria-label="내 문서 후보 검색"
                onSubmit={(e) => {
                    e.preventDefault();
                    handleSearch();
                }}
            >
                <label className="wr-search-field">
                    <LobbyIcon name="search" size={14} />
                    <span className="wr-visually-hidden">문서 후보 검색어</span>
                    <input
                        className="mp-room-input"
                        value={keywordInput}
                        disabled={meReady || !isWaiting}
                        placeholder="위키백과 문서 검색"
                        onChange={(e) => {
                            setKeywordInput(e.target.value);
                            setSelectedTarget(null);
                            setTargetSuggestions([]);
                            setSubmitError("");
                        }}
                    />
                </label>
                <button
                    type="submit"
                    className="wr-btn wr-btn--secondary"
                    disabled={isSearching || meReady || !keywordInput.trim()}
                >
                    {isSearching ? "검색 중..." : "검색"}
                </button>
            </form>
            {targetSuggestions.length > 0 ? (
                <ul className="wr-search-results room-target-suggestions group-suggestions" aria-label="문서 후보 검색 결과">
                    {targetSuggestions.map((item) => (
                        <li key={item.title}>
                            <button
                                type="button"
                                onClick={() => handleSelectTarget(item)}
                                className={`search-item ${selectedTarget?.title === item.title ? "active" : ""}`}
                            >
                                <span className="search-item-title">{item.title}</span>
                                <span className="search-item-snippet" dangerouslySetInnerHTML={{ __html: item.snippet || "" }} />
                                <span className="wr-search-pick" aria-hidden="true">선택</span>
                            </button>
                        </li>
                    ))}
                </ul>
            ) : (
                <span className="wr-target-help">예: 세종대왕 · 반도체 · 르네상스</span>
            )}
        </>
    );

    return (
        <LobbyShell user={user} onLogout={handleLogout} onNavigate={handleNavigateAway} mode="group">
            <LobbyHeader kicker="GROUP · 대기실" title="그룹 대기실" onLeave={handleLeave}>
                <span className="wr-head-code"><span className="wr-head-code-label">코드</span><CopyCodeButton code={roomCode} compact /></span>
                <span className="wr-rule-strip">{GROUP_RULES}</span>
            </LobbyHeader>

            {hostNotice && (
                <p className="wr-host-notice" role="status" key={`${hostNotice.from}-${hostNotice.to}`}>
                    <LobbyIcon name="leave" />
                    <span>
                        {hostNotice.from ? <>방장 <strong>{hostNotice.from}</strong> 님이 나가 </> : "방장이 나가 "}
                        {hostNotice.toMe ? <><strong>나</strong>에게 방장이 넘어왔습니다 · 시작 권한이 옮겨졌습니다</> : <><strong>{hostNotice.to ?? "다음 참가자"}</strong> 님에게 방장이 넘어왔습니다</>}
                    </span>
                </p>
            )}

            {submitError && (
                <p className="wr-lobby-error" role="alert">{submitError}</p>
            )}

            <div className="wr-group-layout">
                <aside className="wr-group-mine" aria-labelledby="wr-my-candidate-title">
                    <svg className="wr-group-leaves" width="130" height="74" viewBox="0 0 130 74" aria-hidden="true" focusable="false"><path d="M52 74 C46 50 30 38 6 40 C12 60 30 74 52 74Z" fill="#B9CFA4" /><path d="M66 74 C68 46 86 28 114 24 C110 50 94 70 66 74Z" fill="#8FAE7B" /><path d="M78 74 C82 56 100 46 130 48 L130 74Z" fill="#5F7A57" /><path d="M96 74 C100 64 112 58 130 60 L130 74Z" fill="#2F4A3D" /></svg>
                    <h2 className="wr-section-label" id="wr-my-candidate-title">MY CANDIDATE · 내 문서 후보</h2>

                    {!meReady && !meSelected && (
                        <>
                            <p className="wr-mine-lead">레이스에 사용할 문서 후보를 하나 선택하세요</p>
                            <p className="wr-mine-note">READY 시 선택한 문서가 레이스 후보 풀에 제출됩니다. 시작 시 후보 중 2개가 출발·목표 문서로 정해집니다.</p>
                            {searchForm}
                        </>
                    )}

                    {meSelected && (
                        <>
                            <span className="wr-section-label wr-section-label--hud">선택한 후보 · READY 시 제출</span>
                            <div className="wr-candidate-card group-selected-target">
                                <strong className="wr-candidate-title">{selectedTarget.title}</strong>
                                <span className="wr-candidate-desc">위키백과 문서</span>
                                <button type="button" className="wr-link-btn" onClick={handleReselect}>다시 선택</button>
                            </div>
                            <p className="wr-mine-note">READY 시 이 문서가 후보 풀에 제출되고 잠깁니다.</p>
                        </>
                    )}

                    {!meReady && (
                        <button
                            type="button"
                            className="wr-btn wr-btn--primary wr-btn--block"
                            onClick={handleReady}
                            disabled={!selectedTarget?.title || !isWaiting}
                        >
                            READY
                        </button>
                    )}

                    {meReady && (
                        <>
                            <span className="wr-section-label wr-section-label--hud">내 후보 · 잠김</span>
                            <div className="wr-candidate-card is-locked" key="locked">
                                <strong className="wr-candidate-title">{myPlayer?.submitted_target_title ?? selectedTarget?.title}</strong>
                                <span className="wr-candidate-desc">위키백과 문서</span>
                                <StatusMark tone="teal">READY</StatusMark>
                            </div>
                            <p className="wr-mine-note">후보가 잠겼습니다. 시작 시 후보 중 2개가 출발·목표 문서로 정해지며, 내 후보가 목표가 된다는 보장은 없습니다.</p>
                            <button
                                type="button"
                                className="wr-btn wr-btn--neutral wr-btn--block"
                                onClick={handleUnready}
                                disabled={!isWaiting}
                            >
                                준비 취소
                            </button>
                        </>
                    )}
                </aside>

                <div className="wr-group-main">
                    <div className="wr-party">
                        <div className="wr-party-head">
                            <span className="wr-party-count" aria-hidden="true">{players.length}<small> / {maxPlayers}</small></span>
                            <div className="wr-party-title">
                                <h2 className="wr-section-label" id="wr-party-title">EXPEDITION PARTY · 탐험대</h2>
                                {hostName && <span className="wr-party-host">방장 · <strong>{hostName}</strong></span>}
                            </div>
                            <span className="wr-party-ready" aria-hidden="true">READY {readyCount} / {players.length}</span>
                            <button
                                type="button"
                                className="wr-link-btn wr-roster-toggle"
                                aria-expanded={rosterOpen}
                                aria-controls="wr-roster"
                                onClick={() => setRosterOpen((open) => !open)}
                            >
                                {rosterOpen ? "접기" : "펼치기"}
                            </button>
                        </div>
                        <ul
                            id="wr-roster"
                            className={`wr-roster ${rosterOpen ? "" : "is-collapsed"}`}
                            aria-labelledby="wr-party-title"
                            aria-describedby="wr-roster-summary"
                        >
                            {orderedPlayers.map((player) => {
                                const isMe = player.user_id === user?.id;
                                const playerIsHost = player.user_id === room?.host_user_id;
                                // C5 §4 그룹 참가자 행 — 내 행은 로그인 세션, 남의 행은 스냅샷이 출처다.
                                const card = isMe
                                    ? mergeRewardSlots(
                                        buildProfileCard({
                                            userId: player.user_id,
                                            nickname: user?.displayName,
                                            legacyImageUrl: user?.photoURL,
                                            source: "snapshot",
                                        }),
                                        rewardCards[player.user_id]
                                    )
                                    : mergeRewardSlots(
                                        buildProfileCard({
                                            userId: player.user_id,
                                            nickname: player.nickname_snapshot,
                                            legacyImageUrl: player.profile_image_snapshot,
                                            source: "snapshot",
                                        }),
                                        rewardCards[player.user_id]
                                    );
                                return (
                                    <li key={player.id} className={`wr-roster-row ${isMe ? "wr-is-me" : ""} ${player.is_ready ? "is-ready" : ""}`}>
                                        <ProfileCard
                                            card={card}
                                            size="xs"
                                            density={DENSITY.MINIMAL}
                                            nameFallback={NAME_FALLBACK.PARTICIPANT}
                                            interactive
                                            onClick={() => handlePlayerClick(player.user_id)}
                                            nameSuffix={<>{isMe && <MeTag />}{playerIsHost && <span key={room?.host_user_id} className="wr-host-mark"><HostTag /></span>}</>}
                                        />
                                        {player.is_ready
                                            ? <StatusMark tone="teal">READY</StatusMark>
                                            : <StatusMark tone="pending">준비 중</StatusMark>}
                                    </li>
                                );
                            })}
                            {Array.from({ length: emptySlots }, (_, index) => (
                                <li key={`empty-${index}`} className="wr-roster-row wr-roster-row--empty" aria-hidden="true">
                                    <span className="wr-empty-dot" />빈 자리
                                </li>
                            ))}
                        </ul>
                        <p id="wr-roster-summary" className="wr-roster-summary">
                            참가 {players.length} / {maxPlayers} · READY {readyCount} / {players.length}
                            {emptySlots > 0 && <span className="wr-roster-empty-sm"> · 빈 자리 {emptySlots}</span>}
                        </p>
                    </div>

                    <div className="wr-course">
                        <div className="wr-course-head">
                            <h2 className="wr-section-label">SHARED COURSE · 레이스 코스</h2>
                            <span className="wr-course-count">제출된 후보 중 서로 다른 문서 {startState.distinctCount}</span>
                        </div>
                        <div className="wr-course-route" aria-hidden="true">
                            <span className="wr-route-chip">출발</span>
                            <span className="wr-course-line">
                                <TrailLine />
                                <span className="wr-course-badge">제출된 후보 → 시작 시 코스 결정</span>
                            </span>
                            <span className="wr-route-chip wr-route-chip--target"><LobbyIcon name="flag" size={10} />목표</span>
                        </div>
                        <p className="wr-course-note">후보 문서 중 2개로 출발 · 목표 결정 · 모든 참가자 동일 코스</p>
                    </div>
                </div>
            </div>

            <div className="wr-lobby-actions wr-lobby-actions--group">
                <div className="wr-lobby-reason">
                    <p className={`wr-lobby-status ${startState.ok ? "is-ok" : ""}`} id="wr-group-status" role="status">
                        {room?.status === "starting" || starting
                            ? <><LobbyIcon name="timer" size={14} />게임 시작 중...</>
                            : <><LobbyIcon name={startState.ok ? "check" : "pending"} size={13} />{startState.reason}</>}
                    </p>
                    <span className="wr-start-rules">시작 조건 · 3명 이상 · 전원 READY · 서로 다른 후보 2개 이상 · 시작은 방장만</span>
                </div>
                {isHost ? (
                    <button
                        type="button"
                        key={room?.host_user_id}
                        className="wr-btn wr-btn--primary wr-btn--lg wr-start-btn"
                        onClick={handleStart}
                        disabled={!canStart || starting}
                        aria-describedby="wr-group-status"
                    >
                        {starting ? "시작 중..." : "게임 시작"}
                    </button>
                ) : (
                    <span className="wr-wait-note"><LobbyIcon name="timer" size={14} />방장이 시작하기를 기다리는 중</span>
                )}
            </div>

            <UserProfileModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                userId={selectedUserId}
            />
        </LobbyShell>
    );
}
