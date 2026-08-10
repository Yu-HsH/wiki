


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."can_join_room"("p_room_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.game_rooms
    where id = p_room_id
      and status = 'waiting'
      and mode in ('duel', 'group')
  );
$$;


ALTER FUNCTION "public"."can_join_room"("p_room_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_today_daily_challenge"() RETURNS TABLE("challenge_date" "date", "start_title" "text", "target_title" "text", "hint" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_today_kst date := (now() at time zone 'Asia/Seoul')::date;
  v_active_count integer;
  v_picked public.daily_challenge_pool%rowtype;
begin
  select count(*)
  into v_active_count
  from public.daily_challenge_pool
  where is_active = true;

  if v_active_count = 0 then
    raise exception 'No active daily challenge candidates';
  end if;

  select *
  into v_picked
  from public.daily_challenge_pool
  where is_active = true
  order by random()
  limit 1;

  insert into public.daily_challenges (
    challenge_date,
    start_title,
    target_title,
    hint
  )
  select
    v_today_kst,
    v_picked.start_title,
    v_picked.target_title,
    v_picked.hint
  where not exists (
    select 1
    from public.daily_challenges dc
    where dc.challenge_date = v_today_kst
  );

  return query
  select
    dc.challenge_date,
    dc.start_title,
    dc.target_title,
    dc.hint
  from public.daily_challenges dc
  where dc.challenge_date = v_today_kst;
end;
$$;


ALTER FUNCTION "public"."ensure_today_daily_challenge"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finish_group_player"("p_room_id" "uuid", "p_elapsed_seconds" integer, "p_move_count" integer, "p_current_title" "text", "p_path_titles" "text"[]) RETURNS TABLE("result_room_id" "uuid", "result_user_id" "uuid", "result_rank" integer, "result_is_winner" boolean, "result_room_status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_room public.game_rooms;
  v_player public.room_players;
  v_rank integer;
  v_finished_count integer;
  v_is_winner boolean;
begin
  select *
  into v_room
  from public.game_rooms gr
  where gr.id = p_room_id
  for update;

  if not found then
    raise exception '방을 찾을 수 없습니다.';
  end if;

  if v_room.mode <> 'group' then
    raise exception '단체모드 방이 아닙니다.';
  end if;

  if v_room.status not in ('starting', 'playing') then
    raise exception '진행 중인 방이 아닙니다.';
  end if;

  select *
  into v_player
  from public.room_players rp
  where rp.room_id = p_room_id
    and rp.user_id = auth.uid()
  for update;

  if not found then
    raise exception '참가자 정보를 찾을 수 없습니다.';
  end if;

  if v_player.has_finished = true then
    return query
    select
      p_room_id,
      auth.uid(),
      v_player.rank,
      true,
      v_room.status;
    return;
  end if;

  select count(*) + 1
  into v_rank
  from public.room_players rp
  where rp.room_id = p_room_id
    and rp.has_finished = true;

  v_is_winner := v_rank <= v_room.finish_rank_limit;

  update public.room_players rp
  set
    has_finished = true,
    finished_at = now(),
    rank = v_rank,
    elapsed_seconds = p_elapsed_seconds,
    move_count = p_move_count,
    current_title = p_current_title,
    path_titles = coalesce(p_path_titles, '{}'),
    updated_at = now()
  where rp.room_id = p_room_id
    and rp.user_id = auth.uid();

  insert into public.group_match_results (
    room_id,
    user_id,
    nickname_snapshot,
    profile_image_snapshot,
    rank,
    is_winner,
    start_title,
    target_title,
    current_title,
    move_count,
    elapsed_seconds,
    path_titles,
    finished_at
  )
  select
    rp.room_id,
    rp.user_id,
    rp.nickname_snapshot,
    rp.profile_image_snapshot,
    v_rank,
    v_is_winner,
    rp.start_title,
    rp.target_title,
    p_current_title,
    p_move_count,
    p_elapsed_seconds,
    coalesce(p_path_titles, '{}'),
    now()
  from public.room_players rp
  where rp.room_id = p_room_id
    and rp.user_id = auth.uid()
  on conflict (room_id, user_id)
  do update set
    rank = excluded.rank,
    is_winner = excluded.is_winner,
    current_title = excluded.current_title,
    move_count = excluded.move_count,
    elapsed_seconds = excluded.elapsed_seconds,
    path_titles = excluded.path_titles,
    finished_at = excluded.finished_at;

  insert into public.room_events (room_id, user_id, event_type, payload)
  values (
    p_room_id,
    auth.uid(),
    'player_finish',
    jsonb_build_object(
      'rank', v_rank,
      'elapsed_seconds', p_elapsed_seconds,
      'move_count', p_move_count
    )
  );

  select count(*)
  into v_finished_count
  from public.room_players rp
  where rp.room_id = p_room_id
    and rp.has_finished = true;

  if v_finished_count >= v_room.finish_rank_limit then
    update public.game_rooms gr
    set
      status = 'finished',
      finished_at = now(),
      finished_count = v_finished_count,
      winner_user_ids = (
        select array_agg(rp.user_id order by rp.rank asc)
        from public.room_players rp
        where rp.room_id = p_room_id
          and rp.rank is not null
          and rp.rank <= v_room.finish_rank_limit
      )
    where gr.id = p_room_id
    returning *
    into v_room;

    insert into public.room_events (room_id, user_id, event_type, payload)
    values (
      p_room_id,
      auth.uid(),
      'game_end',
      jsonb_build_object('finished_count', v_finished_count)
    );
  else
    update public.game_rooms gr
    set finished_count = v_finished_count
    where gr.id = p_room_id
    returning *
    into v_room;
  end if;

  return query
  select
    p_room_id,
    auth.uid(),
    v_rank,
    v_is_winner,
    v_room.status;
end;
$$;


ALTER FUNCTION "public"."finish_group_player"("p_room_id" "uuid", "p_elapsed_seconds" integer, "p_move_count" integer, "p_current_title" "text", "p_path_titles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_room_member"("p_room_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.room_players
    where room_id = p_room_id
      and user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_room_member"("p_room_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_room_participant"("p_room_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.room_players
    where room_id = p_room_id
      and user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_room_participant"("p_room_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."game_rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_code" "text" NOT NULL,
    "host_user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'waiting'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "mode" "text" DEFAULT 'duel'::"text" NOT NULL,
    "max_players" integer DEFAULT 2 NOT NULL,
    "min_players" integer DEFAULT 2 NOT NULL,
    "group_start_title" "text",
    "group_target_title" "text",
    "finish_rank_limit" integer DEFAULT 3 NOT NULL,
    "finished_count" integer DEFAULT 0 NOT NULL,
    "winner_user_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "use_items" boolean DEFAULT true,
    CONSTRAINT "game_rooms_group_finish_rank_check" CHECK ((("finish_rank_limit" >= 1) AND ("finish_rank_limit" <= 10))),
    CONSTRAINT "game_rooms_mode_check" CHECK (("mode" = ANY (ARRAY['duel'::"text", 'group'::"text"]))),
    CONSTRAINT "game_rooms_player_count_check" CHECK ((("min_players" >= 2) AND ("max_players" >= "min_players") AND ("max_players" <= 30))),
    CONSTRAINT "game_rooms_status_check" CHECK (("status" = ANY (ARRAY['waiting'::"text", 'starting'::"text", 'playing'::"text", 'finished'::"text"])))
);


ALTER TABLE "public"."game_rooms" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_group_room_game"("p_room_id" "uuid") RETURNS "public"."game_rooms"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_room public.game_rooms;
  v_player_count integer;
  v_ready_count integer;
  v_titles text[];
  v_start_title text;
  v_target_title text;
begin
  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception '방을 찾을 수 없습니다.';
  end if;

  if v_room.host_user_id <> auth.uid() then
    raise exception '방장만 게임을 시작할 수 있습니다.';
  end if;

  if v_room.mode <> 'group' then
    raise exception '단체모드 방이 아닙니다.';
  end if;

  if v_room.status <> 'waiting' then
    raise exception '대기 중인 방만 시작할 수 있습니다.';
  end if;

  select count(*)
  into v_player_count
  from public.room_players
  where room_id = p_room_id;

  if v_player_count < v_room.min_players then
    raise exception '최소 인원이 부족합니다.';
  end if;

  select count(*)
  into v_ready_count
  from public.room_players
  where room_id = p_room_id
    and is_ready = true
    and submitted_target_title is not null
    and length(trim(submitted_target_title)) > 0;

  if v_ready_count <> v_player_count then
    raise exception '모든 참가자가 목표 문서를 선택하고 준비해야 합니다.';
  end if;

  select array_agg(submitted_target_title order by random())
  into v_titles
  from (
    select distinct submitted_target_title
    from public.room_players
    where room_id = p_room_id
      and submitted_target_title is not null
      and length(trim(submitted_target_title)) > 0
  ) s;

  if coalesce(array_length(v_titles, 1), 0) < 2 then
    raise exception '서로 다른 목표 문서가 최소 2개 필요합니다.';
  end if;

  v_start_title := v_titles[1];
  v_target_title := v_titles[2];

  update public.game_rooms
  set
    status = 'starting',
    group_start_title = v_start_title,
    group_target_title = v_target_title,
    started_at = now(),
    finished_at = null,
    finished_count = 0,
    winner_user_ids = '{}'
  where id = p_room_id
  returning *
  into v_room;

  update public.room_players
  set
    start_title = v_start_title,
    target_title = v_target_title,
    current_title = v_start_title,
    move_count = 0,
    has_finished = false,
    finished_at = null,
    rank = null,
    elapsed_seconds = null,
    path_titles = array[v_start_title],
    updated_at = now()
  where room_id = p_room_id;

  insert into public.room_events (room_id, user_id, event_type, payload)
  values (
    p_room_id,
    auth.uid(),
    'start_group_game',
    jsonb_build_object(
      'start_title', v_start_title,
      'target_title', v_target_title
    )
  );

  return v_room;
end;
$$;


ALTER FUNCTION "public"."start_group_room_game"("p_room_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "guest_id" "text",
    "event_name" "text" NOT NULL,
    "page_path" "text",
    "mode" "text",
    "room_id" "uuid",
    "target_title" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."analytics_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_challenge_pool" (
    "sort_order" integer NOT NULL,
    "start_title" "text",
    "target_title" "text" NOT NULL,
    "hint" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."daily_challenge_pool" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_challenges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "challenge_date" "date" NOT NULL,
    "start_title" "text",
    "start_url" "text",
    "target_title" "text" NOT NULL,
    "target_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hint" "text"
);


ALTER TABLE "public"."daily_challenges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "player_name" "text" NOT NULL,
    "start_title" "text" NOT NULL,
    "target_title" "text" NOT NULL,
    "elapsed_seconds" integer NOT NULL,
    "click_count" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "path_titles" "text"[],
    CONSTRAINT "game_records_click_count_check" CHECK (("click_count" >= 0)),
    CONSTRAINT "game_records_elapsed_seconds_check" CHECK (("elapsed_seconds" >= 0))
);


ALTER TABLE "public"."game_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_match_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid",
    "user_id" "uuid",
    "rank" integer NOT NULL,
    "elapsed_seconds" integer,
    "move_count" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "group_match_history_rank_check" CHECK ((("rank" >= 1) AND ("rank" <= 99)))
);


ALTER TABLE "public"."group_match_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_match_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "nickname_snapshot" "text",
    "profile_image_snapshot" "text",
    "rank" integer,
    "is_winner" boolean DEFAULT false NOT NULL,
    "start_title" "text",
    "target_title" "text",
    "current_title" "text",
    "move_count" integer DEFAULT 0 NOT NULL,
    "elapsed_seconds" integer,
    "path_titles" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "finished_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."group_match_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."match_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "winner_user_id" "uuid",
    "loser_user_id" "uuid",
    "winner_target_title" "text",
    "loser_target_title" "text",
    "winner_start_title" "text",
    "loser_start_title" "text",
    "duration_seconds" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "match_history_duration_seconds_check" CHECK (("duration_seconds" >= 0))
);


ALTER TABLE "public"."match_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."picked" (
    "sort_order" integer,
    "start_title" "text",
    "target_title" "text",
    "hint" "text",
    "is_active" boolean,
    "created_at" timestamp with time zone
);


