-- S5 event isolation contract. No operational roles, data or production
-- settings are modified: all catalog assertions run in a rollback scope.
BEGIN;
SELECT plan(13);

SELECT ok(EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='ink_product_events'),
  'S5 event schema exists separately from private game data');
SELECT ok(has_schema_privilege('authenticated','ink_product_events','USAGE'),
  'authenticated may subscribe to event schema');
SELECT ok(NOT has_schema_privilege('anon','ink_product_events','USAGE'),
  'anonymous users cannot subscribe to S5 event schema');
SELECT ok(has_table_privilege('authenticated','ink_product_events.signals_v1','SELECT'),
  'authenticated may read their own signals under RLS');
SELECT ok(has_table_privilege('authenticated','ink_product_events.emotes_v1','SELECT'),
  'authenticated may read their own emotes under RLS');
SELECT ok(NOT has_table_privilege('authenticated','ink_product_events.signals_v1','INSERT,UPDATE,DELETE'),
  'clients cannot emit or rewrite game signals');
SELECT ok(NOT has_table_privilege('authenticated','ink_product_events.emotes_v1','INSERT,UPDATE,DELETE'),
  'clients cannot forge Kion deliveries');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='ink_product_events.signals_v1'::regclass)
  AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='ink_product_events'
    AND tablename='signals_v1' AND policyname='s5_signal_recipient'),
  'signal SELECT requires recipient RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='ink_product_events.emotes_v1'::regclass)
  AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='ink_product_events'
    AND tablename='emotes_v1' AND policyname='s5_emote_recipient'),
  'emote SELECT requires recipient RLS');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
  OR EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime'
    AND schemaname='ink_product_events' AND tablename='signals_v1'),
  'signals table participates in available Supabase publication');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
  OR EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime'
    AND schemaname='ink_product_events' AND tablename='emotes_v1'),
  'emotes table participates in available Supabase publication');
SELECT ok(has_function_privilege('authenticated','public.send_group_items_kion_v1(uuid,text)','EXECUTE')
  AND has_function_privilege('authenticated','public.get_group_items_kion_v1(uuid)','EXECUTE'),
  'only authenticated users may call the Kion API');
SELECT ok(NOT has_function_privilege('anon','public.send_group_items_kion_v1(uuid,text)','EXECUTE')
  AND NOT has_function_privilege('anon','public.get_group_items_kion_v1(uuid)','EXECUTE'),
  'anonymous users cannot call S5 Kion endpoints');

SELECT * FROM finish();
ROLLBACK;
