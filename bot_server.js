const express = require('express');
const { WebSocketServer } = require('ws');
const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');

const BASE = 'https://drone-simulator-worlds-v-4--jonathan-r2015.replit.app';
const PORT = 3000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Bot-Zustand
const bots = {
  normal:     { name: '🌲 Normal',     worldIdx: 0, active: false, browser: null, page: null, coins: 0, battery: 100, status: 'gestoppt' },
  wueste:     { name: '🏜️ Wüste',      worldIdx: 1, active: false, browser: null, page: null, coins: 0, battery: 100, status: 'gestoppt' },
  parkour:    { name: '⭕ Parkour',     worldIdx: 2, active: false, browser: null, page: null, coins: 0, battery: 100, status: 'gestoppt' },
  multiplayer:{ name: '🌍 Multiplayer', worldIdx: 3, active: false, browser: null, page: null, coins: 0, battery: 100, status: 'gestoppt' },
};

// Log-Speicher pro Bot (letzte 100 Zeilen)
const logs = { normal: [], wueste: [], parkour: [], multiplayer: [] };

function addLog(botId, msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logs[botId].push(line);
  if (logs[botId].length > 100) logs[botId].shift();
  broadcast({ type: 'log', bot: botId, line });
}

function broadcast(data) {
  const json = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(json); });
}

