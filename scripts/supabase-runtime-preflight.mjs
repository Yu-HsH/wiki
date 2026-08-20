import {
  EXPECTED_CLI_VERSION,
  EXPECTED_IMAGE,
  EXPECTED_IMAGE_ID,
  expectedDbContainer,
  inspectContainer,
  parseCliArgs,
  parseJsonOutput,
  readProjectId,
  redacted,
  runCli,
  runDocker,
  runPsql,
  safeLogText,
} from './supabase-runtime-common.mjs';
import {
  classifyChildProcessResult,
  evaluateCliVersion,
  evaluateImageIdentity,
  evaluateLogText,
  evaluateMigrationHistory,
  evaluatePostgresVersion,
  evaluatePostmasterStability,
  evaluateRepositoryDigest,
  evaluateRpcAcl,
  evaluateRpcContract,
  evaluateRuntimeHealth,
} from './supabase-runtime-validation.mjs';

const args = parseCliArgs(process.argv.slice(2));
if (args.help) {
  console.log(`사용법: node scripts/supabase-runtime-preflight.mjs [--container NAME] [--bootstrap] [--defer-log-check]

기본 모드: CLI/image/PG version/migration history/RPC catalog/ACL/재시작·로그를 모두 fail-closed 검사합니다.
--bootstrap: 새 스택 시작 직후 사용할 image·CLI·health만 검사하며, migration history가 없는 상태를 허용합니다.
--defer-log-check: 전체 과거 로그를 판정하지 않고 호출자가 보유한 START/END log-window 판정으로 위임합니다.
`);
  process.exit(0);
}

const projectId = readProjectId();
const container = String(args.container || expectedDbContainer(projectId));
const bootstrap = Boolean(args.bootstrap);
const deferLogCheck = Boolean(args['defer-log-check']);
const failures = [];

