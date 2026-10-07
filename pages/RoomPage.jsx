import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchRoom,
  fetchRoomPlayers,
  joinRoom,
  setDuelTargetV2,
  leaveRoom,
  startRoomGame,
} from "../services/multiplayerService";
import {
  fetchDistinctRandomTitle,
  fetchPageData,
  fetchPageSummary,
  normalizeTitle,
  searchWikiTitleCandidates,
} from "../services/wikiService";
import { ensureWikiSnapshot } from "../services/wikiSnapshotService";
import { useAuth } from "../authContext";
import { supabase } from "../supabaseClient";
import UserProfileModal from "../components/UserProfileModal";
import ProfileAvatar from "../components/ProfileAvatar.jsx";
import useProfileCards from "../hooks/useProfileCards.js";
import { NAME_FALLBACK, buildProfileCard, mergeRewardSlots, resolveDisplayName } from "../utils/profileCard.js";
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

/**
 * 대전 대기실 페이지
 *
 * 변경 포인트:
 * - 방장만 "검색 → 후보 선택 → 즉시 저장", 양쪽 공통 목표를 공개한다.
 * - raw keyword(keywordInput)와 실제 target_title(selectedTargetTitle)를 분리
 * - 자동 보정 / 자동 확정 제거
 */
export default function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // ----------------------------
  // 기본 상태
  // ----------------------------
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [pending, setPending] = useState(true);
  const [submitError, setSubmitError] = useState("");

  // 입력 / 선택 상태 분리
  const [keywordInput, setKeywordInput] = useState("");
  const [selectedTargetTitle, setSelectedTargetTitle] = useState("");
  const [targetSuggestions, setTargetSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [savingTarget, setSavingTarget] = useState(false);
  const [targetSaveFailed, setTargetSaveFailed] = useState(false);
  // 표시 전용: 저장된 목표가 있을 때 "변경"을 눌러 검색 입력을 다시 연 상태.
  const [changingTarget, setChangingTarget] = useState(false);
  const lobbyActionRef = useRef(false);
  // 초기 로드(직접 진입 시 join 포함)의 진행 중 promise. 이동/로그아웃의 leave는 이것이 끝난 뒤에 보낸다.
  const initialLoadRef = useRef(null);
  // 참가자 읽기 세대. 이벤트마다 다시 읽으므로 응답이 순서를 바꿔 도착할 수 있다 —
  // 마지막에 시작한 읽기만 화면에 쓴다 (SF-A2: RPC 읽기가 그 창을 넓혔다).
  const playersReadRef = useRef(0);
  const readLatestPlayers = async () => {
    const readId = ++playersReadRef.current;
    const rows = await fetchRoomPlayers(roomId);
    return readId === playersReadRef.current ? rows : null;
  };

  // 시작 버튼 로딩
  const [starting, setStarting] = useState(false);

  // 모달 상태
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handlePlayerClick = (userId) => {
    if (!userId) return;
    setSelectedUserId(userId);
    setIsModalOpen(true);
  };

  // ----------------------------
  // 초기 로드
  // ----------------------------
  useEffect(() => {
    const loadRoom = async () => {
      if (!roomId || !user?.id) return;

      try {
        setPending(true);
        setSubmitError("");

        const roomData = await fetchRoom(roomId);

        // waiting 방에 직접 진입한 guest면 join 시도
        if (roomData.status === "waiting") {
          await joinRoom(roomId, user.id).catch(() => { });
        }

        const playerData = await fetchRoomPlayers(roomId);

        setRoom(roomData);
        setPlayers(playerData);
      } catch (error) {
        setSubmitError(
          error instanceof Error ? error.message : "방 정보를 불러오지 못했습니다."
        );
      } finally {
        setPending(false);
      }
    };

    initialLoadRef.current = loadRoom();
  }, [roomId, user?.id]);

  // ----------------------------
  // Realtime 구독
  // ----------------------------
  useEffect(() => {
    if (!roomId || !supabase) return;

    const channel = supabase
      .channel(`room:${roomId}`)
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
            const latestRoom = await fetchRoom(roomId);
            setRoom(latestRoom);
          } catch (error) {
            console.error("game_rooms realtime refresh failed:", error);
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
            const latestPlayers = await readLatestPlayers();
            if (latestPlayers) setPlayers(latestPlayers);
          } catch (error) {
            console.error("room_players realtime refresh failed:", error);
          }
        }
      )
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        // Join/target changes can occur between the initial SELECT and socket
        // subscription. Refresh once when connected (also on reconnect).
        try {
          const [latestRoom, latestPlayers] = await Promise.all([
            fetchRoom(roomId), readLatestPlayers(),
          ]);
          setRoom(latestRoom);
          if (latestPlayers) setPlayers(latestPlayers);
        } catch (error) {
          console.error("room subscription refresh failed:", error);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // ----------------------------
  // players 기반 파생값
  // ----------------------------
  const hostPlayer = useMemo(
    () => players.find((player) => player.user_id === room?.host_user_id),
    [players, room?.host_user_id]
  );

  const myPlayer = useMemo(
    () => players.find((player) => player.user_id === user?.id),
    [players, user?.id]
  );

  const opponentPlayer = useMemo(
    () => players.find((player) => player.user_id !== user?.id),
    [players, user?.id]
  );

  // 참가자 칭호·레벨 — 그룹 대기실과 같은 배치 1회 조회 (17b). 실패하면 스냅샷만으로 그린다.
  const rewardCards = useProfileCards(players.map((player) => player.user_id));

  // 새 목표가 저장되면(또는 사라지면) "변경" 입력을 닫는다. 표시 상태만 바꾼다.
  useEffect(() => {
    setChangingTarget(false);
  }, [hostPlayer?.target_title]);

  const isHost = !!user?.id && room?.host_user_id === user.id;
  const hasGuest = players.length === 2 && !!hostPlayer && !!opponentPlayer;
  const hasHostTarget = !!(hostPlayer?.target_title && hostPlayer?.target_page_id);
  const canStart = isHost && hasGuest && hasHostTarget && room?.status === "waiting"
    && !savingTarget && !isSearching && !starting && !targetSaveFailed;
  const targetBusy = savingTarget || isSearching || starting;

  // ----------------------------
  // DB -> 로컬 입력값 동기화
  // - 이미 저장된 target_title이 있으면 복원
  // ----------------------------
  useEffect(() => {
    if (!isHost) return;

    if (hostPlayer?.target_title) {
      setSelectedTargetTitle(hostPlayer.target_title);
      setKeywordInput(hostPlayer.target_title);
    } else {
      setSelectedTargetTitle("");
    }
  }, [isHost, hostPlayer?.target_title]);

  // ----------------------------
  // room.status 기반 시작
  // ----------------------------
  useEffect(() => {
    if (!room || !["starting", "playing"].includes(room.status)) return;

    navigate(`/multiplayer/game/${roomId}`, {
      state: {
        myTarget: hostPlayer?.target_title || "",
        myStart: myPlayer?.start_title || "",
        opponentName: opponentPlayer?.nickname_snapshot || "상대",
      },
    });
  }, [
    room,
    roomId,
    navigate,
    hostPlayer?.target_title,
    myPlayer?.start_title,
    opponentPlayer?.nickname_snapshot,
  ]);

  // ----------------------------
  // 위키 검색 실행
  // ----------------------------
  const handleSearch = async () => {
    if (!isHost || room?.status !== "waiting" || !keywordInput.trim() || lobbyActionRef.current) return;
    lobbyActionRef.current = true;

    try {
      setIsSearching(true);
      setSubmitError("");
      setTargetSuggestions([]);
      setSelectedTargetTitle("");

      const candidates = await searchWikiTitleCandidates(keywordInput.trim(), 5);
      setTargetSuggestions(candidates);

      if (candidates.length === 0) {
        setSubmitError("검색 결과가 없습니다. 다른 키워드를 입력해 주세요.");
      }
    } catch (error) {
      console.error(error);
      setSubmitError("검색 중 오류가 발생했습니다.");
    } finally {
      setIsSearching(false);
      lobbyActionRef.current = false;
    }
  };

  // ----------------------------
  // 후보 선택
  // ----------------------------
  const handleSelectSuggestion = async (item) => {
    if (!isHost || room?.status !== "waiting" || !roomId || lobbyActionRef.current) return;
    lobbyActionRef.current = true;
    setSavingTarget(true);
    try {
      setSubmitError("");
      const targetPage = await fetchPageSummary(item.title);
      const targetIdentity = await ensureWikiSnapshot(targetPage);
      const savedPlayer = await setDuelTargetV2(roomId, {
        title: targetIdentity.canonicalTitle,
        pageId: targetIdentity.pageId,
        revisionId: targetIdentity.revisionId,
      });
      setPlayers((previous) => previous.map((player) =>
        player.user_id === savedPlayer.user_id ? savedPlayer : player
      ));
      setSelectedTargetTitle(savedPlayer.target_title);
      setKeywordInput(savedPlayer.target_title);
      setTargetSuggestions([]);
      setTargetSaveFailed(false);
    } catch (error) {
      setTargetSaveFailed(true);
      setSubmitError(
        error?.message || "목표 문서 저장에 실패했습니다. 다시 선택해주세요."
      );
    } finally {
      setSavingTarget(false);
      lobbyActionRef.current = false;
    }
  };

  // ----------------------------
  // 호스트 게임 시작
  // ----------------------------
  const handleStartGame = async () => {
    if (!canStart || !roomId || !user?.id || lobbyActionRef.current) return;
    lobbyActionRef.current = true;

    try {
      setSubmitError("");
      setStarting(true);
      const currentPlayers = await fetchRoomPlayers(roomId);
      const currentHost = currentPlayers.find((player) => player.user_id === room.host_user_id);
      if (currentPlayers.length !== 2 || !currentHost?.target_title || !currentHost?.target_page_id) {
        setPlayers(currentPlayers);
        throw new Error("참가자 2명과 방장이 고른 목표가 있어야 시작할 수 있습니다.");
      }
      const excludedTitles = new Set([normalizeTitle(currentHost.target_title)]);
      const candidateTitle = await fetchDistinctRandomTitle(excludedTitles);
      const candidatePage = await fetchPageData(candidateTitle);
      const startIdentity = await ensureWikiSnapshot(candidatePage);
      await startRoomGame(roomId, user.id, startIdentity);
    } catch (error) {
      console.error("startRoomGame failed:", error);
      setSubmitError(
        error?.message || "게임 시작에 실패했습니다."
      );
    } finally {
      setStarting(false);
      lobbyActionRef.current = false;
    }
  };

  // ----------------------------
  // 대기실 나가기
  // ----------------------------
  const handleLeaveRoom = async () => {
    try {
      if (roomId && user?.id) {
        await leaveRoom(roomId, user.id);
      }
    } catch (error) {
      console.error("leaveRoom failed:", error);
    } finally {
      navigate("/multiplayer");
    }
  };

  // 이동/로그아웃 전 leave 판정. 로딩 중 클릭이면 진행 중인 초기 join을 먼저 끝내고(그래야 leave가
  // 마지막이다), 클릭 시점의 room 상태 대신 방 상태를 다시 읽는다 — 진행 중 leave는 기권이다.
  const isStillWaiting = async () => {
    if (!roomId || !user?.id) return false;
    await initialLoadRef.current;
    const current = await fetchRoom(roomId).catch(() => null);
    return current?.status === "waiting";
  };

  // 로그아웃은 기존 대기실 나가기 RPC를 먼저 부른다 — 대기 중일 때만 (진행 중이면 기권이 된다).
  const handleLogout = async () => {
    try {
      if (await isStillWaiting()) await leaveRoom(roomId, user.id);
    } catch (error) {
      console.error("leaveRoom before logout failed:", error);
    }
    await logout();
    navigate("/");
  };

  // 헤더 이동(HOME/PLAY 등)도 "방 나가기"와 같은 기존 RPC로 먼저 방을 떠난다.
  // 시작 이후(starting/playing)에는 부르지 않는다 — 진행 중 leave는 기권이다.
  const handleNavigateAway = async (to) => {
    try {
      if (await isStillWaiting()) await leaveRoom(roomId, user.id);
    } catch (error) {
      console.error("leaveRoom before navigation failed:", error);
    } finally {
      navigate(to);
    }
  };

  // ----------------------------
  // 로딩 / 초기 로드 실패
  // ----------------------------
  if (pending || (submitError && !room)) {
    return (
      <LobbyShell user={user} onLogout={handleLogout} onNavigate={handleNavigateAway} mode="duel">
        <LobbyStateScreen
          kicker={pending ? "1:1 DUEL · 대기실" : "1:1 DUEL · ERROR"}
          title={pending ? "대기실 불러오는 중..." : "방 정보를 불러오지 못했습니다"}
          message={pending ? "플레이어 정보와 방 상태를 확인하고 있습니다" : submitError}
          error={!pending}
          // 로딩 중 클릭: 같은 이동 정리 경로 — 초기 join 완료 → 방 상태 재조회 → waiting일 때만 leave.
          onLeave={() => handleNavigateAway("/multiplayer")}
          leaveLabel="← 온라인 플레이로"
        />
      </LobbyShell>
    );
  }

  const isWaiting = room?.status === "waiting";
  const isStarting = starting || room?.status === "starting";
  const roomCode = room?.room_code ?? roomId;
  const targetTitle = hostPlayer?.target_title || "";
  const nonHostPlayer = players.find((player) => player.user_id !== room?.host_user_id);
  const showTargetSearch = isHost && isWaiting && (!hasHostTarget || changingTarget);
  const statusText = !isHost
    ? hostPlayer ? "두 탐험가 입장" : "상대를 기다리는 중"
    : !hasGuest && !hasHostTarget ? "상대 대기 · 목표 문서 미선택"
      : !hasGuest ? "상대를 기다리는 중 · 입장하면 시작할 수 있습니다"
        : !hasHostTarget ? "상대 입장 · 목표 문서를 선택하면 시작할 수 있습니다"
          : "상대가 입장했습니다 · 시작할 수 있습니다";

  const renderPlayer = (player, slot) => {
    if (!player) {
      return (
        <li className="wr-duel-player wr-duel-player--empty" key={`empty-${slot}`}>
          <span className="wr-duel-empty-ring"><LobbyIcon name="pending" size={16} /></span>
          <span className="wr-duel-player-text">
            <span className="wr-duel-empty-title">빈 자리</span>
            <span className="wr-duel-empty-hint">상대를 기다리는 중 · 방 코드를 공유하세요</span>
          </span>
        </li>
      );
    }
    const isMe = player.user_id === user?.id;
    const playerIsHost = player.user_id === room?.host_user_id;
    const card = mergeRewardSlots(
      buildProfileCard({
        userId: player.user_id,
        nickname: player.nickname_snapshot,
        legacyImageUrl: player.profile_image_snapshot,
        source: "snapshot",
      }),
      rewardCards[player.user_id]
    );
    const name = resolveDisplayName(card, NAME_FALLBACK.PARTICIPANT);
    return (
      <li className={`wr-duel-player ${isMe ? "wr-is-me" : ""}`} key={player.user_id}>
        <span className="wr-duel-player-tags">
          {playerIsHost && <HostTag />}
          {isMe && <MeTag />}
        </span>
        <ProfileAvatar card={card} size="lg" nameFallback={NAME_FALLBACK.PARTICIPANT} className="wr-duel-avatar" />
        <span className="wr-duel-player-text">
          <button type="button" className="wr-name-btn" onClick={() => handlePlayerClick(player.user_id)} aria-label={`${name} 프로필 보기`}>
            {name}
          </button>
          {(card.level != null || card.title) && (
            <span className="wr-duel-player-meta">
              {card.level != null && <span className="wr-duel-level">Lv.{card.level}</span>}
              {card.title && <span className="wr-title-badge">{card.title.displayName}</span>}
            </span>
          )}
        </span>
        <StatusMark tone="teal">입장 완료</StatusMark>
      </li>
    );
  };

  return (
    <LobbyShell user={user} onLogout={handleLogout} onNavigate={handleNavigateAway} mode="duel">
      <LobbyHeader kicker="1:1 DUEL · 대기실" title="1:1 대기실" onLeave={handleLeaveRoom} />

      <div className="wr-duel-stage">
        <h2 className="wr-visually-hidden">참가자</h2>
        <ul className="wr-duel-players" aria-label={`참가자 ${players.length} / 2`}>
          {renderPlayer(hostPlayer, "a")}
          <li className="wr-duel-center" aria-hidden="true">
            <span className="wr-duel-center-trail"><TrailLine /></span>
            <span key={`flag-${targetTitle}`} className={`wr-target-flag ${targetTitle ? "is-set" : ""}`}><LobbyIcon name="flag" size={18} /></span>
            <span className="wr-duel-center-label">목표 문서</span>
            {targetTitle
              ? <span key={`title-${targetTitle}`} className="wr-duel-center-title">{targetTitle}</span>
              : <span className="wr-duel-center-empty">{isHost ? "미선택" : "방장이 고르는 중"}</span>}
          </li>
          {renderPlayer(nonHostPlayer, "b")}
        </ul>
      </div>

      <div className="wr-duel-target room-target-section">
        <h2 className="wr-section-label">TARGET · 목표 문서</h2>
        {isHost ? (
          <div className="wr-duel-target-body">
            {hasHostTarget && !showTargetSearch && (
              <div className="wr-target-chosen">
                <span key={targetTitle} className="wr-gold-pill"><LobbyIcon name="flag" size={11} />{targetTitle}</span>
                {isWaiting && (
                  <button type="button" className="wr-link-btn" disabled={targetBusy} onClick={() => setChangingTarget(true)} aria-label="목표 문서 변경">
                    변경
                  </button>
                )}
                <span className="wr-visually-hidden">방장이 고른 목표: {targetTitle}</span>
              </div>
            )}
            {showTargetSearch && (
              <form
                className="wr-target-search"
                role="search"
                aria-label="목표 문서 검색"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSearch();
                }}
              >
                <label className="wr-search-field">
                  <LobbyIcon name="search" size={14} />
                  <span className="wr-visually-hidden">목표 문서 검색어</span>
                  <input
                    className="room-target-input"
                    type="text"
                    placeholder="위키백과 문서 검색"
                    value={keywordInput}
                    disabled={targetBusy || !isWaiting}
                    autoFocus={changingTarget}
                    onChange={(e) => {
                      setKeywordInput(e.target.value);
                      setSubmitError("");
                      setTargetSuggestions([]);
                      setSelectedTargetTitle("");
                    }}
                  />
                </label>
                <button type="submit" className="wr-btn wr-btn--secondary" disabled={targetBusy || !isWaiting}>
                  {isSearching ? "검색 중..." : "검색"}
                </button>
                {changingTarget && hasHostTarget && (
                  <button type="button" className="wr-link-btn" onClick={() => { setChangingTarget(false); setTargetSuggestions([]); }}>
                    취소
                  </button>
                )}
                <span className="wr-target-help">이번 대전의 목표 문서를 선택하세요</span>
              </form>
            )}
          </div>
        ) : (
          <div className="wr-duel-target-body">
            {hostPlayer?.target_title ? (
              <p key={hostPlayer.target_title} className="wr-target-read" role="status">
                방장이 고른 목표: <strong className="wr-gold-pill">{hostPlayer.target_title}</strong>
              </p>
            ) : (
              <p className="wr-target-pending" role="status">
                <LobbyIcon name="pending" size={12} />방장이 목표를 고르는 중
              </p>
            )}
          </div>
        )}
        <span className="wr-target-note">시작 문서는 경기 시작 시 결정됩니다</span>

        {/* 검색 결과 후보 */}
        {showTargetSearch && targetSuggestions.length > 0 && (
          <ul className="wr-search-results" aria-label="목표 문서 검색 결과">
            {targetSuggestions.map((item) => (
              <li key={item.title}>
                <button
                  type="button"
                  disabled={targetBusy || !isWaiting}
                  onClick={() => handleSelectSuggestion(item)}
                  className={`search-item ${selectedTargetTitle === item.title ? "selected" : ""}`}
                >
                  <span className="search-item-title">{item.title}</span>
                  <span
                    className="search-item-snippet"
                    dangerouslySetInnerHTML={{ __html: item.snippet || "" }}
                  />
                  <span className="wr-search-pick" aria-hidden="true">선택</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {savingTarget && <p className="wr-lobby-muted" role="status">목표 문서 저장 중...</p>}
      </div>

      <dl className="wr-duel-setup">
        <div><dt>경기 규칙</dt><dd>{room?.use_items === false ? "아이템 없음" : "아이템전"}</dd></div>
        <div><dt>방 코드</dt><dd><CopyCodeButton code={roomCode} /></dd></div>
      </dl>

      {submitError && room && (
        <p className="wr-lobby-error" role="alert">{submitError}</p>
      )}

      <div className="wr-lobby-actions">
        <span className="wr-lobby-count">{players.length} / 2</span>
        <p className="wr-lobby-status" id="wr-duel-status" role="status">
          {isStarting
            ? <><LobbyIcon name="timer" size={14} />게임 시작 중...</>
            : <><LobbyIcon name={hasGuest ? "check" : "pending"} size={13} />{statusText}</>}
        </p>
        {isHost && isWaiting && (
          <button
            type="button"
            className="wr-btn wr-btn--primary wr-btn--lg"
            onClick={handleStartGame}
            disabled={!canStart}
            aria-describedby="wr-duel-status"
          >
            {starting ? "시작 중..." : "게임 시작"}
          </button>
        )}
        {!isHost && isWaiting && (
          <span className="wr-wait-note"><LobbyIcon name="timer" size={14} />시작은 방장만 · 방장이 시작하기를 기다리는 중</span>
        )}
      </div>

      {/* 모달 렌더링 */}
      <UserProfileModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        userId={selectedUserId}
      />
    </LobbyShell>
  );
}
