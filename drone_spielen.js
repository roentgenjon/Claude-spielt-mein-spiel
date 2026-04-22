const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://drone-simulator-worlds-v-4--jonathan-r2015.replit.app';
const SS = '/home/user/Claude-spielt-mein-spiel/spielen_ss';
const LOG = '/home/user/Claude-spielt-mein-spiel/spielen_log.txt';

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

async function main() {
  log('=== DRONE SPIELEN ===');

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  try {
    // ==========================================
    // 1. LOGIN
    // ==========================================
    log('=== LOGIN ===');
    await page.goto(BASE + '/sign-in', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    // Versuche Login mit bestehendem Account
    await page.fill('input:not([type="password"])', 'ClaudeBot7777');
    await page.fill('input[type="password"]', 'DroneBot123');
    await page.click('button:has-text("Einloggen")');
    await sleep(4000);

    let txt = await bodyText(page);
    if (!txt.includes('DRONE SIMULATOR')) {
      log('Login fehlgeschlagen - neues Konto');
      await page.goto(BASE + '/sign-up', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(2000);
      const user = 'DroneClaude' + Date.now().toString().slice(-5);
      const pass = 'DroneBot123';
      await page.fill('input:not([type="password"])', user);
      await page.fill('input[type="password"]', pass);
      await page.click('button[type="submit"]');
      await sleep(5000);
      log(`Neuer Account: ${user}`);
    }

    txt = await bodyText(page);
    log('Eingeloggt: ' + txt.substring(0, 200));
    await screenshot(page, '00_menu');

    // ==========================================
    // 2. NORMAL WELT STARTEN - mit locator
    // ==========================================
    log('\n=== NORMAL WELT STARTEN ===');

    // Schließe alle offenen Modals
    await page.keyboard.press('Escape');
    await sleep(500);

    // Warte auf Hauptmenü
    await page.waitForSelector('text=DRONE SIMULATOR', { timeout: 10000 }).catch(() => {});
    await sleep(1000);

    // Finde "▶ Play" DIV-Elemente direkt
    const playDivs = page.locator('div').filter({ hasText: /^▶ Play$/ });
    const count = await playDivs.count();
    log(`Gefundene Play-Divs: ${count}`);

    if (count > 0) {
      // Normal Welt = erster Play-Button
      const normalPlay = playDivs.first();
      const box = await normalPlay.boundingBox();
      log(`Normal Play Box: ${JSON.stringify(box)}`);
      await normalPlay.click({ force: true });
      log('Normal Play geklickt!');
    } else {
      // Fallback: koordinatenbasiert
      log('Kein Play-Div gefunden, Koordinaten-Fallback');
      await page.mouse.click(524, 271);
    }

    await sleep(5000);
    await screenshot(page, '01_nach_play');
    txt = await bodyText(page);
    log('Nach Normal Play: ' + txt.substring(0, 300));

    // Prüfe ob Spiel gestartet (Canvas-Modus)
    // Im Spiel: "Wähle eine Welt" verschwindet nicht aus DOM, aber spezifische Spielelemente erscheinen
    const isInGame = txt.includes('🔋') || txt.includes('%') ||
                     !txt.includes('Wähle eine Welt') ||
                     await page.evaluate(() => {
                       const canvas = document.querySelector('canvas');
                       // Canvas Kontext aktiv?
                       return canvas && canvas.width > 0;
                     }).catch(() => false);

    log(`Im Spiel: ${isInGame}`);

    // ==========================================
    // 3. SPIELEN - 3 Minuten
    // ==========================================
    if (true) { // Immer versuchen zu spielen
      log('\n=== SPIELEN ===');

      // Drohne starten
      await page.mouse.click(640, 360); // Canvas anklicken
      await sleep(500);
      await page.keyboard.press('Space');
      await sleep(300);
      await page.keyboard.press('w');
      await sleep(500);

      const START = Date.now();
      let frame = 0;
      let coins = 0;
      let maxCoins = 0;
      let lowBatt = false;

      while (Date.now() - START < 180000) { // 3 Min
        frame++;
        const t = Math.round((Date.now() - START) / 1000);

        // Screenshot alle 15s
        if (t % 15 < 2.5) await screenshot(page, `game_${String(t).padStart(4,'0')}s`);

        // Spielzustand lesen
        const pageText = await bodyText(page);
        const battMatch = pageText.match(/(\d+)\s*%/);
        const batt = battMatch ? parseInt(battMatch[1]) : null;
        const coinMatch = pageText.match(/(\d+)\s*(?:Coins|coins)/i);
        coins = coinMatch ? parseInt(coinMatch[1]) : coins;
        if (coins > maxCoins) maxCoins = coins;

        const hasStation = pageText.includes('⚡') || pageText.includes('🔋') ||
                           pageText.toLowerCase().includes('ladestation') ||
                           pageText.toLowerCase().includes('charging');

        if (frame % 5 === 1) {
          log(`[${t}s] Akku:${batt}% Coins:${coins} Station:${hasStation}`);
          if (hasStation) log(`LADESTATION SICHTBAR:\n${pageText.substring(0, 500)}`);
        }

        // Akku-Management: Bei <= 50% keine Coins sammeln, Ladestation ansteuern
        if (batt !== null && batt <= 50 && !lowBatt) {
          log(`!!! AKKU ${batt}% - LADE STATION ANFLIEGEN !!!`);
          lowBatt = true;
        }
        if (batt !== null && batt >= 90 && lowBatt) {
          log(`Akku wieder voll (${batt}%) - Weiter Coins sammeln`);
          lowBatt = false;
        }

        // Drohne steuern
        if (!lowBatt) {
          // Coins sammeln: Kreismuster fliegen
          const pattern = ['w','w','d','w','d','s','d','s','a','s','a','w','a','w'];
          const k = pattern[frame % pattern.length];
          await page.keyboard.down(k);
          await sleep(400);
          await page.keyboard.up(k);
          await page.keyboard.press('Space'); // Höhe halten
        } else {
          // Ladestation ansteuern: konstant eine Richtung
          await page.keyboard.press('w');
          await sleep(300);
        }

        await sleep(1500);
      }

      await screenshot(page, 'game_final');
      log(`Spielende. Max Coins: ${maxCoins}`);

      // Kaufe Powerup wenn genug Coins
      if (maxCoins >= 100) {
        log('\n=== SHOP - KAUFE POWERUP ===');
        // Zurück zum Menü
        await page.keyboard.press('Escape');
        await sleep(2000);
        await page.goto(BASE + '/game', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(3000);
        await page.click('button:has-text("Shop")');
        await sleep(3000);
        await screenshot(page, 'shop_kaufen');
        const shopTxt = await bodyText(page);
        log('Shop nach Spiel:\n' + shopTxt.substring(0, 2000));
        await page.keyboard.press('Escape');
      }
    }

    // ==========================================
    // 4. MULTIPLAYER - Analyse
    // ==========================================
    log('\n=== MULTIPLAYER ===');
    await page.goto(BASE + '/game', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(3000);
    await screenshot(page, 'mp_menu');

    // Multiplayer Play (4. Play-Button)
    const mpPlayDivs = page.locator('div').filter({ hasText: /^▶ Play$/ });
    const mpCount = await mpPlayDivs.count();
    log(`Multiplayer Play-Divs: ${mpCount}`);

    if (mpCount >= 4) {
      await mpPlayDivs.nth(3).click({ force: true });
      log('Multiplayer geklickt');
    } else {
      await page.mouse.click(756, 449);
    }

    await sleep(5000);
    await screenshot(page, 'mp_start');
    const mpTxt = await bodyText(page);
    log('MULTIPLAYER INHALT:\n' + mpTxt.substring(0, 5000));

    // Ladestation in Multiplayer suchen
    if (mpTxt.includes('Ladestation') || mpTxt.includes('⚡')) {
      log('\nLADESTATION QUEST GEFUNDEN IN MULTIPLAYER!');
      const lines = mpTxt.split('\n').filter(l => l.includes('Ladestation') || l.includes('⚡'));
      log('Ladestation-Zeilen: ' + JSON.stringify(lines));
    }

    // Multiplayer Screenshots
    for (let i = 0; i < 5; i++) {
      await sleep(4000);
      await screenshot(page, `mp_${i}`);
      const t = await bodyText(page);
      if (t.length > 100) log(`MP[${i}]: ${t.substring(0, 400)}`);
    }

    // ==========================================
    // 5. WÜSTE WELT erkunden
    // ==========================================
    log('\n=== WÜSTE WELT ===');
    await page.goto(BASE + '/game', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(3000);

    const wPlayDivs = page.locator('div').filter({ hasText: /^▶ Play$/ });
    const wCount = await wPlayDivs.count();
    if (wCount >= 2) {
      await wPlayDivs.nth(1).click({ force: true });
      await sleep(4000);
      await screenshot(page, 'wueste');
      const wt = await bodyText(page);
      log('WÜSTE:\n' + wt.substring(0, 500));

      // Kurz spielen
      await page.mouse.click(640, 360);
      await sleep(500);
      await page.keyboard.press('Space');
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('w');
        await sleep(300);
        await screenshot(page, `wueste_${i}`);
        const wt2 = await bodyText(page);
        log(`Wüste[${i}]: ${wt2.substring(0, 200)}`);
        await sleep(1000);
      }
    }

    log('\n=== ALLES ERLEDIGT ===');

  } catch (e) {
    log(`FEHLER: ${e.message}\n${e.stack}`);
    await screenshot(page, 'error').catch(() => {});
  } finally {
    await browser.close();
    log('Browser geschlossen');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
