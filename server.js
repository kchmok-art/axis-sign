// AX:IS 명부 서명 허브 — 명부 만들기 → 링크 발급 → 서명 받기 → 관리/다운로드
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3001;
const CREATE_KEY = process.env.CREATE_KEY || '';          // 설정하면 명부 만들 때 이 키가 필요
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ── 저장소 (명부 1개 = JSON 파일 1개) ─────────────────────
const idOk = id => /^[A-Za-z0-9]{8}$/.test(id);
const file = id => path.join(DATA_DIR, id + '.json');
function load(id) {
  if (!idOk(id) || !fs.existsSync(file(id))) return null;
  return JSON.parse(fs.readFileSync(file(id), 'utf8'));
}
function save(r) {
  const tmp = file(r.id) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(r));
  fs.renameSync(tmp, file(r.id));          // 원자적 저장 (중간에 꺼져도 파일 안 깨짐)
}
function newId() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let id;
  do { id = Array.from(crypto.randomBytes(8), b => abc[b % abc.length]).join(''); } while (fs.existsSync(file(id)));
  return id;
}
const clean = (s, n = 100) => String(s ?? '').trim().slice(0, n);
function parseMembers(list) {
  const seen = new Set(), out = [];
  for (const m of Array.isArray(list) ? list : []) {
    const name = clean(m.name, 30), org = clean(m.org, 40);
    if (!name || seen.has(name)) continue;
    seen.add(name); out.push({ name, org });
  }
  return out.slice(0, 500);
}
function publicView(r) {
  return {
    id: r.id, title: r.title, date: r.date, desc: r.desc, closed: r.closed,
    members: r.members.map(m => ({ name: m.name, org: m.org, signed: !!r.signatures[m.name] })),
  };
}
function adminView(r) {
  return { ...publicView(r), createdAt: r.createdAt,
    members: r.members.map(m => ({ name: m.name, org: m.org, ...(r.signatures[m.name] || {}), signed: !!r.signatures[m.name] })) };
}
function auth(req, res) {
  const r = load(req.params.id);
  if (!r) { res.status(404).json({ error: '명부를 찾을 수 없습니다' }); return null; }
  const t = String(req.query.t || req.body?.t || '');
  const a = Buffer.from(t), b = Buffer.from(r.adminToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { res.status(403).json({ error: '관리 권한이 없습니다' }); return null; }
  return r;
}

// ── 페이지 ──────────────────────────────────────────────
const page = n => (req, res) => res.sendFile(path.join(__dirname, 'public', n));
app.get('/', page('create.html'));
app.get('/s/:id', page('sign.html'));
app.get('/m/:id', page('manage.html'));

// ── API: 공개 ────────────────────────────────────────────
app.get('/api/config', (req, res) => res.json({ needKey: !!CREATE_KEY }));

app.post('/api/rosters', (req, res) => {
  const b = req.body || {};
  if (CREATE_KEY && b.key !== CREATE_KEY) return res.status(403).json({ error: '생성 키가 올바르지 않습니다' });
  const title = clean(b.title, 80), members = parseMembers(b.members);
  if (!title) return res.status(400).json({ error: '명부 제목을 입력하세요' });
  if (!members.length) return res.status(400).json({ error: '명단을 1명 이상 입력하세요' });
  const r = { id: newId(), adminToken: crypto.randomBytes(16).toString('hex'), title,
    date: clean(b.date, 40), desc: clean(b.desc, 300), members, signatures: {}, closed: false,
    createdAt: new Date().toISOString() };
  save(r);
  res.json({ id: r.id, adminToken: r.adminToken });
});

app.get('/api/rosters/:id', (req, res) => {
  const r = load(req.params.id);
  r ? res.json(publicView(r)) : res.status(404).json({ error: '명부를 찾을 수 없습니다' });
});

app.post('/api/rosters/:id/sign', (req, res) => {
  const r = load(req.params.id);
  if (!r) return res.status(404).json({ error: '명부를 찾을 수 없습니다' });
  if (r.closed) return res.status(410).json({ error: '서명이 마감된 명부입니다' });
  const name = clean(req.body?.name, 30), sig = String(req.body?.signature || '');
  if (!r.members.some(m => m.name === name)) return res.status(400).json({ error: '명단에 없는 이름입니다' });
  if (r.signatures[name]) return res.status(409).json({ error: '이미 서명했습니다. 다시 하려면 관리자에게 요청하세요' });
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length > 400000) return res.status(400).json({ error: '서명 이미지가 올바르지 않습니다' });
  r.signatures[name] = { signature: sig, signedAt: new Date().toISOString() };
  save(r);
  res.json({ ok: true });
});

// ── API: 관리자 (관리 링크의 토큰 필요) ─────────────────────
app.get('/api/admin/:id', (req, res) => { const r = auth(req, res); if (r) res.json(adminView(r)); });

app.post('/api/admin/:id/update', (req, res) => {
  const r = auth(req, res); if (!r) return;
  const b = req.body || {};
  if (b.title !== undefined) { const t = clean(b.title, 80); if (t) r.title = t; }
  if (b.date !== undefined) r.date = clean(b.date, 40);
  if (b.desc !== undefined) r.desc = clean(b.desc, 300);
  if (b.closed !== undefined) r.closed = !!b.closed;
  if (b.members !== undefined) {
    const ms = parseMembers(b.members);
    if (!ms.length) return res.status(400).json({ error: '명단을 1명 이상 입력하세요' });
    r.members = ms;   // 명단에서 빠진 사람의 서명은 보존하되 표시하지 않음
  }
  if (b.resetName !== undefined) delete r.signatures[clean(b.resetName, 30)];
  save(r); res.json(adminView(r));
});

app.delete('/api/admin/:id', (req, res) => {
  const r = auth(req, res); if (!r) return;
  fs.renameSync(file(r.id), path.join(DATA_DIR, `${r.id}.deleted.${Date.now()}.json`));
  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => console.log(`sign-hub on :${PORT}  data=${DATA_DIR}`));
