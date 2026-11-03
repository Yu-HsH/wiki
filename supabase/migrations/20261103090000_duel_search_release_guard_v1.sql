-- LOCAL CANDIDATE. Install only after entry is closed and games/search drained.
begin;
do $patch$
declare definition text; anchor text;
begin
  definition:=pg_get_functiondef('private.duel_search_guard_v1(uuid,uuid,uuid)'::regprocedure);
  anchor:=E'  if r.status<>''playing'' or p.player_status<>''playing'' then';
  if position('duel_release_control_v1' in definition)>0 or
    (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'SEARCH_GUARD_DISABLE_PATCH_ANCHOR'; end if;
  definition:=replace(definition,anchor,E'  perform 1 from private.duel_release_control_v1 where singleton for share;\n  if not (select search_enabled from private.duel_release_control_v1 where singleton) then return ''SEARCH_DISABLED''; end if;\n'||anchor);
  execute definition;
end; $patch$;
commit;