ALTER TABLE "public"."picked" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "nickname" "text" NOT NULL,
    "synthetic_email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "profile_image_url" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."room_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "event_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."room_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."room_players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "nickname_snapshot" "text" NOT NULL,
    "profile_image_snapshot" "text",
    "is_ready" boolean DEFAULT false NOT NULL,
    "start_title" "text",
    "target_title" "text",
    "current_title" "text",
    "move_count" integer DEFAULT 0 NOT NULL,
    "has_finished" boolean DEFAULT false NOT NULL,
    "finished_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_keyword" "text",
    "submitted_target_title" "text",
    "rank" integer,
    "elapsed_seconds" integer,
    "path_titles" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "room_players_move_count_check" CHECK (("move_count" >= 0)),
    CONSTRAINT "room_players_role_check" CHECK (("role" = ANY (ARRAY['host'::"text", 'guest'::"text"])))
);


ALTER TABLE "public"."room_players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."target_candidates" (
    "id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "summary" "text",
    "link_count" integer DEFAULT 0 NOT NULL,
    "recommended" boolean DEFAULT false NOT NULL,
    "difficulty" "text" NOT NULL,
    "familiarity_score" integer,
    "connectivity_score" integer,
    "specificity_score" integer,
    "reason" "text",
    "source" "text" DEFAULT 'wikipedia'::"text" NOT NULL,
    "evaluated_by" "text" NOT NULL,
    "evaluated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "target_candidates_connectivity_score_check" CHECK ((("connectivity_score" >= 1) AND ("connectivity_score" <= 100))),
    CONSTRAINT "target_candidates_difficulty_check" CHECK (("difficulty" = ANY (ARRAY['easy'::"text", 'medium'::"text", 'hard'::"text"]))),
    CONSTRAINT "target_candidates_familiarity_score_check" CHECK ((("familiarity_score" >= 1) AND ("familiarity_score" <= 100))),
    CONSTRAINT "target_candidates_specificity_score_check" CHECK ((("specificity_score" >= 1) AND ("specificity_score" <= 100)))
);


