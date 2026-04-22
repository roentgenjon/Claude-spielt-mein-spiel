const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://drone-simulator-worlds-v-4--jonathan-r2015.replit.app';
const SS_DIR = '/home/user/Claude-spielt-mein-spiel/final_ss';
const LOG = '/home/user/Claude-spielt-mein-spiel/final_log.txt';

if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });
if (fs.existsSync(LOG)) fs.unlinkSync(LOG);

const log = msg => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
};
const ss = async (page, name) => {
  await page.screenshot({ path: path.join(SS_DIR, `${name}.png`) });
  log(`SS: ${name}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Robuste Text-Funktion
const getBodyText = async (page) => {
  try {
    return await page.evaluate(() => document.body?.innerText?.substring(0, 8000) || '');
  } catch (e) {
    return '';
  }
};

async function loginOrRegister(page, username, password) {
  // Versuche zuerst Login
  log(`Versuche Login: ${username}`);
  await page.goto(BASE + '/sign-in', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);

  const signInInputs = await page.$$('input');
  for (const inp of signInInputs) {
    const type = await inp.getAttribute('type').catch(() => 'text');
    await inp.fill(type === 'password' ? password : username);
  }

  const loginBtn = await page.$('button:has-text("Einloggen")');
  if (loginBtn) {
    await loginBtn.click();
    await sleep(4000);
  }

  const afterLogin = await getBodyText(page);
  if (afterLogin.includes('DRONE SIMULATOR') || afterLogin.includes('Normal')) {
    log('Login erfolgreich!');
    return true;
  }

  // Login fehlgeschlagen - Registrieren mit neuem Namen
  const newUser = username + Math.floor(Math.random() * 99999);
  log(`Login fehlgeschlagen - Registriere: ${newUser}`);
  await page.goto(BASE + '/sign-up', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await sleep(2000);

  const signUpInputs = await page.$$('input');
  for (const inp of signUpInputs) {
    const type = await inp.getAttribute('type').catch(() => 'text');
    await inp.fill(type === 'password' ? password : newUser);
  }

  const submitBtn = await page.$('button[type="submit"]');
  if (submitBtn) {
    await submitBtn.click();
    await sleep(5000);
  }

  const afterReg = await getBodyText(page);
  const success = afterReg.includes('DRONE SIMULATOR') || afterReg.includes('Normal');
  log(`Registrierung ${success ? 'erfolgreich' : 'fehlgeschlagen'}: ${newUser}`);
  return success;
}

async function openAndReadModal(page, btnText, ssName) {
  log(`=== ${btnText} ===`);
  try {
    await page.click(`button:has-text("${btnText}")`);
    await sleep(3000);
    await ss(page, ssName);
    const content = await getBodyText(page);
    log(`${btnText} Inhalt:\n${content.substring(0, 5000)}`);
    await page.keyboard.press('Escape');
    await sleep(1500);
    return content;
  } catch (e) {
    log(`Fehler ${btnText}: ${e.message}`);
    return '';
  }
}

async function findAndClickPlay(page, worldIndex = 0) {
  // Analysiere alle Elemente nach Play/▶
  const playEls = await page.evaluate(() => {
    const result = [];
    const allEls = Array.from(document.querySelectorAll('*'));
    for (const el of allEls) {
      const t = (el.innerText || el.textContent || '').trim();
      if ((t === '▶ Play' || t === '▶Play' || t === 'Play') && el.children.length === 0) {
        const r = el.getBoundingClientRect();
        if (r.width > 0) result.push({
          tag: el.tagName, text: t,
          x: Math.round(r.x + r.width/2),
          y: Math.round(r.y + r.height/2)
        });
      }
    }
    return result;
  });

  log(`Play-Elemente gefunden: ${JSON.stringify(playEls)}`);

  if (playEls.length > worldIndex) {
    const el = playEls[worldIndex];
    log(`Klicke Play[${worldIndex}] bei (${el.x}, ${el.y})`);
    await page.mouse.click(el.x, el.y);
    return true;
  }

  // Fallback: Screenshot-basierte Koordinaten
  // Aus dem Screenshot bekannt: Normal=~(260,152), Wüste=~(806,152), Parkour=~(260,238), MP=~(806,238)
  const coords = [[260, 152], [806, 152], [260, 238], [806, 238]];
  if (worldIndex < coords.length) {
    const [x, y] = coords[worldIndex];
    log(`Fallback-Klick bei (${x}, ${y})`);
    await page.mouse.click(x, y);
    return true;
  }
  return false;
}

async function playGameLoop(page, durationMs) {
  log('\n=== SPIELSCHLEIFE GESTARTET ===');
  const start = Date.now();
  let frame = 0;
  let lowBatt = false;
  let coinsTotal = 0;

  // Drohne starten - Space drücken
  log('Drohne startet...');
  await page.keyboard.press('Space');
  await sleep(500);
  await page.keyboard.press('Space');
  await sleep(2000);

  const movePatterns = ['w','w','d','d','w','a','a','w','s','d','s','a'];

  while (Date.now() - start < durationMs) {
    frame++;
    const elapsed = Math.round((Date.now() - start) / 1000);

    // Screenshot alle 10 Sekunden
    if (elapsed % 10 < 2.5 && frame % 3 === 0) {
      await ss(page, `game_${String(elapsed).padStart(4,'0')}s`);
    }

    // DOM-Text lesen
    const pageText = await getBodyText(page);

    // Akku-Prozent
    const battMatch = pageText.match(/(\d+)\s*%/);
    const batt = battMatch ? parseInt(battMatch[1]) : null;

    // Coins
    const coinMatch = pageText.match(/(\d+)\s*(?:Coins|coins|Münzen)/);
    const coins = coinMatch ? parseInt(coinMatch[1]) : null;
    if (coins !== null && coins > coinsTotal) coinsTotal = coins;

    // Ladestation
    const hasStation = pageText.toLowerCase().includes('ladestation') ||
                       pageText.toLowerCase().includes('charging station') ||
                       pageText.includes('⚡') || pageText.includes('🔋');

    if (frame % 5 === 1) {
      log(`[${elapsed}s] Akku:${batt}% Coins:${coins}(max:${coinsTotal}) Station:${hasStation}`);
    }

    if (hasStation) {
      log(`LADESTATION SICHTBAR!\n${pageText.substring(0, 500)}`);
    }

    // Akku-Management
    if (batt !== null && batt <= 50 && !lowBatt) {
      log(`!!! AKKU ${batt}% - FLIEGE ZUR LADESTATION (keine Coins sammeln) !!!`);
      lowBatt = true;
    }
    if (batt !== null && batt >= 90 && lowBatt) {
      log(`Akku wieder voll (${batt}%) - Coins sammeln`);
      lowBatt = false;
    }

    // Steuerung
    if (!lowBatt) {
      // Coins sammeln - aktiv fliegen
      const key = movePatterns[frame % movePatterns.length];
      await page.keyboard.down(key);
      await sleep(300);
      await page.keyboard.up(key);
      await page.keyboard.press('Space'); // Höhe halten
    } else {
      // Zur Ladestation: geradeaus fliegen (keine Richtungsänderung)
      await page.keyboard.press('w');
      await sleep(200);
    }

    await sleep(1500);
  }

  await ss(page, 'game_final');
  log(`Spielende: Coins gesammelt: ${coinsTotal}`);
  return coinsTotal;
}

async function main() {
  log('=== DRONE FINAL BOT ===');

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  page.on('console', msg => {
    if (msg.type() !== 'log') return; // Nur log messages
  });

  try {
    // 1. LOGIN
    const loggedIn = await loginOrRegister(page, 'ClaudeBot', 'DroneBot123');
    if (!loggedIn) throw new Error('Login/Register fehlgeschlagen');

    await ss(page, '00_hauptmenu');
    const menuTxt = await getBodyText(page);
    log('Hauptmenü:\n' + menuTxt.substring(0, 600));

    // 2. SHOP analysieren
    const shopContent = await openAndReadModal(page, 'Shop', '01_shop');

    // Shop Powerups finden
    log('\n=== SHOP POWERUPS ===');
    const powerups = shopContent.match(/More coins.*|Speed boost.*|Shield.*|Magnet.*|[A-Z][a-z]+ boost.*/g);
    log('Powerups gefunden: ' + JSON.stringify(powerups));

    // 3. QUESTS analysieren
    await openAndReadModal(page, 'Quests', '02_quests');

    // 4. RANGLISTE
    await openAndReadModal(page, 'Rangliste', '03_rangliste');

    // 5. NORMAL WELT starten
    log('\n=== NORMAL WELT STARTEN ===');
    await findAndClickPlay(page, 0); // Index 0 = Normal
    await sleep(4000);
    await ss(page, '04_world_start');

    const worldTxt = await getBodyText(page);
    const playing = !worldTxt.includes('Wähle eine Welt');
    log(`Spiel gestartet: ${playing}`);
    log('Status: ' + worldTxt.substring(0, 300));

    if (playing) {
      const coins = await playGameLoop(page, 120000); // 2 Minuten
      log(`Gespielte Coins: ${coins}`);

      // Shop besuchen wenn genug Coins
      if (coins >= 100) {
        log('Kaufe Powerup oder Drohne...');
        await page.keyboard.press('Escape');
        await sleep(1000);
        // Zurück zum Menü
        await page.goto(BASE + '/game', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(3000);
        await openAndReadModal(page, 'Shop', '05_shop_kaufen');
      }
    } else {
      log('Spiel nicht gestartet - analysiere DOM weiter');
      // Versuche alle möglichen Klick-Koordinaten
      for (const [x, y] of [[260, 152], [260, 148], [260, 160], [261, 150]]) {
        await page.mouse.click(x, y);
        await sleep(2000);
        const t = await getBodyText(page);
        if (!t.includes('Wähle eine Welt')) {
          log(`Erfolgreich bei (${x}, ${y})!`);
          await playGameLoop(page, 60000);
          break;
        }
      }
      await ss(page, '04b_debug');
    }

    // 6. MULTIPLAYER
    log('\n=== MULTIPLAYER ===');
    await page.goto(BASE + '/game', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(3000);

    await findAndClickPlay(page, 3); // Index 3 = Multiplayer
    await sleep(5000);
    await ss(page, '10_multiplayer');
    const mpTxt = await getBodyText(page);
    log('MULTIPLAYER:\n' + mpTxt.substring(0, 3000));

    // Multiplayer beobachten
    for (let i = 0; i < 8; i++) {
      await sleep(3000);
      await ss(page, `mp_${i}`);
      const t = await getBodyText(page);
      if (t !== mpTxt) log(`MP-Update ${i}: ${t.substring(0, 400)}`);

      // Lade/Charging-Station in Multiplayer suchen
      if (t.toLowerCase().includes('ladestation') || t.toLowerCase().includes('charging') || t.includes('⚡')) {
        log(`!!! LADESTATION IN MULTIPLAYER: ${t}`);
      }
    }

    log('\n=== ANALYSE KOMPLETT ===');

  } catch (e) {
    log('KRITISCHER FEHLER: ' + e.message + '\n' + e.stack);
    await ss(page, 'error').catch(() => {});
  } finally {
    await browser.close();
    log('Fertig');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
