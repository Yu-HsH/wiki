// Keep server diagnostics in logs; never render SQL, RPC names or relay errors.
export function serviceErrorMessage(error, subject = '데이터') {
  const code = error?.code;
  const last = subject.charCodeAt(subject.length - 1);
  const particle = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0 ? '을' : '를';
  if (['PGRST202', '42703', 'SERVER_CONTRACT_UNAVAILABLE'].includes(code)) {
    return `서버 준비가 완료되지 않아 ${subject}${particle} 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.`;
  }
  if (code === 'AUTH_REQUIRED' || error?.status === 401) {
    return '로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요.';
  }
  return `${subject}${particle} 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.`;
}

export async function singleStartFailure(error, data) {
  let details = data;
  if (error?.context && typeof error.context.clone === 'function') {
    try { details = await error.context.clone().json(); } catch { /* non-JSON gateway response */ }
  }
  console.error('single-run 요청 실패', { error, response: details });
  const failure = new Error(serviceErrorMessage({ code: details?.code, status: error?.context?.status }, '탐험 준비'));
  failure.code = details?.code || 'SINGLE_REQUEST_FAILED';
  failure.run = details?.run;
  return failure;
}