ALTER TABLE "public"."target_candidates" OWNER TO "postgres";


ALTER TABLE "public"."target_candidates" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."target_candidates_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_profile_stats" (
    "user_id" "uuid" NOT NULL,
    "single_success_count" integer DEFAULT 0 NOT NULL,
    "multiplayer_win_count" integer DEFAULT 0 NOT NULL,
    "multiplayer_loss_count" integer DEFAULT 0 NOT NULL,
    "group_first_count" integer DEFAULT 0 NOT NULL,
    "group_second_count" integer DEFAULT 0 NOT NULL,
    "group_third_count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_profile_stats" OWNER TO "postgres";


ALTER TABLE ONLY "public"."analytics_events"
    ADD CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_challenge_pool"
    ADD CONSTRAINT "daily_challenge_pool_pkey" PRIMARY KEY ("sort_order");



ALTER TABLE ONLY "public"."daily_challenge_pool"
    ADD CONSTRAINT "daily_challenge_pool_target_title_key" UNIQUE ("target_title");



ALTER TABLE ONLY "public"."daily_challenges"
    ADD CONSTRAINT "daily_challenges_challenge_date_key" UNIQUE ("challenge_date");



ALTER TABLE ONLY "public"."daily_challenges"
    ADD CONSTRAINT "daily_challenges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_records"
    ADD CONSTRAINT "game_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_rooms"
    ADD CONSTRAINT "game_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_rooms"
    ADD CONSTRAINT "game_rooms_room_code_key" UNIQUE ("room_code");



ALTER TABLE ONLY "public"."group_match_history"
    ADD CONSTRAINT "group_match_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_match_history"
    ADD CONSTRAINT "group_match_history_room_user_unique" UNIQUE ("room_id", "user_id");



ALTER TABLE ONLY "public"."group_match_results"
    ADD CONSTRAINT "group_match_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_match_results"
    ADD CONSTRAINT "group_match_results_room_id_user_id_key" UNIQUE ("room_id", "user_id");



ALTER TABLE ONLY "public"."match_history"
    ADD CONSTRAINT "match_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."match_history"
    ADD CONSTRAINT "match_history_room_unique" UNIQUE ("room_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_synthetic_email_key" UNIQUE ("synthetic_email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."room_events"
    ADD CONSTRAINT "room_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."room_players"
    ADD CONSTRAINT "room_players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."room_players"
    ADD CONSTRAINT "room_players_room_id_user_id_key" UNIQUE ("room_id", "user_id");



ALTER TABLE ONLY "public"."target_candidates"
    ADD CONSTRAINT "target_candidates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."target_candidates"
    ADD CONSTRAINT "target_candidates_title_key" UNIQUE ("title");



ALTER TABLE ONLY "public"."user_profile_stats"
    ADD CONSTRAINT "user_profile_stats_pkey" PRIMARY KEY ("user_id");



CREATE INDEX "idx_analytics_events_created_at" ON "public"."analytics_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_analytics_events_event_name" ON "public"."analytics_events" USING "btree" ("event_name");



CREATE INDEX "idx_analytics_events_user_id" ON "public"."analytics_events" USING "btree" ("user_id");



CREATE INDEX "idx_game_records_created_at" ON "public"."game_records" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_game_records_user_id" ON "public"."game_records" USING "btree" ("user_id");



CREATE INDEX "idx_game_rooms_room_code" ON "public"."game_rooms" USING "btree" ("room_code");



CREATE INDEX "idx_group_match_history_room_id" ON "public"."group_match_history" USING "btree" ("room_id");



CREATE INDEX "idx_group_match_history_user" ON "public"."group_match_history" USING "btree" ("user_id");



CREATE INDEX "idx_group_match_history_user_id" ON "public"."group_match_history" USING "btree" ("user_id");



CREATE INDEX "idx_group_match_results_room_rank" ON "public"."group_match_results" USING "btree" ("room_id", "rank");



CREATE INDEX "idx_group_match_results_user_created" ON "public"."group_match_results" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_match_history_loser" ON "public"."match_history" USING "btree" ("loser_user_id");



CREATE INDEX "idx_match_history_loser_user_id" ON "public"."match_history" USING "btree" ("loser_user_id");



CREATE INDEX "idx_match_history_winner" ON "public"."match_history" USING "btree" ("winner_user_id");



CREATE INDEX "idx_match_history_winner_user_id" ON "public"."match_history" USING "btree" ("winner_user_id");



CREATE INDEX "idx_room_events_room_created" ON "public"."room_events" USING "btree" ("room_id", "created_at" DESC);



CREATE INDEX "idx_room_players_room_finished" ON "public"."room_players" USING "btree" ("room_id", "has_finished", "finished_at");



CREATE INDEX "idx_room_players_room_id" ON "public"."room_players" USING "btree" ("room_id");



CREATE INDEX "idx_room_players_room_rank" ON "public"."room_players" USING "btree" ("room_id", "rank");



CREATE INDEX "idx_room_players_room_ready" ON "public"."room_players" USING "btree" ("room_id", "is_ready");



CREATE INDEX "idx_room_players_user_id" ON "public"."room_players" USING "btree" ("user_id");



CREATE INDEX "target_candidates_difficulty_idx" ON "public"."target_candidates" USING "btree" ("difficulty", "recommended", "evaluated_at" DESC);



CREATE OR REPLACE TRIGGER "set_room_players_updated_at" BEFORE UPDATE ON "public"."room_players" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_room_players_updated_at" BEFORE UPDATE ON "public"."room_players" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."analytics_events"
    ADD CONSTRAINT "analytics_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."game_records"
    ADD CONSTRAINT "game_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_rooms"
    ADD CONSTRAINT "game_rooms_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_match_history"
    ADD CONSTRAINT "group_match_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."group_match_results"
    ADD CONSTRAINT "group_match_results_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."game_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_match_results"
    ADD CONSTRAINT "group_match_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_history"
    ADD CONSTRAINT "match_history_loser_user_id_fkey" FOREIGN KEY ("loser_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."match_history"
    ADD CONSTRAINT "match_history_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."game_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_history"
    ADD CONSTRAINT "match_history_winner_user_id_fkey" FOREIGN KEY ("winner_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."room_events"
    ADD CONSTRAINT "room_events_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."game_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."room_events"
    ADD CONSTRAINT "room_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."room_players"
    ADD CONSTRAINT "room_players_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."game_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."room_players"
    ADD CONSTRAINT "room_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profile_stats"
    ADD CONSTRAINT "user_profile_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can insert analytics events" ON "public"."analytics_events" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can read daily challenges" ON "public"."daily_challenges" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can read game records" ON "public"."game_records" FOR SELECT USING (true);



CREATE POLICY "Anyone can read public profiles" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Anyone can read target candidates" ON "public"."target_candidates" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can create rooms" ON "public"."game_rooms" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "host_user_id"));



CREATE POLICY "Authenticated users can insert match history" ON "public"."match_history" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "winner_user_id") OR ("auth"."uid"() = "loser_user_id")));



