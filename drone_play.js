const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://drone-simulator-worlds-v-4--jonathan-r2015.replit.app';
const SIGN_IN_URL = BASE + '/sign-in';
const SCREENSHOT_DIR = '/home/user/Claude-spielt-mein-spiel/screenshots2';
const LOG_FILE = '/home/user/Claude-spielt-mein-spiel/play_log.txt';

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
  log(`Screenshot: ${name}.png`);
  return file;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getPageText(page) {
  return page.evaluate(() => document.body?.innerText?.substring(0, 5000) || '');
}

async function clickAndCapture(page, selector, name, waitMs = 2000) {
  try {
    const el = await page.$(selector);
    if (!el) {
      log(`Element nicht gefunden: ${selector}`);
      return false;
    }
    const txt = await el.innerText().catch(() => '?');
    log(`Klicke: "${txt}" [${selector}]`);
    await el.click();
    await sleep(waitMs);
    await ss(page, name);
    const text = await getPageText(page);
    log(`Seiteninhalt nach Klick:\n${text}`);
    return true;
  } catch (e) {
    log(`Fehler beim Klicken auf ${selector}: ${e.message}`);
    return false;
  }
}

async function login(page, username, password) {
  log('\n=== LOGIN ===');
  await page.goto(SIGN_IN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);

  // Falls Account noch nicht existiert -> erstellen
  const btns = await page.$$eval('button', b => b.map(e => e.innerText.trim()));
  log('Buttons auf Sign-In: ' + JSON.stringify(btns));

  if (btns.some(b => b.includes('Erstellen') || b.includes('Account'))) {
    // Direkt zur /sign-up navigieren
    await page.goto(BASE + '/sign-up', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
  }

  const inputs = await page.$$('input');
  for (const inp of inputs) {
    const type = await inp.getAttribute('type').catch(() => 'text');
    if (type === 'password') await inp.fill(password);
    else await inp.fill(username);
  }
  await ss(page, '00_login_form');

  // Submit
  const submit = await page.$('button[type="submit"]') || await page.$('button:has-text("Erstellen")') || await page.$('button:has-text("Einloggen")');
  if (submit) {
    await submit.click();
    log('Login/Register submitted');
    await sleep(4000);
  }

  const text = await getPageText(page);
  log('Nach Login: ' + text.substring(0, 500));
  await ss(page, '01_nach_login');
}

async function exploreShop(page) {
  log('\n=== SHOP ERKUNDEN ===');
  // Shop Button klicken
  await clickAndCapture(page, 'button:has-text("Shop")', '02_shop_geoeffnet', 3000);

  // Alle Shop-Elemente analysieren
  const shopContent = await page.evaluate(() => {
    // Suche nach Modal/Overlay
    const modals = document.querySelectorAll('[class*="modal"], [class*="overlay"], [class*="popup"], [class*="shop"], [role="dialog"]');
    const modalText = Array.from(modals).map(m => m.innerText).join('\n');

    // Alle sichtbaren Elemente mit Preisen
    const priceEls = document.querySelectorAll('*');
    const pricesText = Array.from(priceEls)
      .filter(e => e.children.length === 0 && (e.innerText?.includes('Münzen') || e.innerText?.includes('coins') || e.innerText?.includes('🪙') || e.innerText?.includes('💰')))
      .map(e => e.innerText?.trim())
      .filter(Boolean);

    return {
      modalText,
      pricesText,
      fullText: document.body.innerText.substring(0, 5000),
    };
  });

  log('Shop Modal Text: ' + shopContent.modalText);
  log('Preise: ' + JSON.stringify(shopContent.pricesText));
  log('Shop Volltext: ' + shopContent.fullText);

  // Zurück
  const backBtn = await page.$('button:has-text("←"), button:has-text("Zurück"), button:has-text("✕"), button:has-text("X"), button:has-text("Schließen")');
  if (backBtn) {
    await backBtn.click();
    await sleep(1000);
  } else {
    await page.keyboard.press('Escape');
    await sleep(1000);
  }
}

async function exploreQuests(page) {
  log('\n=== QUESTS ERKUNDEN ===');
  await clickAndCapture(page, 'button:has-text("Quests")', '03_quests_geoeffnet', 3000);

  const questContent = await page.evaluate(() => ({
    fullText: document.body.innerText.substring(0, 5000),
  }));
  log('Quests Inhalt: ' + questContent.fullText);

  const backBtn = await page.$('button:has-text("←"), button:has-text("Zurück"), button:has-text("✕")');
  if (backBtn) { await backBtn.click(); await sleep(1000); }
  else { await page.keyboard.press('Escape'); await sleep(1000); }
}

async function exploreRangliste(page) {
  log('\n=== RANGLISTE ERKUNDEN ===');
  await clickAndCapture(page, 'button:has-text("Rangliste")', '04_rangliste', 3000);

  const content = await getPageText(page);
  log('Rangliste: ' + content);

  const backBtn = await page.$('button:has-text("←"), button:has-text("Zurück"), button:has-text("✕")');
  if (backBtn) { await backBtn.click(); await sleep(1000); }
  else { await page.keyboard.press('Escape'); await sleep(1000); }
}

async function playNormalWorld(page) {
  log('\n=== NORMAL WELT SPIELEN ===');

  // "Normal" Play Button klicken
  await ss(page, '05_vor_play');

  // Klicke auf den Normal Play Button
  const playButtons = await page.$$('button');
  for (const btn of playButtons) {
    const text = await btn.innerText().catch(() => '');
    log(`Button: "${text}"`);
  }

  // Suche den Play-Button unter dem Normal-Bereich
  const clicked = await page.evaluate(() => {
    // Suche nach dem Play-Button neben "Normal"
    const buttons = Array.from(document.querySelectorAll('button'));
    const playBtns = buttons.filter(b => b.innerText?.includes('Play') || b.innerText?.includes('▶'));
    if (playBtns.length > 0) {
      playBtns[0].click(); // Erster Play-Button = Normal
      return 'Erster Play-Button geklickt: ' + playBtns[0].innerText;
    }
    return 'Kein Play-Button gefunden';
  });
  log('Play-Klick: ' + clicked);

  await sleep(4000);
  await ss(page, '06_nach_play_klick');

  const text = await getPageText(page);
  log('Nach Play: ' + text.substring(0, 1000));

  return text;
}

async function playGame(page, durationMs = 120000) {
  log('\n=== SPIEL LÄUFT - SPIELSCHLEIFE ===');
  const startTime = Date.now();
  let frameCount = 0;
  let battery = 100;
  let coins = 0;
  let chargingStation = false;

  // Ladestation suchen und anfliegen wenn Akku < 50%
  const keys = ['d', 'a', 'w', 's', 'd', 'd', 'w', 'a', 's', 'w'];
  let keyIdx = 0;

  while (Date.now() - startTime < durationMs) {
    frameCount++;
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    // Spielzustand aus Canvas auslesen (DOM-Elemente)
    const gameState = await page.evaluate(() => {
      const text = document.body?.innerText || '';

      // Akku-Prozent suchen
      const batteryMatch = text.match(/(\d+)\s*%/);
      const batteryVal = batteryMatch ? parseInt(batteryMatch[1]) : null;

      // Coins suchen
      const coinMatch = text.match(/(\d+)\s*(Münzen|coins|🪙)/i);
      const coinVal = coinMatch ? parseInt(coinMatch[1]) : null;

      // Ladestation-Hinweis
      const hasCharger = text.toLowerCase().includes('ladestation') || text.toLowerCase().includes('charge') || text.toLowerCase().includes('⚡');

      return {
        text: text.substring(0, 2000),
        battery: batteryVal,
        coins: coinVal,
        hasCharger,
        url: window.location.href,
        hasCanvas: !!document.querySelector('canvas'),
      };
    });

    log(`[${elapsed}s] Akku: ${gameState.battery}% | Coins: ${gameState.coins} | Ladestation: ${gameState.hasCharger}`);

    if (frameCount % 5 === 0) {
      await ss(page, `game_${String(Math.floor(elapsed/5)).padStart(3,'0')}`);
      log(`Spieltext: ${gameState.text.substring(0, 300)}`);
    }

    // Akku-Management: Bei < 50% zur Ladestation
    if (gameState.battery !== null && gameState.battery <= 50) {
      log(`!!! AKKU NIEDRIG: ${gameState.battery}% - Suche Ladestation !!!`);
      // Zur Ladestation fliegen: stoppe Coin-Sammeln, fliege zur Station
      await page.keyboard.press(' '); // Space = stopp/hover?
      await sleep(500);
    } else {
      // Normal spielen: Coins sammeln
      // Drohne steuern mit WASD
      const key = keys[keyIdx % keys.length];
      await page.keyboard.down(key);
      await sleep(300);
      await page.keyboard.up(key);
      keyIdx++;
    }

    await sleep(1000);
  }

  await ss(page, 'game_final');
  const finalText = await getPageText(page);
  log('Spiel beendet. Finaler Zustand: ' + finalText.substring(0, 1000));
}

async function exploreMultiplayer(page) {
  log('\n=== MULTIPLAYER ERKUNDEN ===');

  // Zur Hauptseite
  await page.goto(BASE + '/game', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await sleep(3000);

  // Multiplayer Play-Button klicken (4. Play-Button)
  const mpClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const playBtns = buttons.filter(b => b.innerText?.includes('Play') || b.innerText?.includes('▶'));
    // Multiplayer ist der 4. World-Button
    const mpBtn = playBtns[3];
    if (mpBtn) {
      mpBtn.click();
      return 'Multiplayer geklickt: ' + mpBtn.innerText;
    }
    // Versuche Text-Suche
    const mpWorld = buttons.find(b => b.closest('[class*="world"]') && document.querySelector('[class*="multiplayer"]'));
    return 'Kein Multiplayer-Button gefunden, Buttons: ' + playBtns.map(b => b.innerText).join(', ');
  });
  log('Multiplayer: ' + mpClicked);

  await sleep(4000);
  await ss(page, '10_multiplayer');

  const mpText = await getPageText(page);
  log('Multiplayer Inhalt: ' + mpText.substring(0, 2000));

  // Suche nach Ladestation-Infos
  if (mpText.toLowerCase().includes('ladestation') || mpText.toLowerCase().includes('charge') || mpText.toLowerCase().includes('⚡')) {
    log('LADESTATION INFO GEFUNDEN: ' + mpText);
  }

  // Weitere Analyse
  for (let i = 0; i < 5; i++) {
    await sleep(3000);
    await ss(page, `multiplayer_${i}`);
    const text = await getPageText(page);
    log(`Multiplayer ${i}: ${text.substring(0, 500)}`);
  }
}

