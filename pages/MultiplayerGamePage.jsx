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

/**
 * ===============================
 * MultiplayerGamePage
 * ===============================
 *
 * 역할:
 * 1. 게임 시작 시 각 플레이어 start_title 설정
 * 2. current_title / move_count 실시간 동기화
 * 3. 목표 도달 시 승패 처리
 * 4. Realtime으로 상대 상태 반영
 *
 * 핵심 DB 컬럼:
 * - start_title
 * - current_title
 * - move_count
 * - has_finished
 * - finished_at
 */

export default function MultiplayerGamePage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // ----------------------------
  // 상태
  // ----------------------------
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [pageData, setPageData] = useState(null);

  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");

  const [phase, setPhase] = useState("LOADING");
  // LOADING → PLAYING → SUCCESS / OPPONENT_WIN

  // ----------------------------
  // 파생값
  // ----------------------------
  const myPlayer = useMemo(
    () => players.find((p) => p.user_id === user?.id),
    [players, user?.id]
  );

  const opponentPlayer = useMemo(
    () => players.find((p) => p.user_id !== user?.id),
    [players, user?.id]
  );

  // 🔥 중요: 상대가 설정한 target이 내가 풀어야 할 문제
  const myTarget = opponentPlayer?.target_title || "";
  const opponentTarget = myPlayer?.target_title || "";

  // ----------------------------
  // Realtime 구독
  // ----------------------------
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`game:${roomId}`)

      // 방 상태 변경
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_rooms",
          filter: `id=eq.${roomId}`,
        },
        async () => {
          const latest = await fetchRoom(roomId);
          setRoom(latest);
        }
      )

      // 플레이어 상태 변경
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_players",
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          const latest = await fetchRoomPlayers(roomId);
          setPlayers(latest);
        }
      )

      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [roomId]);

  // ----------------------------
  // 초기 로딩 + 시작 문서 설정
  // ----------------------------
  useEffect(() => {
    const init = async () => {
      if (!roomId || !user?.id) return;

      try {
        setPending(true);

        const roomData = await fetchRoom(roomId);
        const playerData = await fetchRoomPlayers(roomId);

        setRoom(roomData);
        setPlayers(playerData);

        const me = playerData.find((p) => p.user_id === user.id);
        const opponent = playerData.find((p) => p.user_id !== user.id);

        if (!me || !opponent) {
          throw new Error("플레이어 정보 없음");
        }

        const targetToSolve = opponent.target_title;

        // 🔥 아직 시작 안한 경우 → start_title 생성
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

          // 다시 불러오기
          const refreshed = await fetchRoomPlayers(roomId);
          setPlayers(refreshed);

          const me2 = refreshed.find((p) => p.user_id === user.id);

          const firstPage = await fetchPageData(me2.current_title);
          setPageData(firstPage);
        } else {
          const firstPage = await fetchPageData(me.current_title);
          setPageData(firstPage);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setPending(false);
      }
    };

    init();
  }, [roomId, user?.id]);

  // ----------------------------
  // 양쪽 준비 완료 → PLAYING 전환
  // ----------------------------
  useEffect(() => {
    if (!room || !myPlayer || !opponentPlayer) return;

    const ready =
      myPlayer.start_title &&
      opponentPlayer.start_title &&
      myPlayer.current_title &&
      opponentPlayer.current_title;

    if (!ready) return;

    if (room.status === "starting") {
      updateGameRoomStatus(roomId, { status: "playing" });
    }

    if (room.status === "playing") {
      setPhase("PLAYING");
    }
  }, [room, myPlayer, opponentPlayer]);

  // ----------------------------
  // 이동 처리
  // ----------------------------
  const handleMove = async (title) => {
    if (phase !== "PLAYING") return;

    try {
      const next = await fetchPageData(title);
      setPageData(next);

      const nextCount = (myPlayer?.move_count || 0) + 1;

      await updateMyGameProgress(roomId, user.id, {
        current_title: next.title,
        move_count: nextCount,
      });

      // 🔥 목표 도달 체크
      if (normalizeTitle(next.title) === normalizeTitle(myTarget)) {
        const now = new Date().toISOString();

        await updateMyGameProgress(roomId, user.id, {
          current_title: next.title,
          move_count: nextCount,
          has_finished: true,
          finished_at: now,
        });

        await updateGameRoomStatus(roomId, {
          status: "finished",
          finished_at: now,
        });

        setPhase("SUCCESS");
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // ----------------------------
  // 상대 승리 감지
  // ----------------------------
  useEffect(() => {
    if (!opponentPlayer?.has_finished) return;
    if (myPlayer?.has_finished) return;

    setPhase("OPPONENT_WIN");
  }, [opponentPlayer?.has_finished]);

  // ----------------------------
  // UI
  // ----------------------------
  if (pending) return <div>로딩중...</div>;
  if (error) return <div>에러: {error}</div>;

  return (
    <div style={{ padding: 20 }}>
      <h2>멀티플레이 게임</h2>

      <p>내 목표: {myTarget}</p>
      <p>상대 목표: {opponentTarget}</p>

      <p>내 이동 수: {myPlayer?.move_count || 0}</p>
      <p>상대 이동 수: {opponentPlayer?.move_count || 0}</p>

      <hr />

      {phase === "SUCCESS" && <h2>🎉 승리!</h2>}
      {phase === "OPPONENT_WIN" && <h2>😢 패배...</h2>}

      {pageData && (
        <div>
          <h3>{pageData.title}</h3>

          <ul>
            {pageData.links.slice(0, 20).map((link) => (
              <li key={link}>
                <button onClick={() => handleMove(link)}>
                  {link}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}