CREATE POLICY "Authenticated users can join room_players" ON "public"."room_players" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND "public"."can_join_room"("room_id")));



CREATE POLICY "Authenticated users can read target candidates" ON "public"."target_candidates" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view public profile cards" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view waiting or joined rooms" ON "public"."game_rooms" FOR SELECT TO "authenticated" USING ((("status" = 'waiting'::"text") OR ("auth"."uid"() = "host_user_id") OR "public"."is_room_participant"("id")));



CREATE POLICY "Host can delete own room" ON "public"."game_rooms" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "host_user_id"));



CREATE POLICY "Players can insert group results via rpc only" ON "public"."group_match_results" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "Players can insert their own room events" ON "public"."room_events" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."room_players" "rp"
  WHERE (("rp"."room_id" = "room_events"."room_id") AND ("rp"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Players can read events in their rooms" ON "public"."room_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."room_players" "rp"
  WHERE (("rp"."room_id" = "room_events"."room_id") AND ("rp"."user_id" = "auth"."uid"())))));



CREATE POLICY "Players can read group results in their rooms" ON "public"."group_match_results" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."room_players" "rp"
  WHERE (("rp"."room_id" = "group_match_results"."room_id") AND ("rp"."user_id" = "auth"."uid"())))));



CREATE POLICY "Players can read related match history" ON "public"."match_history" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "winner_user_id") OR ("auth"."uid"() = "loser_user_id")));



