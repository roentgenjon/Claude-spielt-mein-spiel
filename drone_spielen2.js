const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://drone-simulator-worlds-v-4--jonathan-r2015.replit.app';
const SS = '/home/user/Claude-spielt-mein-spiel/ss_final2';
const LOG = '/home/user/Claude-spielt-mein-spiel/log2.txt';

if (!fs.existsSync(SS)) fs.mkdirSync(SS, { recursive: true });
if (fs.existsSync(LOG)) fs.unlinkSync(LOG);

const log = msg => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
};
const screenshot = async (page, name) => {
  await page.screenshot({ path: path.join(SS, `${name}.png`) });
  log(`SS: ${name}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const bodyText = async page => {
  try { return await page.evaluate(() => document.body?.innerText || ''); }
  catch { return ''; }
};

// Drohne steuern mit Canvas-Klick zuerst
async function pressWith(page, key, durationMs = 400) {
  await page.keyboard.down(key);
  await sleep(durationMs);
  await page.keyboard.up(key);
}

async function login(page) {
  await page.goto(BASE + '/sign-in', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);
  await page.fill('input:not([type="password"])', 'ClaudeBot7777');
  await page.fill('input[type="password"]', 'DroneBot123');
  await page.click('button:has-text("Einloggen")');
  await sleep(4000);

  const txt = await bodyText(page);
  if (txt.includes('DRONE SIMULATOR')) {
    log('Login OK: ClaudeBot7777');
    return;
  }
  // Neues Konto
  const user = 'DroneAI' + Date.now().toString().slice(-4);
  await page.goto(BASE + '/sign-up', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await sleep(2000);
  await page.fill('input:not([type="password"])', user);
  await page.fill('input[type="password"]', 'DroneBot123');
  await page.click('button[type="submit"]');
  await sleep(5000);
  log(`Registriert: ${user}`);
}

async function openModal(page, btnText, name) {
  try {
    await page.click(`button:has-text("${btnText}")`);
    await sleep(3000);
    await screenshot(page, name);
    const txt = await bodyText(page);
    log(`=== ${btnText} ===\n${txt.substring(0, 4000)}`);
    await page.keyboard.press('Escape');
    await sleep(1000);
    return txt;
  } catch (e) {
    log(`Modal ${btnText} Fehler: ${e.message}`);
    return '';
  }
}

async function startWorld(page, idx) {
  // Alle Play-Divs finden
  const divs = page.locator('div').filter({ hasText: /^▶ Play$/ });
  const count = await divs.count();
  log(`Play-Divs: ${count}`);
  if (count > idx) {
    await divs.nth(idx).click({ force: true });
    await sleep(5000);
    return true;
  }
  return false;
}

async function readHUD(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText || '';
    const battMatch = text.match(/(\d+)\s*%/);
    const coinMatch = text.match(/[\d,]+(?=\s*Coins?)/i) || text.match(/Coins?\s*[\d,]+/i);
    let coinVal = null;
    if (coinMatch) {
      coinVal = parseInt(coinMatch[0].replace(/[^0-9]/g, ''));
    }
    const batt = battMatch ? parseInt(battMatch[1]) : null;
    const hasStation = text.includes('⚡') || text.toLowerCase().includes('ladestation') || text.toLowerCase().includes('charging');
    return { batt, coins: coinVal, hasStation, text: text.substring(0, 3000) };
  });
}

async function spielen(page, name, durationMs = 240000) {
  log(`\n=== SPIELEN: ${name} ===`);

  // Canvas fokussieren
  const canvas = page.locator('canvas');
  const canvasBox = await canvas.boundingBox().catch(() => null);
  if (canvasBox) {
    log(`Canvas: ${JSON.stringify(canvasBox)}`);
    await page.mouse.click(canvasBox.x + canvasBox.width/2, canvasBox.y + canvasBox.height/2);
    await sleep(500);
  } else {
    // Klick in Mitte des Bildschirms
    await page.mouse.click(640, 360);
    await sleep(500);
  }

  // Drohne starten (Space = Aufsteigen)
  log('Drohne startet...');
  for (let i = 0; i < 3; i++) {
    await pressWith(page, 'Space', 800);
    await sleep(200);
  }
  await sleep(2000);

  const start = Date.now();
  let frame = 0;
  let lowBatt = false;
  let maxCoins = 0;
  let lastBatt = 100;
  let chargingCount = 0;

  // Bewegungsmuster für Coin-Sammlung
  const patterns = [
    ['w', 800], ['d', 600], ['w', 800], ['d', 600],  // Vorwärts-Rechts
    ['w', 800], ['a', 600], ['w', 800], ['a', 600],  // Vorwärts-Links
    ['Space', 400], ['s', 400],                        // Höhe variieren
    ['d', 1000], ['w', 800],                          // Große Kurve
    ['a', 1000], ['w', 800],                          // Andere Richtung
  ];
  let patIdx = 0;

  while (Date.now() - start < durationMs) {
    frame++;
    const elapsed = Math.round((Date.now() - start) / 1000);

    // Screenshot alle 20s
    if (elapsed % 20 < 2) await screenshot(page, `${name}_${String(elapsed).padStart(4,'0')}s`);

    // HUD lesen
    const hud = await readHUD(page);
    if (hud.batt !== null) lastBatt = hud.batt;
    if (hud.coins !== null && hud.coins > maxCoins) {
      maxCoins = hud.coins;
      log(`NEUE COINS: ${maxCoins}!`);
    }

    if (frame % 5 === 1) {
      log(`[${elapsed}s] Akku:${hud.batt ?? lastBatt}% Coins:${hud.coins ?? maxCoins} Station:${hud.hasStation} lowBatt:${lowBatt}`);
    }

    // Ladestation sichtbar
    if (hud.hasStation) {
      chargingCount++;
      log(`=== LADESTATION SICHTBAR [${chargingCount}x] ===\n${hud.text.substring(0, 500)}`);
      await screenshot(page, `${name}_ladestation_${chargingCount}`);
    }

    // Akku-Management
    const batt = hud.batt ?? lastBatt;
    if (batt <= 50 && !lowBatt) {
      log(`!!! AKKU ${batt}% - Fliege zur Ladestation !!!`);
      lowBatt = true;
      // Geradeaus fliegen zur Ladestation
      for (let i = 0; i < 5; i++) {
        await pressWith(page, 'w', 1000);
        await sleep(200);
      }
    } else if (batt >= 95 && lowBatt) {
      log(`Aufgeladen auf ${batt}% - Coins sammeln`);
      lowBatt = false;
    }

    if (!lowBatt) {
      // Coins sammeln: strukturiertes Flugmuster
      const [k, dur] = patterns[patIdx % patterns.length];
      await pressWith(page, k, dur);
      patIdx++;

      // Canvas fokussiert halten
      if (frame % 20 === 0) {
        await page.mouse.click(640, 360);
        await sleep(100);
      }
    } else {
      // Zur Ladestation: geradeaus
      await pressWith(page, 'w', 600);
      await sleep(200);
      await pressWith(page, 'Space', 300);
    }

    await sleep(500);
  }

  await screenshot(page, `${name}_ende`);
  log(`${name} ENDE: maxCoins=${maxCoins}, Ladestationen=${chargingCount}`);
  return { maxCoins, chargingCount };
}

async function main() {
  log('=== DRONE SPIELEN v2 ===');

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  try {
    await login(page);
    await screenshot(page, '00_menu');

    // Shop analysieren
    await openModal(page, 'Shop', '01_shop');

    // Quests analysieren
    await openModal(page, 'Quests', '02_quests');

    // Rangliste
    await openModal(page, 'Rangliste', '03_rangliste');

    // ================================
    // NORMAL WELT spielen
    // ================================
    await startWorld(page, 0);
    await screenshot(page, '04_normal_gestartet');
    const normalResult = await spielen(page, 'normal', 240000); // 4 Min
    log(`Normal: ${JSON.stringify(normalResult)}`);

    // Shop falls Coins gesammelt
    const txt = await bodyText(page);
    const coinMatch = txt.match(/(\d+)\s*Coins/);
    const totalCoins = coinMatch ? parseInt(coinMatch[1]) : 0;
    log(`Gesamt Coins: ${totalCoins}`);

    if (totalCoins >= 142) {
      log('Kaufe Zephyr I (142 Coins)...');
      await page.goto(BASE + '/game', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(3000);
      await page.click('button:has-text("Shop")');
      await sleep(3000);
      await screenshot(page, '05_shop_kaufen');
      // Klicke auf "Buy - 142 Coins"
      try {
        await page.click('button:has-text("Buy - 142")');
        await sleep(2000);
        await screenshot(page, '05_nach_kauf');
        log('Zephyr I gekauft!');
      } catch { log('Kauf fehlgeschlagen'); }
      await page.keyboard.press('Escape');
    }

    // ================================
    // MULTIPLAYER
    // ================================
    await page.goto(BASE + '/game', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(3000);
    await startWorld(page, 3); // Multiplayer = Index 3
    await screenshot(page, '10_mp_gestartet');
    const mpTxt = await bodyText(page);
    log(`MULTIPLAYER START:\n${mpTxt.substring(0, 3000)}`);

    // Im Multiplayer spielen
    const mpResult = await spielen(page, 'mp', 180000); // 3 Min
    log(`Multiplayer: ${JSON.stringify(mpResult)}`);

    // ================================
    // WÜSTE WELT
    // ================================
    await page.goto(BASE + '/game', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(3000);
    await startWorld(page, 1); // Wüste = Index 1
    await screenshot(page, '20_wueste_gestartet');
    const wuesResult = await spielen(page, 'wueste', 60000); // 1 Min
    log(`Wüste: ${JSON.stringify(wuesResult)}`);

    // ================================
    // PARKOUR WELT
    // ================================
    await page.goto(BASE + '/game', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(3000);
    await startWorld(page, 2); // Parkour = Index 2
    await screenshot(page, '30_parkour_gestartet');
    const pkResult = await spielen(page, 'parkour', 60000); // 1 Min
    log(`Parkour: ${JSON.stringify(pkResult)}`);

    log('\n=== ALLE WELTEN GESPIELT ===');

  } catch (e) {
    log(`FEHLER: ${e.message}\n${e.stack}`);
    await screenshot(page, 'error').catch(() => {});
  } finally {
    await browser.close();
    log('Fertig');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
