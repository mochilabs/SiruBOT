import type { FastifyInstance } from 'fastify';

/**
 * 자체 모니터링 대시보드 — 서드파티 0, 의존성 0.
 * HTML 1파일이 5초마다 /v1/status를 폴링해 그려요.
 * AUTH_KEY가 있으면 페이지 진입 시 프롬프트로 받아 localStorage에 저장해요.
 * tsup이 dist를 clean하므로 HTML은 인라인(모듈 상수)로 박아요 — 빌드 산출물이 단일 디렉터리에 유지돼요.
 */
export function registerDashboard(fastify: FastifyInstance): void {
	fastify.get('/dashboard', async (_request, reply) => {
		reply.type('text/html').send(DASHBOARD_HTML);
	});
}

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>SiruBOT Data API — 모니터링</title>
<style>
	:root {
		--bg: #0f1116;
		--surface: #161a22;
		--border: #262c38;
		--text: #e6e9ef;
		--muted: #8b93a3;
		--accent: #f4acb9;
		--ok: #6ee7a0;
		--warn: #f6c177;
		--err: #f87171;
	}
	* { box-sizing: border-box; margin: 0; padding: 0; }
	body {
		background: var(--bg);
		color: var(--text);
		font-family: ui-sans-serif, system-ui, "Pretendard", "Noto Sans KR", sans-serif;
		font-size: 14px;
		line-height: 1.5;
		padding: 24px;
		max-width: 1200px;
		margin: 0 auto;
	}
	header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
	h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
	h1 .accent { color: var(--accent); }
	.meta { color: var(--muted); font-size: 12px; }
	.meta .live { color: var(--ok); }
	.meta .dead { color: var(--err); }
	.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 20px; }
	.card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 14px 16px;
	}
	.card .label { color: var(--muted); font-size: 12px; margin-bottom: 4px; }
	.card .value { font-size: 20px; font-weight: 700; }
	.card .value small { font-size: 12px; color: var(--muted); font-weight: 400; margin-left: 4px; }
	section { margin-bottom: 24px; }
	h2 { font-size: 15px; font-weight: 700; margin-bottom: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
	table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
	th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border); font-variant-numeric: tabular-nums; }
	th { color: var(--muted); font-size: 12px; font-weight: 600; }
	tr:last-child td { border-bottom: none; }
	td.num { text-align: right; }
	.hit { color: var(--ok); }
	.miss { color: var(--muted); }
	.bad { color: var(--err); }
	.zero { color: var(--muted); }
	.badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
	.badge.ok { background: rgba(110,231,160,0.12); color: var(--ok); }
	.badge.warn { background: rgba(246,193,119,0.12); color: var(--warn); }
	.badge.err { background: rgba(248,113,113,0.12); color: var(--err); }
	.empty { color: var(--muted); padding: 14px 16px; background: var(--surface); border: 1px dashed var(--border); border-radius: 10px; }
	.auth-prompt {
		position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;
	}
	.auth-prompt .box { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px; width: 320px; }
	.auth-prompt input { width: 100%; background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 8px; padding: 8px 10px; margin: 10px 0; font-size: 14px; }
	.auth-prompt button { width: 100%; background: var(--accent); color: #1a1114; border: none; border-radius: 8px; padding: 9px; font-weight: 700; cursor: pointer; font-size: 14px; }
	.error-msg { color: var(--err); font-size: 12px; min-height: 18px; }
	.bar { height: 6px; border-radius: 4px; background: var(--border); overflow: hidden; margin-top: 8px; }
	.bar > i { display: block; height: 100%; background: var(--ok); }
</style>
</head>
<body>
<header>
	<h1>SiruBOT <span class="accent">Data API</span> 모니터링</h1>
	<div class="meta" id="conn"><span class="dead">연결 끊김</span></div>
	<div class="meta" id="updated">-</div>
	<button id="logout" style="display:none;background:none;border:1px solid var(--border);color:var(--muted);border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer">키 초기화</button>
</header>

<div class="grid" id="cards"></div>

<section>
	<h2>라우트별 트래픽</h2>
	<table id="routes">
		<thead><tr><th>라우트</th><th class="num">요청</th><th class="num">캐시 히트</th><th class="num">적중률</th><th class="num">upstream</th><th class="num">오류</th><th class="num">마지막 지연</th></tr></thead>
		<tbody></tbody>
	</table>
</section>

<section>
	<h2>재생 이벤트</h2>
	<div class="grid" id="playback" style="margin-bottom:12px"></div>
	<div id="pb-errors"></div>
</section>

<section>
	<h2>메모리 정리 (nightly pass)</h2>
	<div class="grid" id="tidy"></div>
</section>

<section>
	<h2>서킷 브레이커</h2>
	<div id="breakers"></div>
</section>

<script>
let authKey = localStorage.getItem('dataapi_key') || '';
let lastData = null;

function esc(s) {
	return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function fmtTime(ts) {
	if (!ts) return '-';
	const d = new Date(ts);
	return d.toLocaleTimeString('ko-KR') + ' <span style="color:var(--muted)">(' + esc(timeAgo(ts)) + ')</span>';
}
function timeAgo(ts) {
	const s = Math.floor((Date.now() - ts) / 1000);
	if (s < 60) return s + '초 전';
	if (s < 3600) return Math.floor(s / 60) + '분 전';
	if (s < 86400) return Math.floor(s / 3600) + '시간 전';
	return Math.floor(s / 86400) + '일 전';
}
function hitRateClass(pct) { return pct >= 50 ? 'hit' : (pct > 0 ? 'miss' : 'zero'); }

function render(d) {
	lastData = d;
	const conn = document.getElementById('conn');
	const upstreamTotal = Object.values(d.routes).reduce((a, r) => a + r.upstreamCalls, 0);
	const errTotal = Object.values(d.routes).reduce((a, r) => a + r.upstreamErrors, 0);
	const hits = d.cache.redisHits + d.cache.memoryHits;
	const total = hits + d.cache.misses;
	const hitPct = total ? Math.round(hits / total * 100) : 0;

	const cards = [
		{ label: '상태', value: d.redis ? 'Redis 연결' : '메모리 모드' },
		{ label: '캐시 적중률', value: hitPct + '%', bar: hitPct },
		{ label: '외부 API 호출', value: upstreamTotal.toLocaleString(), small: '오류 ' + errTotal },
		{ label: '처리 중 (in-flight)', value: d.inflight },
		{ label: '운세 번역', value: d.translation.available ? '활성' : '원문만', cls: d.translation.available ? 'ok' : 'warn' },
		{ label: '운세 데이터', value: esc(d.ohaasa.date || '-'), small: d.ohaasa.refreshedAt ? timeAgo(d.ohaasa.refreshedAt) : '' }
	];
	document.getElementById('cards').innerHTML = cards.map((c) =>
		'<div class="card"><div class="label">' + c.label + '</div><div class="value ' + (c.cls || '') + '">' +
		(c.value != null ? c.value : '') + (c.small ? '<small>' + esc(c.small) + '</small>' : '') +
		(c.bar != null ? '<div class="bar"><i style="width:' + c.bar + '%"></i></div>' : '') + '</div></div>'
	).join('');

	const rows = Object.entries(d.routes).map(([name, r]) => {
		const pct = r.requests ? Math.round(r.cacheHits / r.requests * 100) : 0;
		return '<tr><td>' + esc(name) + '</td><td class="num">' + r.requests + '</td>' +
			'<td class="num">' + r.cacheHits + '</td><td class="num ' + hitRateClass(pct) + '">' + pct + '%</td>' +
			'<td class="num">' + r.upstreamCalls + '</td><td class="num ' + (r.upstreamErrors ? 'bad' : 'zero') + '">' + r.upstreamErrors + '</td>' +
			'<td class="num">' + (r.lastMs != null ? r.lastMs + 'ms' : '-') + '</td></tr>';
	}).join('');
	document.querySelector('#routes tbody').innerHTML = rows || '<tr><td colspan="7" class="zero">아직 요청이 없어요</td></tr>';

	const pb = d.playback.counts || {};
	const pbCards = [
		{ label: '곡 시작', value: pb.track_start || 0 },
		{ label: '곡 종료', value: pb.track_end || 0 },
		{ label: '끊김 (stuck)', value: pb.track_stuck || 0, cls: pb.track_stuck ? 'bad' : '' },
		{ label: '오류 (error)', value: pb.track_error || 0, cls: pb.track_error ? 'bad' : '' },
		{ label: '재생 중단', value: pb.playback_abort || 0, cls: pb.playback_abort ? 'bad' : '' }
	];
	document.getElementById('playback').innerHTML = pbCards.map((c) =>
		'<div class="card"><div class="label">' + c.label + '</div><div class="value ' + (c.cls || '') + '">' + c.value + '</div></div>'
	).join('');

	const errs = (d.playback.recentErrors || []).slice(-8).reverse();
	document.getElementById('pb-errors').innerHTML = errs.length
		? '<table><thead><tr><th>시각</th><th>유형</th><th>곡</th><th>길드</th><th>샤드</th><th class="num">연속</th></tr></thead><tbody>' +
			errs.map((e) => '<tr><td>' + fmtTime(e.at) + '</td><td><span class="badge ' + (e.type === 'playback_abort' ? 'err' : 'warn') + '">' + esc(e.type) + '</span></td>' +
			'<td>' + esc(e.trackTitle || '-') + (e.trackAuthor ? ' <span style="color:var(--muted)">— ' + esc(e.trackAuthor) + '</span>' : '') + '</td>' +
			'<td>' + esc(e.guildId) + '</td><td>' + (e.shardId != null ? e.shardId : '-') + '</td><td class="num">' + e.consecutiveErrors + '</td></tr>').join('') + '</tbody></table>'
		: '<div class="empty">재생 오류가 없어요 🎉</div>';

	const t = d.memoryTidy || {};
	const tCards = [
		{ label: '마지막 실행', value: t.lastRunAt ? timeAgo(t.lastRunAt) : '-', small: t.lastRunAt ? new Date(t.lastRunAt).toLocaleString('ko-KR') : '' },
		{ label: '대상 사용자', value: t.lastRunUsers ?? 0 },
		{ label: '정리 성공', value: t.lastRunOk ?? 0, cls: 'hit' },
		{ label: '원본 유지(검증 실패)', value: t.lastRunRejected ?? 0, cls: t.lastRunRejected ? 'miss' : '' },
		{ label: '실패', value: t.lastRunFailed ?? 0, cls: t.lastRunFailed ? 'bad' : '' },
		{ label: '상태', value: t.running ? '실행 중' : (t.nextRunAt ? '다음 ' + timeAgo(t.nextRunAt) : '비활성'), cls: t.running ? 'warn' : '' }
	];
	document.getElementById('tidy').innerHTML = tCards.map((c) =>
		'<div class="card"><div class="label">' + c.label + '</div><div class="value ' + (c.cls || '') + '" style="font-size:15px">' + esc(c.value) +
		(c.small ? '<small>' + esc(c.small) + '</small>' : '') + '</div></div>'
	).join('');

	const breakers = Object.entries(d.breakers || {});
	document.getElementById('breakers').innerHTML = breakers.length
		? '<table><thead><tr><th>프로바이더</th><th>상태</th><th class="num">연속 실패</th></tr></thead><tbody>' +
			breakers.map(([name, b]) => '<tr><td>' + esc(name) + '</td><td><span class="badge ' +
			(b.state === 'closed' ? 'ok' : b.state === 'half-open' ? 'warn' : 'err') + '">' + b.state + '</span></td><td class="num">' + b.failures + '</td></tr>').join('') +
			'</tbody></table>'
		: '<div class="empty">열린 브레이커 없음 — 모든 프로바이더 정상</div>';

	document.getElementById('updated').textContent = '업데이트 ' + new Date().toLocaleTimeString('ko-KR');
	conn.innerHTML = '<span class="live">● 연결됨</span>';
}

async function poll() {
	try {
		const res = await fetch('/v1/status', { headers: authKey ? { authorization: authKey } : {} });
		if (res.status === 401) {
			showPrompt();
			return;
		}
		if (!res.ok) throw new Error('HTTP ' + res.status);
		render(await res.json());
		hidePrompt();
	} catch (e) {
		document.getElementById('conn').innerHTML = '<span class="dead">● 연결 끊김</span>';
	}
}

function showPrompt() {
	if (document.getElementById('auth-prompt')) return;
	const div = document.createElement('div');
	div.id = 'auth-prompt';
	div.className = 'auth-prompt';
	div.innerHTML = '<div class="box"><b>인증이 필요해요</b><div class="error-msg" id="auth-err"></div>' +
		'<input type="password" id="key-input" placeholder="AUTH_KEY" autofocus><button id="key-save">확인</button></div>';
	document.body.appendChild(div);
	const save = () => {
		const v = document.getElementById('key-input').value.trim();
		fetch('/v1/status', { headers: { authorization: v } }).then((r) => {
			if (r.ok) { authKey = v; localStorage.setItem('dataapi_key', v); hidePrompt(); poll(); }
			else document.getElementById('auth-err').textContent = '키가 올바르지 않아요';
		}).catch(() => (document.getElementById('auth-err').textContent = '서버에 연결할 수 없어요'));
	};
	document.getElementById('key-save').onclick = save;
	document.getElementById('key-input').onkeydown = (e) => { if (e.key === 'Enter') save(); };
}
function hidePrompt() {
	const el = document.getElementById('auth-prompt');
	if (el) el.remove();
	document.getElementById('logout').style.display = authKey ? '' : 'none';
}

document.getElementById('logout').onclick = () => {
	authKey = '';
	localStorage.removeItem('dataapi_key');
	poll();
};

poll();
setInterval(poll, 5000);
setInterval(() => { if (lastData) render(lastData); }, 30000);
</script>
</body>
</html>`;