CREATE POLICY "Players can update group results via rpc only" ON "public"."group_match_results" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "Players can update joined rooms" ON "public"."game_rooms" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "host_user_id") OR "public"."is_room_participant"("id"))) WITH CHECK ((("auth"."uid"() = "host_user_id") OR "public"."is_room_participant"("id")));



CREATE POLICY "Players can view joined rooms" ON "public"."game_rooms" FOR SELECT TO "authenticated" USING ((("host_user_id" = "auth"."uid"()) OR "public"."is_room_member"("id")));



CREATE POLICY "Players can view players in their room" ON "public"."room_players" FOR SELECT TO "authenticated" USING ("public"."is_room_member"("room_id"));



CREATE POLICY "Users can delete their own player row" ON "public"."room_players" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own game records" ON "public"."game_records" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own player row" ON "public"."room_players" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."analytics_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_challenge_pool" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_challenges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_rooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_match_results" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert own records" ON "public"."game_records" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."match_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."picked" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read all records" ON "public"."game_records" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."room_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."room_players" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."target_candidates" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."game_rooms";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."group_match_results";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."room_events";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."room_players";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."can_join_room"("p_room_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_join_room"("p_room_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_join_room"("p_room_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_today_daily_challenge"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_today_daily_challenge"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_today_daily_challenge"() TO "service_role";



