const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://drone-simulator-worlds-v-4--jonathan-r2015.replit.app';
const SIGN_IN_URL = BASE + '/sign-in';
const SS_DIR = '/home/user/Claude-spielt-mein-spiel/screenshots3';
const LOG = '/home/user/Claude-spielt-mein-spiel/play2_log.txt';

if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });
if (fs.existsSync(LOG)) fs.unlinkSync(LOG);

const log = msg => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
};

const ss = async (page, name) => {
  const f = path.join(SS_DIR, `${name}.png`);
  await page.screenshot({ path: f, fullPage: true });
  log(`Screenshot: ${name}`);
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const getText = page => page.evaluate(() => document.body?.innerText?.substring(0, 6000) || '');

async function main() {
  log('=== DRONE GAME PLAY v2 ===');

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  try {
    // ======================================================
    // LOGIN (existierender Account)
    // ======================================================
    log('\n--- LOGIN ---');
    await page.goto(SIGN_IN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    // Direkt auf Sign-Up gehen (Account erstellen)
    await page.goto(BASE + '/sign-up', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);

    await page.fill('input[type="text"], input:not([type="password"])', 'ClaudeBot2025');
    await page.fill('input[type="password"]', 'DroneBot123');
    await ss(page, '00_form');
    await page.click('button[type="submit"]');
    await sleep(5000);

    await ss(page, '01_nach_login');
    const mainText = await getText(page);
    log('Hauptmenü: ' + mainText.substring(0, 500));

    // ======================================================
    // DOM-STRUKTUR ANALYSIEREN
    // ======================================================
    log('\n--- DOM ANALYSE ---');
    const domInfo = await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button'));
      return allButtons.map(b => ({
        text: b.innerText?.trim(),
        className: b.className,
        id: b.id,
        rect: (() => { const r = b.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
      }));
    });
    log('Alle Buttons: ' + JSON.stringify(domInfo, null, 2));

    // ======================================================
    // SHOP ÖFFNEN - Scroll & alles erfassen
    // ======================================================
    log('\n--- SHOP ANALYSE ---');
    await page.click('button:has-text("Shop")');
    await sleep(3000);
    await ss(page, '02_shop');

    // Shop scrollen und alles lesen
    const shopContent = await page.evaluate(() => {
      const shopEl = document.querySelector('[class*="shop"], [class*="Shop"]') || document.body;
      return shopEl.innerText;
    });
    log('SHOP INHALT:\n' + shopContent.substring(0, 8000));
    await ss(page, '02b_shop_scroll');

    // Shop schließen
    await page.keyboard.press('Escape');
    await sleep(1000);

    // ======================================================
    // QUESTS ÖFFNEN
    // ======================================================
    log('\n--- QUESTS ANALYSE ---');
    await page.click('button:has-text("Quests")');
    await sleep(3000);
    await ss(page, '03_quests');

    const questContent = await getText(page);
    log('QUESTS:\n' + questContent);

    await page.keyboard.press('Escape');
    await sleep(1000);

    // ======================================================
    // RANGLISTE
    // ======================================================
    log('\n--- RANGLISTE ---');
    await page.click('button:has-text("Rangliste")');
    await sleep(3000);
    await ss(page, '04_rangliste');
    const rankContent = await getText(page);
    log('RANGLISTE:\n' + rankContent);
    await page.keyboard.press('Escape');
    await sleep(1000);

    // ======================================================
    // NORMAL WELT STARTEN - per Koordinaten klicken
    // ======================================================
    log('\n--- NORMAL WELT STARTEN ---');

    // Finde den Play-Button in der Normal-Welt-Karte
    const normalPlayBtn = await page.evaluate(() => {
      // Suche nach allen Buttons
      const btns = Array.from(document.querySelectorAll('button'));
      // Finde Play-Buttons (▶ Play)
      const playBtns = btns.filter(b => b.innerText?.includes('Play') || b.innerText?.includes('▶'));
      if (playBtns.length > 0) {
        const rect = playBtns[0].getBoundingClientRect();
        return { found: true, x: rect.x + rect.width/2, y: rect.y + rect.height/2, text: playBtns[0].innerText, count: playBtns.length };
      }

      // Versuche mit Text-Suche in allen Elementen
      const allEls = Array.from(document.querySelectorAll('*'));
      for (const el of allEls) {
        if (el.children.length === 0 && (el.innerText?.trim() === '▶ Play' || el.innerText?.trim() === 'Play')) {
          const rect = el.getBoundingClientRect();
          return { found: true, x: rect.x + rect.width/2, y: rect.y + rect.height/2, text: el.innerText, tagName: el.tagName };
        }
      }
      return { found: false };
    });

    log('Normal Play Button: ' + JSON.stringify(normalPlayBtn));

    if (normalPlayBtn.found) {
      await page.mouse.click(normalPlayBtn.x, normalPlayBtn.y);
      log(`Geklickt auf (${normalPlayBtn.x}, ${normalPlayBtn.y})`);
    } else {
      // Klicke per Koordinaten auf den Normal-Bereich (oben links der 4 Karten)
      log('Klicke per Koordinate auf Normal-Play...');
      await page.mouse.click(260, 155); // Normal-Karte Position
      await sleep(1000);
      await page.mouse.click(260, 155);
    }

    await sleep(5000);
    await ss(page, '05_nach_world_klick');
    const worldText = await getText(page);
    log('Nach World-Klick: ' + worldText.substring(0, 500));

    // Falls immer noch im Menü -> direkt URL probieren
    if (worldText.includes('DRONE SIMULATOR') && worldText.includes('Wähle eine Welt')) {
      log('Immer noch im Menü - versuche andere Methoden...');

      // Alle ▶ Play Elemente per XPath
      const xpathResult = await page.evaluate(() => {
        const result = document.evaluate(
          "//*[contains(text(), 'Play') or contains(text(), '▶')]",
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null
        );
        const els = [];
        for (let i = 0; i < result.snapshotLength; i++) {
          const el = result.snapshotItem(i);
          const rect = el.getBoundingClientRect();
          els.push({ tag: el.tagName, text: el.textContent?.trim(), x: rect.x, y: rect.y, w: rect.width, h: rect.height, class: el.className });
        }
        return els;
      });
      log('XPath Play-Elemente: ' + JSON.stringify(xpathResult));

      if (xpathResult.length > 0) {
        const first = xpathResult[0];
        log(`Klicke auf erstes Play-Element: ${JSON.stringify(first)}`);
        await page.mouse.click(first.x + first.w/2, first.y + first.h/2);
        await sleep(5000);
        await ss(page, '05b_nach_xpath_klick');
      }
    }

    // ======================================================
    // SPIELEN
    // ======================================================
    log('\n--- SPIELEN ---');
    const gameText2 = await getText(page);
    log('Spielzustand: ' + gameText2.substring(0, 800));

    // 3D-Spiel ist aktiv wenn keine "Wähle eine Welt" Meldung da ist
    const isPlaying = !gameText2.includes('Wähle eine Welt');
    log(`Spielen aktiv: ${isPlaying}`);

    if (isPlaying) {
      // WASD + Space für Drohnen-Steuerung
      // Space = aufsteigen, Shift = absteigen, W/S vor/zurück, A/D links/rechts
      log('Starte Drohne...');
      await page.keyboard.down('Space');
      await sleep(2000);
      await page.keyboard.up('Space');
      await sleep(1000);
      await ss(page, '06_spiel_gestartet');

      // Spielschleife - 5 Minuten
      const START = Date.now();
      let frame = 0;
      let lowBattery = false;

      while (Date.now() - START < 300000) {
        frame++;
        const elapsed = Math.round((Date.now() - START) / 1000);

        // Screenshot alle 15 Sekunden
        if (frame % 3 === 0) {
          await ss(page, `spiel_${String(elapsed).padStart(4,'0')}s`);
        }

        // Text aus DOM lesen
        const txt = await getText(page);
        const battMatch = txt.match(/(\d+)\s*%/);
        const batt = battMatch ? parseInt(battMatch[1]) : null;
        log(`[${elapsed}s] Akku: ${batt}% | Text: ${txt.substring(0, 200)}`);

        // Akku-Management
        if (batt !== null) {
          if (batt <= 50 && !lowBattery) {
            log(`!!! AKKU ${batt}% - FLIEGE ZUR LADESTATION !!!`);
            lowBattery = true;
            // Nicht mehr Coins sammeln, fliege zur Ladestation
            await page.keyboard.press('Space'); // Richtung halten
          } else if (batt > 80) {
            lowBattery = false;
          }
        }

        // Drohne steuern
        if (!lowBattery) {
          // Coins sammeln: in Kreisen fliegen
          const moveKeys = ['w','d','w','d','w','a','w','a','s','d','s','a'];
          const key = moveKeys[frame % moveKeys.length];
          await page.keyboard.down(key);
          await sleep(500);
          await page.keyboard.up(key);
        }

        await sleep(2000);
      }
    } else {
      log('Spiel nicht gestartet - analysiere was zu sehen ist');
      await ss(page, '06_spiel_nicht_gestartet');

      // Canvas-Inhalt versuchen zu lesen
      const canvasInfo = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return 'Kein Canvas';
        return `Canvas: ${canvas.width}x${canvas.height}, id=${canvas.id}, class=${canvas.className}`;
      });
      log('Canvas: ' + canvasInfo);
    }

    // ======================================================
    // MULTIPLAYER ERKUNDEN
    // ======================================================
    log('\n--- MULTIPLAYER ---');
    await page.goto(BASE + '/game', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(3000);

    // Multiplayer Play Button (4. Play Button)
    const mpResult = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const playBtns = btns.filter(b => b.innerText?.includes('Play') || b.innerText?.includes('▶'));
      if (playBtns.length >= 4) {
        const mp = playBtns[3];
        const rect = mp.getBoundingClientRect();
        return { x: rect.x + rect.width/2, y: rect.y + rect.height/2, text: mp.innerText };
      }
      return null;
    });

    if (mpResult) {
      log(`Multiplayer Play Button: ${JSON.stringify(mpResult)}`);
      await page.mouse.click(mpResult.x, mpResult.y);
      await sleep(5000);
      await ss(page, '10_multiplayer');
      const mpText = await getText(page);
      log('MULTIPLAYER:\n' + mpText.substring(0, 2000));

      // Weiter beobachten
      for (let i = 0; i < 8; i++) {
        await sleep(4000);
        await ss(page, `mp_${i}`);
        const t = await getText(page);
        log(`MP [${i}]: ${t.substring(0, 500)}`);

        // Ladestation-Info suchen
        if (t.toLowerCase().includes('ladestation') || t.toLowerCase().includes('charge') || t.includes('⚡') || t.includes('🔋')) {
          log('LADESTATION GEFUNDEN: ' + t);
        }
      }
    }

    log('\n=== ANALYSE ABGESCHLOSSEN ===');

  } catch (err) {
    log(`FEHLER: ${err.message}\n${err.stack}`);
    await ss(page, 'error').catch(() => {});
  } finally {
    await browser.close();
    log('Browser geschlossen');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
