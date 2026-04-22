const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://drone-simulator-worlds-v-4--jonathan-r2015.replit.app';
const SS_DIR = '/home/user/Claude-spielt-mein-spiel/ss3';
const LOG = '/home/user/Claude-spielt-mein-spiel/v3_log.txt';

if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });
if (fs.existsSync(LOG)) fs.unlinkSync(LOG);

const log = msg => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
};
const ss = async (page, name) => {
  await page.screenshot({ path: path.join(SS_DIR, `${name}.png`), fullPage: true });
  log(`SS: ${name}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const txt = page => page.evaluate(() => document.body?.innerText?.substring(0, 8000) || '');

async function main() {
  log('=== DRONE v3 ===');

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  try {
    // LOGIN
    log('=== LOGIN ===');
    await page.goto(BASE + '/sign-up', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);
    const inputs = await page.$$('input');
    for (const i of inputs) {
      const t = await i.getAttribute('type').catch(() => 'text');
      await i.fill(t === 'password' ? 'DroneBot123' : 'ClaudeBot2025');
    }
    await page.click('button[type="submit"]');
    await sleep(5000);
    await ss(page, '00_menu');
    log('Menu: ' + (await txt(page)).substring(0, 200));

    // ANALYSE DOM - Was sind die "Play" Elemente?
    log('=== DOM ANALYSE ===');
    const allEls = await page.evaluate(() => {
      const result = [];
      document.querySelectorAll('*').forEach(el => {
        const t = el.innerText?.trim() || '';
        if ((t === '▶ Play' || t === 'Play' || t.includes('▶')) && el.children.length === 0) {
          const r = el.getBoundingClientRect();
          result.push({ tag: el.tagName, text: t, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), class: el.className });
        }
      });
      return result;
    });
    log('Play-Elemente: ' + JSON.stringify(allEls));

    // SHOP - direkt Text lesen ohne evaluate
    log('=== SHOP ===');
    await page.click('button:has-text("Shop")');
    await sleep(3000);
    await ss(page, '01_shop');
    // Lese Text direkt
    const shopTxt = await page.locator('body').innerText().catch(() => '');
    log('SHOP INHALT (erste 4000 Zeichen):\n' + shopTxt.substring(0, 4000));
    await page.keyboard.press('Escape');
    await sleep(1000);

    // QUESTS
    log('=== QUESTS ===');
    await page.click('button:has-text("Quests")');
    await sleep(3000);
    await ss(page, '02_quests');
    const questTxt = await page.locator('body').innerText().catch(() => '');
    log('QUESTS:\n' + questTxt.substring(0, 3000));
    await page.keyboard.press('Escape');
    await sleep(1000);

    // RANGLISTE
    log('=== RANGLISTE ===');
    await page.click('button:has-text("Rangliste")');
    await sleep(3000);
    await ss(page, '03_rangliste');
    const rankTxt = await page.locator('body').innerText().catch(() => '');
    log('RANGLISTE:\n' + rankTxt.substring(0, 1000));
    await page.keyboard.press('Escape');
    await sleep(1000);

    // NORMAL WELT STARTEN
    log('=== NORMAL WELT ===');
    // Koordinatenbasierter Klick - aus dem Screenshot: Normal-Play ist bei ~260, 155
    if (allEls.length > 0) {
      const normalPlay = allEls[0];
      log(`Klicke Normal Play bei (${normalPlay.x + normalPlay.w/2}, ${normalPlay.y + normalPlay.h/2})`);
      await page.mouse.click(normalPlay.x + normalPlay.w/2, normalPlay.y + normalPlay.h/2);
    } else {
      // Fallback: Koordinaten aus Screenshot
      log('Fallback: Klicke bei (260, 155)');
      await page.mouse.click(260, 155);
    }
    await sleep(5000);
    await ss(page, '04_nach_world_klick');
    const worldTxt = await page.locator('body').innerText().catch(() => '');
    log('Nach World-Klick:\n' + worldTxt.substring(0, 500));

    // Prüfe ob Spiel gestartet
    const spielGestartet = !worldTxt.includes('Wähle eine Welt');
    log('Spiel gestartet: ' + spielGestartet);

    if (spielGestartet) {
      // SPIELEN
      log('=== SPIELEN ===');
      await page.keyboard.down('Space');
      await sleep(1000);
      await page.keyboard.up('Space');

      const startTime = Date.now();
      let frame = 0;
      let lowBatt = false;

      while (Date.now() - startTime < 120000) {
        frame++;
        const t = Math.round((Date.now() - startTime) / 1000);

        if (frame % 4 === 0) await ss(page, `game_${t}s`);

        const pageText = await page.locator('body').innerText().catch(() => '');
        const battMatch = pageText.match(/(\d+)\s*%/);
        const batt = battMatch ? parseInt(battMatch[1]) : null;
        const coinMatch = pageText.match(/(\d+)\s*[Cc]oin/);
        const coins = coinMatch ? parseInt(coinMatch[1]) : null;
        const hasStation = pageText.toLowerCase().includes('ladestation') || pageText.includes('⚡') || pageText.includes('🔋');

        log(`[${t}s] Akku:${batt}% Coins:${coins} Station:${hasStation}`);

        if (hasStation) log('LADESTATION SICHTBAR: ' + pageText.substring(0, 300));

        if (batt !== null && batt <= 50 && !lowBatt) {
          log(`!!! AKKU ${batt}% <= 50% - FLIEGE ZUR LADESTATION !!!`);
          lowBatt = true;
        } else if (batt !== null && batt > 80) {
          lowBatt = false;
        }

        if (!lowBatt) {
          const keys = ['w','d','w','d','w','a','s','a','w','d'];
          const k = keys[frame % keys.length];
          await page.keyboard.down(k);
          await sleep(400);
          await page.keyboard.up(k);
        }
        await sleep(2000);
      }
      await ss(page, 'game_end');
    } else {
      log('=== FALLBACK: Versuche andere Klick-Methoden ===');

      // Alle klickbaren Elemente finden
      const clickable = await page.evaluate(() => {
        const result = [];
        const els = document.querySelectorAll('div, span, p, a, button');
        for (const el of els) {
          const t = el.innerText?.trim() || '';
          if (t.includes('Play') || t.includes('▶') || t.includes('Normal') || t.includes('Wüste') || t.includes('Parkour') || t.includes('Multiplayer')) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              result.push({ tag: el.tagName, text: t.substring(0, 50), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
            }
          }
        }
        return result.slice(0, 20);
      });
      log('Klickbare Elemente: ' + JSON.stringify(clickable, null, 2));

      // Versuche jeden gefundenen Play-Element zu klicken
      for (const el of clickable) {
        if (el.text.includes('Play') || el.text.includes('▶')) {
          log(`Klicke: ${JSON.stringify(el)}`);
          await page.mouse.click(el.x + el.w/2, el.y + el.h/2);
          await sleep(3000);
          const t2 = await page.locator('body').innerText().catch(() => '');
          if (!t2.includes('Wähle eine Welt')) {
            log('SPIEL GESTARTET nach fallback-Klick!');
            break;
          }
        }
      }
      await ss(page, '04b_fallback');
    }

    // MULTIPLAYER
    log('=== MULTIPLAYER ===');
    await page.goto(BASE + '/game', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(3000);

    // Finde und klicke Multiplayer Play-Button (4. Play-Button)
    const mpEl = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('*')).filter(e => {
        const t = e.innerText?.trim() || '';
        return (t === '▶ Play' || t === 'Play') && e.children.length === 0;
      });
      if (els.length >= 4) {
        const mp = els[3];
        const r = mp.getBoundingClientRect();
        return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), text: mp.innerText };
      }
      return null;
    });

    if (mpEl) {
      log(`Multiplayer Play: ${JSON.stringify(mpEl)}`);
      await page.mouse.click(mpEl.x, mpEl.y);
    } else {
      // Koordinaten aus Screenshot: Multiplayer-Karte ist unten rechts ~800, 238
      await page.mouse.click(800, 238);
    }
    await sleep(5000);
    await ss(page, '10_multiplayer');
    const mpTxt = await page.locator('body').innerText().catch(() => '');
    log('MULTIPLAYER:\n' + mpTxt.substring(0, 2000));

    for (let i = 0; i < 6; i++) {
      await sleep(4000);
      await ss(page, `mp_${i}`);
      const t = await page.locator('body').innerText().catch(() => '');
      log(`MP ${i}: ${t.substring(0, 400)}`);
    }

    log('=== FERTIG ===');

  } catch (e) {
    log('FEHLER: ' + e.message + '\n' + e.stack);
    await ss(page, 'error').catch(() => {});
  } finally {
    await browser.close();
    log('Browser zu');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
