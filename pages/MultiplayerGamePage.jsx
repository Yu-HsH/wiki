import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  fetchRoom,
  fetchRoomPlayers,
  updateMyGameProgress,
  updateGameRoomStatus,
} from "../services/multiplayerService";

import {
  fetchDistinctRandomTitle,
  fetchPageData,
  normalizeTitle,
} from "../services/wikiService";

import { supabase } from "../supabaseClient";
import { useAuth } from "../authContext";

// 이미 싱글플레이에서 쓰고 있는 컴포넌트 재사용
import CountdownOverlay from "../components/CountdownOverlay";
import ScrollToTopButton from "../components/ScrollToTopButton";
import WikiViewer from "../components/WikiViewer";

// 새로 추가한 VS 인트로 컴포넌트
import VsIntroOverlay from "../components/VsIntroOverlay";

/**
 * 멀티플레이 게임 페이지
 *
 * 현재 역할:
 * 1) room / room_players 실시간 반영
 * 2) 각 플레이어 시작 문서(start_title) 생성
 * 3) current_title / move_count 반영
 * 4) 목표 도달 시 승패 처리
 * 5) VS 인트로 -> 카운트다운 -> 플레이 순서 연출
 */
export default function MultiplayerGamePage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // ----------------------------
  // 게임 진행 phase
  // ----------------------------
  const PHASE = {
    LOADING: "LOADING",
    VS_INTRO: "VS_INTRO",
    COUNTDOWN: "COUNTDOWN",
    PLAYING: "PLAYING",
    SUCCESS: "SUCCESS",
    OPPONENT_WIN: "OPPONENT_WIN",
  };

  // ----------------------------
  // 상태
  // ----------------------------
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [pageData, setPageData] = useState(null);

  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");

  const [phase, setPhase] = useState(PHASE.LOADING);

  // ----------------------------
  // players 기반 파생값
  // ----------------------------
  const myPlayer = useMemo(
    () => players.find((p) => p.user_id === user?.id),
    [players, user?.id]
  );

  const opponentPlayer = useMemo(
    () => players.find((p) => p.user_id !== user?.id),
    [players, user?.id]
  );

  /**
   * 중요:
   * - 내가 풀어야 할 목표는 상대가 대기실에서 적은 target_title
   * - 상대가 풀어야 할 목표는 내가 적은 target_title
   */
  const myTarget = opponentPlayer?.target_title || "";
  const opponentTarget = myPlayer?.target_title || "";

  // ----------------------------
  // Realtime 구독
  // ----------------------------
  useEffect(() => {
    if (!roomId || !supabase) return;

    const channel = supabase
      .channel(`game:${roomId}`)

      // 방 상태 변경 감지
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
          } catch (err) {
            console.error("game_rooms realtime refresh failed:", err);
          }
        }
      )

      // 플레이어 상태 변경 감지
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
            const latestPlayers = await fetchRoomPlayers(roomId);
            setPlayers(latestPlayers);
          } catch (err) {
            console.error("room_players realtime refresh failed:", err);
          }
        }
      )

      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // ----------------------------
  // 초기 로드 + 시작 문서 세팅
  // ----------------------------
  useEffect(() => {
    const initGame = async () => {
      if (!roomId || !user?.id) return;

      try {
        setPending(true);
        setError("");

        const roomData = await fetchRoom(roomId);
        const playerData = await fetchRoomPlayers(roomId);

        setRoom(roomData);
        setPlayers(playerData);

        const me = playerData.find((p) => p.user_id === user.id);
        const opponent = playerData.find((p) => p.user_id !== user.id);

        if (!me || !opponent) {
          throw new Error("플레이어 정보를 찾지 못했습니다.");
        }

        const targetToSolve = opponent.target_title;
        if (!targetToSolve) {
          throw new Error("상대 목표 문서가 설정되지 않았습니다.");
        }

        /**
         * 아직 내 시작 문서가 없으면 여기서 생성
         * - 내가 풀어야 할 목표와 같은 문서는 제외
         */
        if (!me.start_title || !me.current_title) {
          const excluded = new Set([normalizeTitle(targetToSolve)]);
          const startTitle = await fetchDistinctRandomTitle(excluded);

          await updateMyGameProgress(roomId, user.id, {
            start_title: startTitle,
            current_title: startTitle,
            move_count: 0,
            has_finished: false,
            finished_at: null,
          });

          const refreshedPlayers = await fetchRoomPlayers(roomId);
          setPlayers(refreshedPlayers);

          const refreshedMe = refreshedPlayers.find((p) => p.user_id === user.id);
          if (!refreshedMe?.current_title) {
            throw new Error("시작 문서를 설정하지 못했습니다.");
          }

          const firstPage = await fetchPageData(refreshedMe.current_title);
          setPageData(firstPage);
        } else {
          const firstPage = await fetchPageData(me.current_title);
          setPageData(firstPage);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "게임 초기화에 실패했습니다.");
      } finally {
        setPending(false);
      }
    };

    initGame();
  }, [roomId, user?.id]);

  // ----------------------------
  // 양쪽 초기화 완료되면:
  // starting -> VS_INTRO -> COUNTDOWN -> PLAYING
  // ----------------------------
  useEffect(() => {
    if (!room || !myPlayer || !opponentPlayer) return;

    const bothInitialized =
      !!myPlayer.start_title &&
      !!myPlayer.current_title &&
      !!opponentPlayer.start_title &&
      !!opponentPlayer.current_title;

    if (!bothInitialized) return;

    // 아직 starting 상태면 playing 으로 전환
    if (room.status === "starting") {
      updateGameRoomStatus(roomId, { status: "playing" }).catch(console.error);
      return;
    }

    // 이미 playing이면 VS 인트로부터 시작
    if (room.status === "playing" && phase === PHASE.LOADING) {
      setPhase(PHASE.VS_INTRO);
    }
  }, [room, myPlayer, opponentPlayer, roomId, phase]);

  // ----------------------------
  // VS 인트로 -> 카운트다운
  // ----------------------------
  useEffect(() => {
    if (phase !== PHASE.VS_INTRO) return;

    const timer = setTimeout(() => {
      setPhase(PHASE.COUNTDOWN);
    }, 1600);

    return () => clearTimeout(timer);
  }, [phase]);

  // ----------------------------
  // 링크 클릭 시 이동 처리
  // ----------------------------
  const handleMove = async (nextTitle) => {
    if (!roomId || !user?.id || phase !== PHASE.PLAYING) return;

    try {
      const nextPage = await fetchPageData(nextTitle);
      setPageData(nextPage);

      const nextMoveCount = (myPlayer?.move_count || 0) + 1;

      // 현재 문서 / 이동 횟수 반영
      await updateMyGameProgress(roomId, user.id, {
        current_title: nextPage.title,
        move_count: nextMoveCount,
      });

      // 목표 도달 체크
      const solved =
        normalizeTitle(nextPage.title) === normalizeTitle(myTarget);

      if (solved) {
        const finishedAt = new Date().toISOString();

        await updateMyGameProgress(roomId, user.id, {
          current_title: nextPage.title,
          move_count: nextMoveCount,
          has_finished: true,
          finished_at: finishedAt,
        });

        await updateGameRoomStatus(roomId, {
          status: "finished",
          finished_at: finishedAt,
        });

        setPhase(PHASE.SUCCESS);

        // 잠시 뒤 메인으로 복귀
        setTimeout(() => {
          navigate("/");
        }, 2200);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "문서 이동에 실패했습니다.");
    }
  };

  // ----------------------------
  // 상대가 먼저 도착했는지 감지
  // ----------------------------
  useEffect(() => {
    if (!opponentPlayer?.has_finished) return;
    if (myPlayer?.has_finished) return;

    setPhase(PHASE.OPPONENT_WIN);

    setTimeout(() => {
      navigate("/");
    }, 2200);
  }, [opponentPlayer?.has_finished, myPlayer?.has_finished, navigate]);

  // ----------------------------
  // 로딩 / 에러 화면
  // ----------------------------
  if (pending) {
    return (
      <div className="mp-game-page">
        <div className="mp-game-loading">게임 준비 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mp-game-page">
        <div className="mp-game-error">에러: {error}</div>
      </div>
    );
  }

  return (
    <div className="mp-game-page">
      {/* VS 인트로 */}
      {phase === PHASE.VS_INTRO && (
        <VsIntroOverlay
          myName={myPlayer?.nickname_snapshot || "나"}
          opponentName={opponentPlayer?.nickname_snapshot || "상대"}
          myTarget={myTarget}
          opponentTarget={opponentTarget}
          myInitial={(myPlayer?.nickname_snapshot || "나").charAt(0).toUpperCase()}
          opponentInitial={(opponentPlayer?.nickname_snapshot || "상대")
            .charAt(0)
            .toUpperCase()}
        />
      )}

      {/* 기존 카운트다운 재사용 */}
      {phase === PHASE.COUNTDOWN && (
        <CountdownOverlay onComplete={() => setPhase(PHASE.PLAYING)} />
      )}

      {/* 상단 HUD */}
      <div className="mp-game-topbar">
        <div className="mp-game-goal">
          <span className="mp-game-goal-label">내 목표</span>
          <span className="mp-game-goal-value">{myTarget || "..."}</span>
        </div>

        <div className="mp-game-status">
          {phase === PHASE.PLAYING && "레이스 진행 중"}
          {phase === PHASE.SUCCESS && "승리!"}
          {phase === PHASE.OPPONENT_WIN && "패배"}
        </div>
      </div>

      <div className="mp-game-layout">
        {/* 메인 문서 영역 */}
        <div className="mp-game-main">
          {pageData && (
            <WikiViewer
              title={pageData.title}
              contentHtml={pageData.contentHtml}
              links={pageData.links}
              onLinkClick={handleMove}
              disabled={phase !== PHASE.PLAYING}
            />
          )}
        </div>

        {/* 상대 상태 패널 */}
        <aside className="mp-opponent-panel">
          <div className="mp-opponent-header">
            <div className="mp-opponent-avatar">
              {(opponentPlayer?.nickname_snapshot || "상대")
                .charAt(0)
                .toUpperCase()}
            </div>

            <div>
              <div className="mp-opponent-name">
                {opponentPlayer?.nickname_snapshot || "상대"}
              </div>
              <div className="mp-opponent-sub">
                {opponentPlayer?.has_finished ? "도착 완료!" : "레이싱 중..."}
              </div>
            </div>
          </div>

          <div className="mp-opponent-box">
            <div className="mp-opponent-label">상대 목표</div>
            <div className="mp-opponent-value">
              {opponentTarget || "설정 중..."}
            </div>
          </div>

          <div className="mp-opponent-box">
            <div className="mp-opponent-label">현재 문서</div>
            <div className="mp-opponent-value">
              {opponentPlayer?.current_title || "준비 중..."}
            </div>
          </div>

          <div className="mp-opponent-box">
            <div className="mp-opponent-label">이동 횟수</div>
            <div className="mp-opponent-value">
              {opponentPlayer?.move_count || 0}회
            </div>
          </div>
        </aside>
      </div>

      {/* 결과 오버레이 */}
      {phase === PHASE.SUCCESS && (
        <div className="mp-result-overlay">
          <div className="mp-result-card">
            <h2>🎉 승리!</h2>
            <p>목표 문서에 먼저 도착했습니다.</p>
          </div>
        </div>
      )}

      {phase === PHASE.OPPONENT_WIN && (
        <div className="mp-result-overlay">
          <div className="mp-result-card">
            <h2>😢 패배</h2>
            <p>상대가 먼저 목표 문서에 도착했습니다.</p>
          </div>
        </div>
      )}

      <ScrollToTopButton />
    </div>
  );
}