function caseLine(name, pass, detail = '') {
  console.log(`CASE ${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${detail}` : ''}`);
  if (!pass) failures.push(name);
}

function failFast(label, result) {
  caseLine(label, false, `exit_code=${result.status}`);
  if (result.stdout) console.log(safeLogText(result.stdout.trimEnd()));
  if (result.stderr) console.error(safeLogText(result.stderr.trimEnd()));
}

function inspectRuntime() {
  const result = inspectContainer(container);
  if (result.status !== 0) {
    failFast(`container/${container}`, result);
    return null;
  }
  try {
    return JSON.parse(result.stdout.trim());
  } catch (error) {
    caseLine(`container/${container}`, false, `invalid_json=${error.message}`);
    return null;
  }
}

function runtimeSnapshot(runtime) {
  return {
    image: runtime?.Config?.Image ?? '',
    imageId: runtime?.Image ?? '',
    state: runtime?.State?.Status ?? '',
    health: runtime?.State?.Health?.Status ?? '',
    restartCount: Number(runtime?.RestartCount ?? -1),
    startedAt: runtime?.State?.StartedAt ?? '',
  };
}

const cliResult = runCli(['--version']);
const cliActual = cliResult.stdout.trim();
const cliCheck = evaluateCliVersion({ status: cliResult.status, actual: cliActual }, EXPECTED_CLI_VERSION);
caseLine('cli', cliCheck.pass, cliCheck.detail);
if (cliResult.stderr) console.error(safeLogText(cliResult.stderr.trimEnd()));

const beforeRuntime = inspectRuntime();
if (!beforeRuntime) process.exit(1);
const before = runtimeSnapshot(beforeRuntime);
const imageCheck = evaluateImageIdentity(before, EXPECTED_IMAGE, EXPECTED_IMAGE_ID);
caseLine('image', imageCheck.pass, imageCheck.detail);

const digestResult = runDocker(['image', 'inspect', before.image, '--format', '{{json .RepoDigests}}']);
let repoDigests = [];
if (digestResult.status === 0) {
  try { repoDigests = JSON.parse(digestResult.stdout.trim()); } catch { repoDigests = []; }
}
const digestCheck = evaluateRepositoryDigest({ status: digestResult.status, repoDigests }, EXPECTED_IMAGE_ID);
caseLine('image-repo-digest', digestCheck.pass, digestCheck.detail);

const healthCheck = evaluateRuntimeHealth(before);
caseLine('container-health', healthCheck.pass, healthCheck.detail);

// Critical ordering: no database call, especially no denied ACL call, occurs
// until the target tag, image ID and repository digest are all approved.
if (!imageCheck.pass || !digestCheck.pass || !healthCheck.pass) {
  console.error(`REFUSED database probes: ${container} is not the approved ${EXPECTED_IMAGE} runtime.`);
  process.exit(1);
}

if (bootstrap) {
  console.log(`BOOTSTRAP PASS project=${projectId} container=${container} image=${before.image} restart_count=${before.restartCount}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

function psql(label, sql) {
  const result = runPsql(container, sql);
  if (result.status !== 0) {
    failFast(`sql/${label}`, result);
    return null;
  }
  return result.stdout.trim();
}

const versionText = psql('version', `select version() || E'\t' || current_setting('server_version') || E'\t' || pg_postmaster_start_time()::text;`);
if (versionText === null) process.exit(1);
const versionParts = versionText.split(/\r?\n/).filter(Boolean).at(-1)?.split('\t') ?? [];
const serverVersion = versionParts[1] ?? '';
const postgresCheck = evaluatePostgresVersion(serverVersion);
caseLine('postgres-version', postgresCheck.pass, `${postgresCheck.detail} postmaster=${versionParts[2] || '<empty>'}`);

const historyText = psql('migration-history', `
select coalesce(string_agg(version, ',' order by version), '') || E'\t' || count(*)::text
from supabase_migrations.schema_migrations
where version in ('20260814103000', '20260814113000', '20260814123000');
`);
if (historyText !== null) {
  const [versions = '', count = ''] = historyText.split(/\r?\n/).filter(Boolean).at(-1)?.split('\t') ?? [];
  const historyCheck = evaluateMigrationHistory({ versions, count });
  caseLine('migration-history', historyCheck.pass, historyCheck.detail);
}

const catalogText = psql('rpc-catalog', `
with f as (
  select p.*
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.oid = to_regprocedure('public.send_group_spectator_emoji_v13(uuid,text)')::oid
)
select f.oid::text || E'\t' || f.prorettype::regtype::text || E'\t' || f.proowner::regrole::text
  || E'\t' || f.provolatile::text || E'\t' || f.prosecdef::text
  || E'\t' || coalesce(array_to_string(f.proconfig, ','), '')
  || E'\t' || (select count(*)::text from pg_depend d where d.refclassid = 'pg_proc'::regclass and d.refobjid = f.oid)
from f;
`);
if (catalogText !== null) {
  const parts = catalogText.split(/\r?\n/).filter(Boolean).at(-1)?.split('\t') ?? [];
  const [oid = '', returnType = '', owner = '', volatility = '', securityDefiner = '', proconfig = '', dependencies = ''] = parts;
  const contractCheck = evaluateRpcContract({
    returnType,
    securityDefiner,
    searchPath: proconfig,
    dependencies,
  });
  caseLine('rpc-contract', Boolean(oid) && contractCheck.pass,
    `oid=${oid || '<missing>'} owner=${owner || '<missing>'} volatility=${volatility || '<missing>'} ${contractCheck.detail}`);
}

const aclText = psql('rpc-acl', `
with f as (
  select p.*
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.oid = to_regprocedure('public.send_group_spectator_emoji_v13(uuid,text)')::oid
)
select has_function_privilege('anon', f.oid, 'EXECUTE')::text
  || E'\t' || has_function_privilege('authenticated', f.oid, 'EXECUTE')::text
  || E'\t' || has_function_privilege('service_role', f.oid, 'EXECUTE')::text
  || E'\t' || coalesce((
    select bool_or(x.grantee = 0 and x.privilege_type = 'EXECUTE')
    from aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) x
  ), false)::text
from f;
`);
if (aclText !== null) {
  const [anon = '', authenticated = '', serviceRole = '', publicExecute = ''] = aclText.split(/\r?\n/).filter(Boolean).at(-1)?.split('\t') ?? [];
  const aclCheck = evaluateRpcAcl({ anon, authenticated, serviceRole, publicExecute });
  caseLine('rpc-acl', aclCheck.pass, aclCheck.detail);
}

// Do not send even a disposable denied probe if any catalog/contract check
// failed. This keeps the ACL stage fail-closed, not merely image-closed.
if (failures.length > 0) {
  console.error(`REFUSED ACL smoke: prerequisite checks failed: ${failures.join(',')}`);
  process.exit(1);
}

const guardName = `__runtime_preflight_acl_guard_${process.pid}`;
const guardSql = `
begin;
create function public.${guardName}() returns integer language sql as $$ select 1 $$;
revoke all on function public.${guardName}() from public, anon, authenticated, service_role;
set local role anon;
do $$
declare
  state text;
begin
  begin
    perform public.${guardName}();
    raise exception 'ACL probe unexpectedly succeeded';
  exception when others then
    get stacked diagnostics state = returned_sqlstate;
    if state <> '42501' then
      raise exception 'ACL probe returned SQLSTATE % instead of 42501', state;
    end if;
  end;
end
$$;
rollback;
`;
const aclSmoke = runPsql(container, guardSql);
const aclSmokeText = `${aclSmoke.stdout}\n${aclSmoke.stderr}`;
const aclSmokeCheck = classifyChildProcessResult(aclSmoke, 0);
const aclSmokePass = aclSmokeCheck.pass;
caseLine('safe-acl-denied-smoke', aclSmokePass, `sqlstate=42501 observed=transaction_guard exit_code=${aclSmoke.status}`);
if (!aclSmokePass) {
  if (aclSmoke.stdout) console.log(safeLogText(aclSmoke.stdout.trimEnd()));
  if (aclSmoke.stderr) console.error(safeLogText(aclSmoke.stderr.trimEnd()));
}

const afterRuntime = inspectRuntime();
if (!afterRuntime) process.exit(1);
const after = runtimeSnapshot(afterRuntime);
const postmasterAfter = psql('postmaster-after', 'select pg_postmaster_start_time()::text;');
const postmasterBefore = versionParts[2] ?? '';
const postmasterCheck = evaluatePostmasterStability({
  before: postmasterBefore,
  after: postmasterAfter?.split(/\r?\n/).filter(Boolean).at(-1),
  restartBefore: before.restartCount,
  restartAfter: after.restartCount,
});
caseLine('postmaster-stability', postmasterCheck.pass, postmasterCheck.detail);

if (deferLogCheck) {
  caseLine('postgres-log', true, 'deferred_to_run_scoped_window=true');
} else {
  const logs = runDocker(['logs', '--timestamps', '--tail', '500', container]);
  const logText = `${logs.stdout}\n${logs.stderr}`;
  const logCheck = evaluateLogText({ status: logs.status, text: logText });
  caseLine('postgres-log', logCheck.pass, logCheck.detail);
  if (logCheck.dangerous) console.error(safeLogText(logText));
}

console.log(`PREFLIGHT project=${projectId} container=${container} image=${before.image} image_id=${before.imageId} cli=${cliActual} anon_acl_probe=${redacted(aclSmoke.status === 0 ? '1' : '')}`);
process.exit(failures.length === 0 ? 0 : 1);