async function main() {
  log('=== DRONE GAME - VOLLSTÄNDIGE ANALYSE & PLAY ===');

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
  page.on('console', msg => {
    if (['error', 'warning'].includes(msg.type())) log(`[JS] ${msg.text()}`);
  });

  try {
    const USERNAME = 'ClaudeBot7777';
    const PASSWORD = 'DroneBot123';

    // 1. Login
    await login(page, USERNAME, PASSWORD);

    // 2. Prüfen ob eingeloggt
    const mainText = await getPageText(page);
    if (!mainText.includes('DRONE SIMULATOR') && !mainText.includes('Normal')) {
      log('NICHT EINGELOGGT! Versuche erneut...');
      // Versuche Login statt Register
      await page.goto(SIGN_IN_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(2000);
      const inputs = await page.$$('input');
      for (const inp of inputs) {
        const type = await inp.getAttribute('type').catch(() => 'text');
        if (type === 'password') await inp.fill(PASSWORD);
        else await inp.fill(USERNAME);
      }
      const loginBtn = await page.$('button:has-text("Einloggen")');
      if (loginBtn) {
        await loginBtn.click();
        await sleep(3000);
      }
    }

    await ss(page, '01_hauptmenu');
    const menuText = await getPageText(page);
    log('Hauptmenü: ' + menuText);

    // 3. Shop erkunden
    await exploreShop(page);
    await ss(page, '02b_nach_shop');

    // 4. Quests erkunden
    await exploreQuests(page);
    await ss(page, '03b_nach_quests');

    // 5. Rangliste
    await exploreRangliste(page);
    await ss(page, '04b_nach_rangliste');

    // 6. Normal Welt starten
    await page.goto(BASE + '/game', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(3000);
    await playNormalWorld(page);

    // 7. Spielen (2 Minuten)
    await playGame(page, 120000);

    // 8. Multiplayer erkunden
    await exploreMultiplayer(page);

    log('\n=== ALLE ANALYSEN ABGESCHLOSSEN ===');

  } catch (error) {
    log(`\nFEHLER: ${error.message}\n${error.stack}`);
    await ss(page, 'final_error').catch(() => {});
  } finally {
    await browser.close();
    log('Browser geschlossen');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
