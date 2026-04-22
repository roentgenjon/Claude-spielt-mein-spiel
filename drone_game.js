const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://drone-simulator-worlds-v-4--jonathan-r2015.replit.app';
const SIGN_IN_URL = BASE + '/sign-in';
const SCREENSHOT_DIR = '/home/user/Claude-spielt-mein-spiel/screenshots';
const LOG_FILE = '/home/user/Claude-spielt-mein-spiel/game_log.txt';

if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function ss(page, name) {
  const file = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  log(`Screenshot gespeichert: ${name}.png`);
  return file;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitAndAnalyze(page, label, waitMs = 2000) {
  await sleep(waitMs);
  const info = await page.evaluate(() => {
    const get = sel => Array.from(document.querySelectorAll(sel)).map(e => e.innerText?.trim()).filter(Boolean);
    return {
      url: window.location.href,
      title: document.title,
      text: document.body?.innerText?.substring(0, 5000) || '',
      buttons: get('button'),
      links: Array.from(document.querySelectorAll('a')).map(a => ({ text: a.innerText?.trim(), href: a.href })),
      inputs: Array.from(document.querySelectorAll('input')).map(i => ({
        name: i.name, id: i.id, type: i.type, placeholder: i.placeholder
      })),
      hasCanvas: !!document.querySelector('canvas'),
      canvasCount: document.querySelectorAll('canvas').length,
    };
  });
  log(`\n--- ${label} ---`);
  log(`URL: ${info.url}`);
  log(`Titel: ${info.title}`);
  log(`Buttons: ${JSON.stringify(info.buttons)}`);
  log(`Links: ${JSON.stringify(info.links)}`);
  log(`Inputs: ${JSON.stringify(info.inputs)}`);
  log(`Canvas: ${info.hasCanvas} (${info.canvasCount})`);
  log(`Seitentext:\n${info.text}`);
  return info;
}

async function tryClick(page, selectors) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        const text = await el.innerText().catch(() => '?');
        log(`Klicke auf: "${text}" [${sel}]`);
        await el.click();
        return true;
      }
    } catch (e) { /* weiter */ }
  }
  return false;
}