function updateStatus(botId, status, extra = {}) {
  const bot = bots[botId];
  bot.status = status;
  Object.assign(bot, extra);
  broadcast({
    type: 'status',
    bot: botId,
    status,
    coins: bot.coins,
    battery: bot.battery,
    active: bot.active,
  });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fillInputs(page, user, pass) {
  const inputs = await page.$$('input');
  for (const inp of inputs) {
    const type = await inp.getAttribute('type').catch(() => 'text');
    if (type === 'password') await inp.fill(pass);
    else await inp.fill(user);
  }
}

async function loginAndStart(page, botId) {
  addLog(botId, 'Login...');
  // Direkt sign-up versuchen – falls Konto vorhanden, Fehlermeldung kommt und wir switchen
  await page.goto(BASE + '/sign-in', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  await fillInputs(page, 'ClaudeBot7777', 'DroneBot123');
  const loginBtn = await page.$('button:has-text("Einloggen")');
  if (loginBtn) { await loginBtn.click(); await sleep(5000); }

  let txt = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
  if (txt.includes('DRONE SIMULATOR')) {
    addLog(botId, 'Login OK: ClaudeBot7777');
    return;
  }

  // Fallback: neues Konto
  const user = 'DroneBot' + Date.now().toString().slice(-5);
  addLog(botId, `Erstelle Konto: ${user}`);
  await page.goto(BASE + '/sign-up', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await sleep(2000);
  await fillInputs(page, user, 'DroneBot123');
  const submitBtn = await page.$('button[type="submit"]');
  if (submitBtn) { await submitBtn.click(); await sleep(5000); }
  addLog(botId, `Konto erstellt: ${user}`);
}

async function startWorld(page, botId) {
  const worldIdx = bots[botId].worldIdx;
  addLog(botId, `Starte Welt ${worldIdx}...`);
  await page.keyboard.press('Escape');
  await sleep(500);

  const divs = page.locator('div').filter({ hasText: /^▶ Play$/ });
  const count = await divs.count();
  addLog(botId, `Play-Buttons: ${count}`);

  if (count > worldIdx) {
    await divs.nth(worldIdx).click({ force: true });
  } else {
    const coords = [[524,271],[756,271],[524,449],[756,449]];
    const [x,y] = coords[worldIdx] || [524,271];
    await page.mouse.click(x, y);
  }
  await sleep(4000);
  addLog(botId, 'Welt gestartet');
}

// Screenshot an alle WebSocket-Clients senden
async function streamScreenshot(page, botId) {
  try {
    const buf = await page.screenshot({ type: 'jpeg', quality: 60 });
    const b64 = buf.toString('base64');
    broadcast({ type: 'screenshot', bot: botId, data: b64 });
  } catch { /* seite vielleicht geschlossen */ }
}

async function runBot(botId) {
  const bot = bots[botId];
  bot.active = true;
  updateStatus(botId, 'startet...');

  try {
    const browser = await chromium.launch({
      headless: true,
      executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    bot.browser = browser;
    bot.page = page;

    await loginAndStart(page, botId);
    await startWorld(page, botId);

    // Canvas fokussieren
    await page.mouse.click(640, 360);
    await sleep(500);
    for (let i = 0; i < 3; i++) {
      await page.keyboard.down('Space');
      await sleep(600);
      await page.keyboard.up('Space');
      await sleep(100);
    }
    await sleep(1000);

    updateStatus(botId, 'läuft');
    addLog(botId, 'Spielschleife gestartet');

    const movePattern = ['w','w','d','w','d','s','d','s','a','s','a','w','a','w','d'];
    let frame = 0;
    let lowBatt = false;
    let lastBatt = 100;

    // Screenshot-Intervall (alle 1,5s)
    const ssInterval = setInterval(() => streamScreenshot(page, botId), 1500);

    while (bot.active) {
      frame++;

      // HUD lesen
      const pageText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
      const battMatch = pageText.match(/(\d+)\s*%/);
      const batt = battMatch ? parseInt(battMatch[1]) : lastBatt;
      const coinMatch = pageText.match(/([\d,]+)\s*Coins/i);
      const coins = coinMatch ? parseInt(coinMatch[1].replace(',','')) : bot.coins;
      const hasStation = pageText.includes('⚡') || pageText.toLowerCase().includes('ladestation');

      lastBatt = batt;
      bot.battery = batt;
      bot.coins = coins;

      if (frame % 5 === 1) {
        updateStatus(botId, lowBatt ? '⚡ Ladestation' : '▶ läuft', { coins, battery: batt });
        addLog(botId, `Akku: ${batt}% | Coins: ${coins} | Station: ${hasStation}`);
      }

      if (hasStation) addLog(botId, '⚡ LADESTATION ERREICHT!');

      // Akku-Management
      if (batt <= 50 && !lowBatt) {
        lowBatt = true;
        addLog(botId, `⚠️ Akku ${batt}% – fliege zur Ladestation!`);
      }
      if (batt >= 95 && lowBatt) {
        lowBatt = false;
        addLog(botId, `✅ Aufgeladen (${batt}%) – weiter Coins sammeln`);
      }

      // Steuerung
      if (!lowBatt) {
        const k = movePattern[frame % movePattern.length];
        await page.keyboard.down(k);
        await sleep(350);
        await page.keyboard.up(k);
        if (frame % 8 === 0) await page.keyboard.press('Space');
      } else {
        await page.keyboard.press('w');
        await sleep(250);
        await page.keyboard.press('Space');
      }

      await sleep(600);
    }

    clearInterval(ssInterval);
    await browser.close();
  } catch (e) {
    addLog(botId, `FEHLER: ${e.message}`);
  }

  bot.active = false;
  bot.browser = null;
  bot.page = null;
  updateStatus(botId, 'gestoppt', { battery: 100 });
  addLog(botId, 'Bot gestoppt');
}

async function stopBot(botId) {
  const bot = bots[botId];
  addLog(botId, 'Stoppe Bot...');
  bot.active = false;
  if (bot.browser) {
    await bot.browser.close().catch(() => {});
    bot.browser = null;
    bot.page = null;
  }
}

// =====================
// REST API
// =====================
app.use(express.json());

app.post('/bot/:id/start', async (req, res) => {
  const id = req.params.id;
  if (!bots[id]) return res.json({ error: 'Unbekannter Bot' });
  if (bots[id].active) return res.json({ error: 'Läuft bereits' });
  res.json({ ok: true, message: `${bots[id].name} wird gestartet` });
  runBot(id); // async, kein await
});

app.post('/bot/:id/stop', async (req, res) => {
  const id = req.params.id;
  if (!bots[id]) return res.json({ error: 'Unbekannter Bot' });
  await stopBot(id);
  res.json({ ok: true, message: `${bots[id].name} gestoppt` });
});

app.get('/bot/:id/logs', (req, res) => {
  const id = req.params.id;
  res.json(logs[id] || []);
});

app.get('/status', (req, res) => {
  const out = {};
  for (const [id, bot] of Object.entries(bots)) {
    out[id] = { name: bot.name, active: bot.active, status: bot.status, coins: bot.coins, battery: bot.battery };
  }
  res.json(out);
});

// =====================
// WEB-UI
// =====================
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>🚁 Drone Bot Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0d1117; color: #e6edf3; font-family: 'Segoe UI', monospace; }
  header { background: #161b22; border-bottom: 1px solid #30363d; padding: 16px 24px; display: flex; align-items: center; gap: 12px; }
  header h1 { font-size: 1.4rem; }
  .conn { font-size: 0.75rem; padding: 4px 10px; border-radius: 12px; background: #21262d; }
  .conn.ok { background: #1a4731; color: #3fb950; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(580px, 1fr)); gap: 16px; padding: 20px; }
  .bot-card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; overflow: hidden; transition: border-color .2s; }
  .bot-card.active { border-color: #3fb950; }
  .bot-card.low-batt { border-color: #d29922; }
  .card-header { padding: 14px 16px; background: #21262d; display: flex; align-items: center; justify-content: space-between; }
  .bot-name { font-size: 1.1rem; font-weight: 600; }
  .bot-status { font-size: 0.8rem; color: #8b949e; }
  .stats { display: flex; gap: 20px; padding: 12px 16px; background: #0d1117; }
  .stat { text-align: center; }
  .stat-val { font-size: 1.4rem; font-weight: bold; }
  .stat-val.green { color: #3fb950; }
  .stat-val.yellow { color: #d29922; }
  .stat-val.red { color: #f85149; }
  .stat-lbl { font-size: 0.7rem; color: #8b949e; text-transform: uppercase; }
  .batt-bar { height: 6px; background: #21262d; margin: 0 16px 12px; border-radius: 3px; overflow: hidden; }
  .batt-fill { height: 100%; border-radius: 3px; transition: width .5s, background .5s; }
  .controls { display: flex; gap: 8px; padding: 0 16px 12px; }
  .btn { flex: 1; padding: 10px; border: none; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: opacity .2s, transform .1s; }
  .btn:active { transform: scale(0.97); }
  .btn-start { background: #238636; color: #fff; }
  .btn-start:hover { background: #2ea043; }
  .btn-stop  { background: #b62324; color: #fff; }
  .btn-stop:hover  { background: #da3633; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .stream { position: relative; background: #000; aspect-ratio: 16/9; }
  .stream img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .stream-off { display: flex; align-items: center; justify-content: center; height: 100%; color: #30363d; font-size: 2rem; }
  .log-box { height: 130px; overflow-y: auto; padding: 8px 12px; background: #0d1117; border-top: 1px solid #21262d; font-size: 0.72rem; font-family: monospace; color: #8b949e; }
  .log-box .line { padding: 1px 0; border-bottom: 1px solid #161b22; }
  .log-box .line.warn { color: #d29922; }
  .log-box .line.ok   { color: #3fb950; }
  .log-box .line.err  { color: #f85149; }
  .all-controls { display: flex; gap: 10px; padding: 0 20px 10px; }
  .btn-all { padding: 10px 20px; border: none; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
  .btn-all-start { background: #238636; color: #fff; }
  .btn-all-stop  { background: #b62324; color: #fff; }
</style>
</head>
<body>
<header>
  <span style="font-size:1.8rem">🚁</span>
  <h1>Drone Bot Dashboard</h1>
  <span class="conn" id="conn">● Verbinde...</span>
</header>

<div class="all-controls">
  <button class="btn-all btn-all-start" onclick="allStart()">▶ Alle starten</button>
  <button class="btn-all btn-all-stop"  onclick="allStop()">■ Alle stoppen</button>
</div>

<div class="grid" id="grid"></div>

<script>
const BOTS = {
  normal:      { name: '🌲 Normal Welt' },
  wueste:      { name: '🏜️ Wüste' },
  parkour:     { name: '⭕ Parkour' },
  multiplayer: { name: '🌍 Multiplayer' },
};

const state = {};

function createCards() {
  const grid = document.getElementById('grid');
  for (const [id, bot] of Object.entries(BOTS)) {
    state[id] = { active: false, battery: 100, coins: 0, status: 'gestoppt' };
    grid.innerHTML += \`
    <div class="bot-card" id="card-\${id}">
      <div class="card-header">
        <div>
          <div class="bot-name">\${bot.name}</div>
          <div class="bot-status" id="status-\${id}">gestoppt</div>
        </div>
        <div class="stats">
          <div class="stat">
            <div class="stat-val green" id="coins-\${id}">0</div>
            <div class="stat-lbl">Coins</div>
          </div>
          <div class="stat">
            <div class="stat-val green" id="batt-\${id}">100%</div>
            <div class="stat-lbl">Akku</div>
          </div>
        </div>
      </div>
      <div class="batt-bar"><div class="batt-fill" id="battbar-\${id}" style="width:100%;background:#3fb950"></div></div>
      <div class="stream" id="stream-\${id}">
        <div class="stream-off" id="stream-off-\${id}">⏸</div>
        <img id="img-\${id}" style="display:none" />
      </div>
      <div class="controls">
        <button class="btn btn-start" id="btn-start-\${id}" onclick="startBot('\${id}')">▶ Starten</button>
        <button class="btn btn-stop"  id="btn-stop-\${id}"  onclick="stopBot('\${id}')" disabled>■ Stoppen</button>
      </div>
      <div class="log-box" id="log-\${id}"></div>
    </div>\`;
  }
}

function updateCard(id, data) {
  const s = state[id];
  if (data.status !== undefined) s.status = data.status;
  if (data.coins  !== undefined) s.coins = data.coins;
  if (data.battery!== undefined) s.battery = data.battery;
  if (data.active !== undefined) s.active = data.active;

  const card = document.getElementById('card-' + id);
  const batt = s.battery;
  const battColor = batt > 60 ? '#3fb950' : batt > 30 ? '#d29922' : '#f85149';
  const coinsEl = document.getElementById('coins-' + id);
  const battEl  = document.getElementById('batt-' + id);
  const battBar = document.getElementById('battbar-' + id);
  const statusEl = document.getElementById('status-' + id);

  if (coinsEl) coinsEl.textContent = s.coins.toLocaleString('de');
  if (battEl)  { battEl.textContent = batt + '%'; battEl.style.color = battColor; }
  if (battBar) { battBar.style.width = batt + '%'; battBar.style.background = battColor; }
  if (statusEl) statusEl.textContent = s.status;

  if (card) {
    card.classList.toggle('active', s.active);
    card.classList.toggle('low-batt', batt <= 50 && s.active);
  }

  const btnStart = document.getElementById('btn-start-' + id);
  const btnStop  = document.getElementById('btn-stop-'  + id);
  if (btnStart) btnStart.disabled = s.active;
  if (btnStop)  btnStop.disabled  = !s.active;
}

function addLogLine(id, line) {
  const box = document.getElementById('log-' + id);
  if (!box) return;
  const div = document.createElement('div');
  div.className = 'line' +
    (line.includes('⚠️') || line.includes('Akku') && line.includes('50') ? ' warn' : '') +
    (line.includes('✅') || line.includes('OK') || line.includes('⚡ LADESTATION') ? ' ok' : '') +
    (line.includes('FEHLER') ? ' err' : '');
  div.textContent = line;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  // Max 80 Zeilen
  while (box.children.length > 80) box.removeChild(box.firstChild);
}

function showScreenshot(id, b64) {
  const img = document.getElementById('img-' + id);
  const off = document.getElementById('stream-off-' + id);
  if (img) { img.src = 'data:image/jpeg;base64,' + b64; img.style.display = 'block'; }
  if (off) off.style.display = 'none';
}

function hideScreenshot(id) {
  const img = document.getElementById('img-' + id);
  const off = document.getElementById('stream-off-' + id);
  if (img) img.style.display = 'none';
  if (off) off.style.display = 'flex';
}

// WebSocket
let ws;
function connect() {
  ws = new WebSocket('ws://' + location.host);
  ws.onopen = () => {
    document.getElementById('conn').textContent = '● Verbunden';
    document.getElementById('conn').className = 'conn ok';
  };
  ws.onclose = () => {
    document.getElementById('conn').textContent = '● Getrennt';
    document.getElementById('conn').className = 'conn';
    setTimeout(connect, 2000);
  };
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'log')        addLogLine(msg.bot, msg.line);
    if (msg.type === 'status')     { updateCard(msg.bot, msg); if (!msg.active) hideScreenshot(msg.bot); }
    if (msg.type === 'screenshot') showScreenshot(msg.bot, msg.data);
    if (msg.type === 'init') {
      for (const [id, data] of Object.entries(msg.bots)) updateCard(id, data);
      for (const [id, lines] of Object.entries(msg.logs)) lines.forEach(l => addLogLine(id, l));
    }
  };
}

async function startBot(id) {
  await fetch('/bot/' + id + '/start', { method: 'POST' });
}
async function stopBot(id) {
  await fetch('/bot/' + id + '/stop', { method: 'POST' });
}
async function allStart() {
  for (const id of Object.keys(BOTS)) {
    if (!state[id].active) {
      await fetch('/bot/' + id + '/start', { method: 'POST' });
      await new Promise(r => setTimeout(r, 800));
    }
  }
}
async function allStop() {
  for (const id of Object.keys(BOTS)) {
    if (state[id].active) await fetch('/bot/' + id + '/stop', { method: 'POST' });
  }
}

createCards();
connect();

// Status-Poll als Fallback
setInterval(async () => {
  const r = await fetch('/status').then(r=>r.json()).catch(()=>({}));
  for (const [id, data] of Object.entries(r)) updateCard(id, data);
}, 5000);
</script>
</body>
</html>`);
});

// WebSocket: neue Verbindung bekommt aktuellen Zustand
wss.on('connection', ws => {
  const botsState = {};
  for (const [id, bot] of Object.entries(bots)) {
    botsState[id] = { name: bot.name, active: bot.active, status: bot.status, coins: bot.coins, battery: bot.battery };
  }
  ws.send(JSON.stringify({ type: 'init', bots: botsState, logs }));
});

server.listen(PORT, () => {
  console.log(`✅ Dashboard läuft auf http://localhost:${PORT}`);
});
