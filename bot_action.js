// GitHub Actions Bot - läuft in CI
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://drone-simulator-worlds-v-4--jonathan-r2015.replit.app';
const SS_DIR = 'action_ss';
const LOG_FILE = 'action_log.txt';

const WORLD_MAP = { normal: 0, wueste: 1, parkour: 2, multiplayer: 3 };

const worldArg = process.argv[2] || process.env.WORLD || 'normal';
const durationMin = parseInt(process.argv[3] || process.env.DURATION_MINUTES || '10');
const durationMs = durationMin * 60 * 1000;

if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });
if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);

const log = msg => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
};

const ss = async (page, name) => {
  const f = path.join(SS_DIR, `${name}.png`);
  await page.screenshot({ path: f });
  log(`Screenshot: ${name}`);
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fillInputs(page, user, pass) {
  const inputs = await page.$$('input');
  for (const inp of inputs) {
    const type = await inp.getAttribute('type').catch(() => 'text');
    if (type === 'password') await inp.fill(pass);
    else await inp.fill(user);
  }
}

async function playWorld(page, worldIdx, durationMs) {
  // Welt starten
  const divs = page.locator('div').filter({ hasText: /^▶ Play$/ });
  const count = await divs.count();
  log(`Play-Buttons: ${count}, wähle Index ${worldIdx}`);
  if (count > worldIdx) {
    await divs.nth(worldIdx).click({ force: true });
  } else {
    const coords = [[524,271],[756,271],[524,449],[756,449]];
    const [x,y] = coords[worldIdx];
    await page.mouse.click(x, y);
  }
  await sleep(4000);

  // Canvas fokussieren und Drohne starten
  await page.mouse.click(640, 360);
  await sleep(300);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.down('Space');
    await sleep(600);
    await page.keyboard.up('Space');
  }
  await sleep(1000);
  log('Spielschleife gestartet');

  const movePattern = ['w','w','d','w','d','s','a','s','a','w','d','w'];
  const start = Date.now();
  let frame = 0;
  let lowBatt = false;
  let lastBatt = 100;
  let maxCoins = 0;
  let ssCount = 0;
  let lastLiveWrite = 0;

  const writeLiveStatus = (world, batt, coins, logLines) => {
    try {
      const elapsed = Math.round((Date.now() - start) / 1000);
      fs.mkdirSync('docs/status', { recursive: true });
      fs.writeFileSync(`docs/status/${world}.json`, JSON.stringify({
        world, run_id: process.env.GITHUB_RUN_ID || 'local',
        timestamp: new Date().toISOString(),
        duration: String(durationMin),
        status: 'running',
        elapsed_seconds: elapsed,
        battery: String(batt),
        coins,
        log_last_10: logLines,
      }, null, 2));
    } catch {}
  };

  while (Date.now() - start < durationMs) {
    frame++;
    const elapsed = Math.round((Date.now() - start) / 1000);

    // Screenshot alle 30s
    if (elapsed % 30 < 2 && frame % 5 === 0) {
      await ss(page, `game_${String(ssCount).padStart(3,'0')}_${elapsed}s`);
      ssCount++;
    }

    // Status lesen
    const txt = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    const battMatch = txt.match(/(\d+)\s*%/);
    const batt = battMatch ? parseInt(battMatch[1]) : lastBatt;
    const coinMatch = txt.match(/([\d,]+)\s*Coins/i);
    const coins = coinMatch ? parseInt(coinMatch[1].replace(',','')) : maxCoins;
    const hasStation = txt.includes('⚡') || txt.toLowerCase().includes('ladestation');

    if (batt) lastBatt = batt;
    if (coins > maxCoins) { maxCoins = coins; log(`Neue Coins: ${maxCoins}`); }

    if (frame % 10 === 1) log(`[${elapsed}s] Akku: ${batt}% | Coins: ${coins} | Station: ${hasStation}`);
    if (hasStation) log(`⚡ Ladestation erreicht!`);

    // Live-Status alle 90s schreiben (wird vom Workflow-Hintergrundloop gepusht)
    if (Date.now() - lastLiveWrite > 90000) {
      lastLiveWrite = Date.now();
      const logLines = fs.existsSync(LOG_FILE)
        ? fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean).slice(-10)
        : [];
      writeLiveStatus(worldArg, lastBatt, maxCoins, logLines);
    }

    // Akku-Management
    if (batt <= 50 && !lowBatt) { lowBatt = true; log(`⚠️ Akku ${batt}% – Ladestation anfliegen`); }
    if (batt >= 95 && lowBatt)  { lowBatt = false; log(`✅ Aufgeladen (${batt}%)`); }

    if (!lowBatt) {
      const k = movePattern[frame % movePattern.length];
      await page.keyboard.down(k); await sleep(350); await page.keyboard.up(k);
      if (frame % 8 === 0) await page.keyboard.press('Space');
    } else {
      await page.keyboard.press('w'); await sleep(200);
      await page.keyboard.press('Space');
    }
    await sleep(600);
  }

  await ss(page, 'final');
  log(`Fertig! Max Coins: ${maxCoins}`);
  return maxCoins;
}

async function main() {
  const worlds = worldArg === 'alle'
    ? ['normal','wueste','parkour','multiplayer']
    : [worldArg];

  log(`=== Drone Bot gestartet: ${worlds.join(', ')} für ${durationMin} Min ===`);

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  try {
    // Login
    log('Login...');
    await page.goto(BASE + '/sign-in', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    await fillInputs(page, 'ClaudeBot7777', 'DroneBot123');
    const loginBtn = await page.$('button:has-text("Einloggen")');
    if (loginBtn) { await loginBtn.click(); await sleep(5000); }

    let txt = await page.evaluate(() => document.body?.innerText || '');
    if (!txt.includes('DRONE SIMULATOR')) {
      const user = 'DroneCI' + Date.now().toString().slice(-5);
      log(`Neues Konto: ${user}`);
      await page.goto(BASE + '/sign-up', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(2000);
      await fillInputs(page, user, 'DroneBot123');
      await page.click('button[type="submit"]');
      await sleep(5000);
    } else {
      log('Login OK: ClaudeBot7777');
    }

    await ss(page, '00_menu');

    // Alle gewünschten Welten spielen
    const worldMs = Math.floor(durationMs / worlds.length);
    for (const w of worlds) {
      const idx = WORLD_MAP[w] ?? 0;
      log(`\n--- Starte: ${w} (${Math.round(worldMs/60000)} Min) ---`);

      // Zurück zum Menü
      await page.goto(BASE + '/game', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(3000);

      await playWorld(page, idx, worldMs);
    }

  } catch(e) {
    log(`FEHLER: ${e.message}`);
    await ss(page, 'error').catch(() => {});
  } finally {
    await browser.close();
    log('Browser geschlossen');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