async function main() {
  log('=== Drone Game Bot v2 gestartet ===');
  log(`Ziel: ${SIGN_IN_URL}`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();
  page.on('console', msg => { if (msg.type() === 'error') log(`[JS-ERR] ${msg.text()}`); });

  try {
    // ================================================================
    // SCHRITT 1: Sign-In Seite laden
    // ================================================================
    log('\n=== SCHRITT 1: Sign-In Seite ===');
    await page.goto(SIGN_IN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const info1 = await waitAndAnalyze(page, 'Sign-In Seite', 3000);
    await ss(page, '01_signin');

    // ================================================================
    // SCHRITT 2: Account erstellen
    // ================================================================
    log('\n=== SCHRITT 2: Account erstellen ===');

    // "Account erstellen" Button finden
    const accountBtn = await tryClick(page, [
      'text=Account erstellen',
      'button:has-text("Account")',
      'a:has-text("Account")',
      'button:has-text("erstellen")',
      'button:has-text("Register")',
      'button:has-text("Sign Up")',
    ]);

    await sleep(2000);
    await ss(page, '02_after_account_btn');
    const info2 = await waitAndAnalyze(page, 'Nach Account-Button-Klick');

    // Username und Passwort
    const USERNAME = 'ClaudeBot' + Math.floor(Math.random() * 9999);
    const PASSWORD = 'DroneBot123';
    log(`Credentials: ${USERNAME} / ${PASSWORD}`);

    // Alle Input-Felder füllen
    const inputs = await page.$$('input');
    log(`Inputs gefunden: ${inputs.length}`);
    for (const inp of inputs) {
      const type = await inp.getAttribute('type').catch(() => 'text');
      const name = await inp.getAttribute('name').catch(() => '');
      const ph = await inp.getAttribute('placeholder').catch(() => '');
      log(`  Input: type=${type} name=${name} placeholder=${ph}`);
      if (type === 'password') {
        await inp.fill(PASSWORD);
        log('  -> PASSWORD eingetragen');
      } else {
        await inp.fill(USERNAME);
        log('  -> USERNAME eingetragen');
      }
    }

    await ss(page, '03_form_filled');

    // Submit
    const submitted = await tryClick(page, [
      'button[type="submit"]',
      'button:has-text("Erstellen")',
      'button:has-text("Create")',
      'button:has-text("Account erstellen")',
      'button:has-text("Weiter")',
      'input[type="submit"]',
    ]);
    log(`Submit geklickt: ${submitted}`);
    await sleep(4000);
    await ss(page, '04_after_submit');
    const info3 = await waitAndAnalyze(page, 'Nach Account-Erstellung');

    // Falls immer noch auf Sign-In - versuche Login
    if (page.url().includes('sign-in') || info3.text.includes('Account erstellen')) {
      log('Noch auf Sign-In Seite - versuche Einloggen...');
      await tryClick(page, [
        'text=Einloggen',
        'button:has-text("Einlog")',
        'a:has-text("Login")',
        'button:has-text("Login")',
      ]);
      await sleep(2000);
      await ss(page, '05_login_form');

      const loginInputs = await page.$$('input');
      for (const inp of loginInputs) {
        const type = await inp.getAttribute('type').catch(() => 'text');
        if (type === 'password') await inp.fill(PASSWORD);
        else await inp.fill(USERNAME);
      }
      await tryClick(page, ['button[type="submit"]', 'button:has-text("Login")', 'button:has-text("Einloggen")']);
      await sleep(4000);
      await ss(page, '06_after_login');
      await waitAndAnalyze(page, 'Nach Login');
    }

    log('\n=== EINGELOGGT - Erkunde alle Bereiche ===');
    log(`Aktuelle URL: ${page.url()}`);

    // ================================================================
    // SCHRITT 3: Alle Seiten erkunden
    // ================================================================
    const pages_to_explore = [
      { path: '/game', name: 'Spiel' },
      { path: '/shop', name: 'Shop' },
      { path: '/quests', name: 'Quests' },
      { path: '/multiplayer', name: 'Multiplayer' },
      { path: '/profile', name: 'Profil' },
      { path: '/leaderboard', name: 'Rangliste' },
      { path: '/map', name: 'Karte' },
      { path: '/world', name: 'Welt' },
      { path: '/charging', name: 'Ladestationen' },
      { path: '/stations', name: 'Stationen' },
    ];

    for (const p of pages_to_explore) {
      try {
        log(`\n=== Erkunde: ${p.name} (${p.path}) ===`);
        await page.goto(BASE + p.path, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(3000);
        await ss(page, `explore_${p.name.toLowerCase()}`);
        const pi = await waitAndAnalyze(page, p.name);

        // Wenn Spiel-Canvas gefunden -> beobachte es
        if (pi.hasCanvas && p.path === '/game') {
          log('CANVAS GEFUNDEN - Spiel läuft! Beobachte Spielzustand...');
          for (let i = 0; i < 5; i++) {
            await sleep(3000);
            await ss(page, `game_state_${i}`);
            const gameState = await page.evaluate(() => {
              const canvas = document.querySelector('canvas');
              // Suche nach Spielinfo in der UI
              const allText = document.body.innerText;
              const batteryMatch = allText.match(/(\d+)%/g);
              const coinMatch = allText.match(/coin[s]?\s*:?\s*(\d+)/i);
              return {
                text: allText.substring(0, 2000),
                battery: batteryMatch,
                coins: coinMatch,
              };
            });
            log(`Spielzustand ${i}: ${JSON.stringify(gameState)}`);
          }
        }
      } catch (e) {
        log(`Fehler bei ${p.name}: ${e.message}`);
      }
    }

    // ================================================================
    // SCHRITT 4: Zurück zum Spiel und spielen
    // ================================================================
    log('\n=== SCHRITT 4: Spiel spielen ===');
    await page.goto(BASE + '/game', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(4000);
    await ss(page, 'game_start');

    const hasCanvas = await page.$('canvas');
    if (hasCanvas) {
      log('Spiel läuft mit Canvas! Starte Spielschleife...');

      // Spiel-Loop: 3 Minuten beobachten und spielen
      const startTime = Date.now();
      let loopCount = 0;
      while (Date.now() - startTime < 180000) {
        loopCount++;
        await sleep(5000);
        await ss(page, `gameplay_${String(loopCount).padStart(3,'0')}`);

        const state = await page.evaluate(() => {
          const text = document.body?.innerText || '';
          return {
            fullText: text.substring(0, 3000),
            url: window.location.href,
          };
        });

        log(`[Loop ${loopCount}] ${state.fullText.substring(0, 500)}`);

        // Taste drücken um Drohne zu steuern (WASD / Pfeiltasten)
        // Coins einsammeln = nach rechts/links fliegen
        if (loopCount % 4 === 1) await page.keyboard.press('ArrowRight');
        else if (loopCount % 4 === 2) await page.keyboard.press('ArrowUp');
        else if (loopCount % 4 === 3) await page.keyboard.press('ArrowLeft');
        else await page.keyboard.press('ArrowDown');
      }
    } else {
      // Kein Canvas - Seite hat andere Struktur
      log('Kein Canvas - analysiere alternative Spielstruktur');
      const finalState = await waitAndAnalyze(page, 'Finale Spielseite', 2000);
    }

    log('\n=== DRONE GAME BOT FERTIG ===');

  } catch (error) {
    log(`\nFEHLER: ${error.message}`);
    log(error.stack);
    await ss(page, 'error').catch(() => {});
  } finally {
    await browser.close();
    log('Browser geschlossen');
  }
}

main().catch(err => {
  console.error('Kritischer Fehler:', err);
  process.exit(1);
});