GRANT ALL ON FUNCTION "public"."finish_group_player"("p_room_id" "uuid", "p_elapsed_seconds" integer, "p_move_count" integer, "p_current_title" "text", "p_path_titles" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."finish_group_player"("p_room_id" "uuid", "p_elapsed_seconds" integer, "p_move_count" integer, "p_current_title" "text", "p_path_titles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."finish_group_player"("p_room_id" "uuid", "p_elapsed_seconds" integer, "p_move_count" integer, "p_current_title" "text", "p_path_titles" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_room_member"("p_room_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_room_member"("p_room_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_room_member"("p_room_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_room_participant"("p_room_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_room_participant"("p_room_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_room_participant"("p_room_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."game_rooms" TO "anon";
GRANT ALL ON TABLE "public"."game_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."game_rooms" TO "service_role";



GRANT ALL ON FUNCTION "public"."start_group_room_game"("p_room_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."start_group_room_game"("p_room_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_group_room_game"("p_room_id" "uuid") TO "service_role";


















GRANT ALL ON TABLE "public"."analytics_events" TO "anon";
GRANT ALL ON TABLE "public"."analytics_events" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_events" TO "service_role";



GRANT ALL ON TABLE "public"."daily_challenge_pool" TO "anon";
GRANT ALL ON TABLE "public"."daily_challenge_pool" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_challenge_pool" TO "service_role";



GRANT ALL ON TABLE "public"."daily_challenges" TO "anon";
GRANT ALL ON TABLE "public"."daily_challenges" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_challenges" TO "service_role";



GRANT ALL ON TABLE "public"."game_records" TO "anon";
GRANT ALL ON TABLE "public"."game_records" TO "authenticated";
GRANT ALL ON TABLE "public"."game_records" TO "service_role";



GRANT ALL ON TABLE "public"."group_match_history" TO "anon";
GRANT ALL ON TABLE "public"."group_match_history" TO "authenticated";
GRANT ALL ON TABLE "public"."group_match_history" TO "service_role";



GRANT ALL ON TABLE "public"."group_match_results" TO "anon";
GRANT ALL ON TABLE "public"."group_match_results" TO "authenticated";
GRANT ALL ON TABLE "public"."group_match_results" TO "service_role";



GRANT ALL ON TABLE "public"."match_history" TO "anon";
GRANT ALL ON TABLE "public"."match_history" TO "authenticated";
GRANT ALL ON TABLE "public"."match_history" TO "service_role";



GRANT ALL ON TABLE "public"."picked" TO "anon";
GRANT ALL ON TABLE "public"."picked" TO "authenticated";
GRANT ALL ON TABLE "public"."picked" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."room_events" TO "anon";
GRANT ALL ON TABLE "public"."room_events" TO "authenticated";
GRANT ALL ON TABLE "public"."room_events" TO "service_role";



GRANT ALL ON TABLE "public"."room_players" TO "anon";
GRANT ALL ON TABLE "public"."room_players" TO "authenticated";
GRANT ALL ON TABLE "public"."room_players" TO "service_role";



GRANT ALL ON TABLE "public"."target_candidates" TO "anon";
GRANT ALL ON TABLE "public"."target_candidates" TO "authenticated";
GRANT ALL ON TABLE "public"."target_candidates" TO "service_role";



GRANT ALL ON SEQUENCE "public"."target_candidates_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."target_candidates_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."target_candidates_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_profile_stats" TO "anon";
GRANT ALL ON TABLE "public"."user_profile_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profile_stats" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































