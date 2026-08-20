import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const EXPECTED_CLI_VERSION = '2.114.0';
export const EXPECTED_IMAGE = 'public.ecr.aws/supabase/postgres:17.6.1.158';
export const EXPECTED_IMAGE_ID = 'sha256:99b1729aeb0bac314445024fc149fbd39306170b61dd50800ccf180327ab3459';
export const LEGACY_PROJECT_ID = 'wiki';
export const TARGET_PROJECT_ID = 'wiki-packet13-r2-clean158';

function executable(name) {
  if (process.platform === 'win32') {
    if (name === 'docker') return 'docker.exe';
    return `${name}.cmd`;
  }
  return name;
}

export function runProcess(file, args = [], options = {}) {
  const env = {
    ...process.env,
    SUPABASE_TELEMETRY_DISABLED: '1',
    ...(options.env ?? {}),
  };
  const result = spawnSync(file, args, {
    cwd: options.cwd ?? repoRoot,
    env,
    encoding: 'utf8',
    input: options.input,
    timeout: options.timeout ?? 120_000,
    windowsHide: true,
    maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const errorText = result.error ? `${result.error.name}: ${result.error.message}` : '';
  return {
    file,
    args,
    status: typeof result.status === 'number' ? result.status : 1,
    signal: result.signal ?? null,
    stdout,
    stderr: errorText ? `${stderr}${stderr ? '\n' : ''}${errorText}` : stderr,
    timedOut: Boolean(result.error?.code === 'ETIMEDOUT'),
  };
}

export function runDocker(args, options = {}) {
  return runProcess(executable('docker'), args, options);
}

export function runPsql(container, sql, options = {}) {
  return runDocker([
    'exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-X', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-At', '-P', 'pager=off',
  ], { ...options, input: sql });
}

export function writePacket13GateMarker(container, runId, phase, options = {}) {
  if (!/^packet13-[0-9a-f-]+$/i.test(runId)) {
    return {
      status: 1,
      signal: null,
      stdout: '',
      stderr: `invalid Packet 13 gate run id: ${runId}`,
      timedOut: false,
    };
  }
  if (phase !== 'START' && phase !== 'END') {
    return {
      status: 1,
      signal: null,
      stdout: '',
      stderr: `invalid Packet 13 gate phase: ${phase}`,
      timedOut: false,
    };
  }
  const phaseLiteral = `'${phase}'`;
  const runIdLiteral = `'${runId.replaceAll("'", "''")}'`;
  const sql = `do $packet13_gate_marker$
begin
  raise log 'PACKET13_GATE_%|%', ${phaseLiteral}, ${runIdLiteral};
end
$packet13_gate_marker$;`;
  return runPsql(container, sql, options);
}

export function resolveCli() {
  const candidate = process.platform === 'win32'
    ? path.join(repoRoot, 'node_modules', 'supabase', 'dist', 'supabase.js')
    : path.join(repoRoot, 'node_modules', '.bin', 'supabase');
  if (!fs.existsSync(candidate)) {
    throw new Error(`프로젝트 고정 Supabase CLI가 없습니다: ${candidate}`);
  }
  return candidate;
}

export function runCli(args, options = {}) {
  const cliEnv = {
    SUPABASE_HOME: process.env.SUPABASE_HOME || path.join(os.tmpdir(), 'wiki-packet13-r2-clean158-supabase-cli'),
    ...(options.env ?? {}),
  };
  const cliOptions = { ...options, env: cliEnv };
  if (process.platform === 'win32') {
    return runProcess(process.execPath, [resolveCli(), ...args], cliOptions);
  }
  return runProcess(resolveCli(), args, cliOptions);
}

export function readProjectId() {
  const configPath = path.join(repoRoot, 'supabase', 'config.toml');
  const config = fs.readFileSync(configPath, 'utf8');
  const match = config.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error(`supabase/config.toml에서 project_id를 찾지 못했습니다: ${configPath}`);
  }
  return match[1];
}

export function expectedDbContainer(projectId = readProjectId()) {
  return process.env.SUPABASE_DB_CONTAINER || `supabase_db_${projectId}`;
}

export function inspectContainer(container) {
  return runDocker(['container', 'inspect', container, '--format', '{{json .}}']);
}

export function parseJsonOutput(result, label) {
  if (result.status !== 0) {
    throw new Error(`${label} 실패(exit=${result.status}): ${result.stderr.trim()}`);
  }
  try {
    return JSON.parse(result.stdout.trim());
  } catch (error) {
    throw new Error(`${label} JSON 파싱 실패: ${error.message}`);
  }
}

export function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function redacted(value) {
  return value ? '<present>' : '<absent>';
}

export function printResult(label, result) {
  console.log(`${label} exit_code=${result.status}`);
  if (result.stdout) console.log(result.stdout.trimEnd());
  if (result.stderr) console.error(result.stderr.trimEnd());
}

export function parseKeyValueLines(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

export function safeLogText(text) {
  return text
    .replace(/("?(?:ANON_KEY|SERVICE_ROLE_KEY|SECRET_KEY|PUBLISHABLE_KEY|JWT_SECRET|PASSWORD|SUPABASE_KEY|S3_PROTOCOL_ACCESS_KEY_ID|S3_PROTOCOL_ACCESS_KEY_SECRET)"?\s*[:=]\s*")([^"\r\n]*)/gi, '$1<redacted>')
    .replace(/(ANON_KEY|SERVICE_ROLE_KEY|SECRET_KEY|PUBLISHABLE_KEY|JWT_SECRET|PASSWORD|SUPABASE_KEY|S3_PROTOCOL_ACCESS_KEY_ID|S3_PROTOCOL_ACCESS_KEY_SECRET)=([^\s&]+)/gi, '$1=<redacted>')
    .replace(/(postgres(?:ql|):\/\/[^:]+:)([^@\s]+)(@)/gi, '$1<redacted>$3')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1<redacted>');
}

export function parseCliArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') args.help = true;
    else if (value.startsWith('--') && argv[index + 1] && !argv[index + 1].startsWith('--')) args[value.slice(2)] = argv[++index];
    else if (value.startsWith('--')) args[value.slice(2)] = true;
  }
  return args;
}

export function nowIso() {
  return new Date().toISOString();
}

export function osDescription() {
  return `${process.platform}/${process.arch} ${os.release()}`;
}
