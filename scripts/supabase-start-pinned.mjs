import {
  EXPECTED_CLI_VERSION,
  LEGACY_PROJECT_ID,
  expectedDbContainer,
  inspectContainer,
  parseCliArgs,
  readProjectId,
  repoRoot,
  runCli,
  runProcess,
  safeLogText,
  TARGET_PROJECT_ID,
} from './supabase-runtime-common.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const args = parseCliArgs(process.argv.slice(2));
if (args.help) {
  console.log(`사용법: npm run supabase:start -- [--legacy-container NAME]

프로젝트 고정 CLI로만 start를 실행합니다. Vector는 Wiki Race 기능 경로에서
사용하지 않는 선택적 observability 서비스이므로 공식 --exclude vector로 제외합니다.
기존 레거시 컨테이너가 남아 있으면 대상 이미지에 ACL smoke를 보내지 않고 fail-closed로 중단합니다.
`);
  process.exit(0);
}

const projectId = readProjectId();
if (projectId !== TARGET_PROJECT_ID) {
  console.error(`FAIL project_id=${projectId}; Packet 13-R2 기본 스택은 ${TARGET_PROJECT_ID}로 격리되어야 합니다.`);
  process.exit(1);
}

const postgresVersionPath = path.join(repoRoot, 'supabase', '.temp', 'postgres-version');
const postgresVersion = fs.existsSync(postgresVersionPath)
  ? fs.readFileSync(postgresVersionPath, 'utf8').trim()
  : '';
if (postgresVersion !== '17.6.1.158') {
  console.error(`FAIL CLI runtime state postgres-version=${postgresVersion || '<missing>'}; expected=17.6.1.158`);
  process.exit(1);
}

const legacyContainer = String(args['legacy-container'] || 'supabase_db_wiki');
const legacyInspect = inspectContainer(legacyContainer);
if (legacyInspect.status === 0) {
  console.error(`FAIL legacy container ${legacyContainer}가 아직 존재합니다. 이 wrapper는 기존 .104 stack을 자동 중지·삭제하지 않습니다.`);
  console.error('기존 볼륨을 보존하는 공식 supabase stop 후 다시 실행하세요.');
  process.exit(1);
}

const version = runCli(['--version']);
if (version.status !== 0 || version.stdout.trim() !== EXPECTED_CLI_VERSION) {
  console.error(`FAIL pinned CLI expected=${EXPECTED_CLI_VERSION} actual=${version.stdout.trim() || '<empty>'} exit_code=${version.status}`);
  if (version.stderr) console.error(safeLogText(version.stderr.trimEnd()));
  process.exit(1);
}

const start = runCli(['--workdir', repoRoot, 'start', '--yes', '--exclude', 'vector'], { timeout: 15 * 60_000 });
console.log(`supabase-start exit_code=${start.status}`);
if (start.stdout) console.log(safeLogText(start.stdout.trimEnd()));
if (start.stderr) console.error(safeLogText(start.stderr.trimEnd()));
if (start.status !== 0) process.exit(1);

const container = String(args.container || expectedDbContainer(projectId));
const preflight = runProcess(process.execPath, [
  pathFor('supabase-runtime-preflight.mjs'), '--bootstrap', '--container', container,
], { cwd: repoRoot, timeout: 120_000 });
console.log(`supabase-start-bootstrap-preflight exit_code=${preflight.status}`);
if (preflight.stdout) console.log(safeLogText(preflight.stdout.trimEnd()));
if (preflight.stderr) console.error(safeLogText(preflight.stderr.trimEnd()));
process.exit(preflight.status === 0 ? 0 : 1);

function pathFor(file) {
  return fileURLToPath(new URL(`./${file}`, import.meta.url));
}
