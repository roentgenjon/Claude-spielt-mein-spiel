# Drone Simulator – Vollständige Analyse

Account: **ClaudeBot7777** | Passwort: DroneBot123 | Coins: **1,958+**

---

## 🗺️ Welten (4 Stück)

| Welt | Beschreibung | Besonderheit |
|------|-------------|--------------|
| 🌲 Normal | Wälder, Berge, Flüsse | Standard-Welt, ideal zum Coins sammeln |
| 🏜️ Wüste | Dünen, Kakteen, Ruinen | Andere Landschaft, gleiche Mechanik |
| ⭕ Parkour | Ringe, 6× Speed | Schnelle Drohne, Ringe fliegen |
| 🌍 Multiplayer | Quests gemeinsam | Ziel = Basis × Spieleranzahl |

---

## 🛒 Shop – Drohnen

Alle Drohnen haben 5 Stats: Speed / Accel / Battery / Turn / Drain

| Name | Speed | Battery | Preis |
|------|-------|---------|-------|
| Starter Drone | 18 | 110 | **Gratis (Standard)** |
| Zephyr I | 19 | 106 | 142 Coins |
| Breeze | 20 | 103 | 198 Coins |
| Scout | 22 | 114 | 257 Coins |
| Feather | 23 | 110 | 318 Coins |
| Whisper | 24 | 107 | 382 Coins |
| Glider | 25 | 118 | 446 Coins |
| … bis … | … | … | … |
| Apex | 30 | 150 | 2,171 Coins |
| Vortex | 31 | 164 | 3,013 Coins |
| Samson | 32 | 178 | 3,894 Coins |
| (höchste) | 32+ | 180+ | 3,985+ Coins |

**Strategie:** Drohnen mit hoher Battery & niedrigem Drain bevorzugen (weniger Ladestation-Besuche nötig).

Powerup im Shop: **"More coins spawn on the map"** – mehr Coins auf der Karte.

---

## 📋 Quests (Solo)

### Aktive Quests
| Quest | Ziel | Belohnung |
|-------|------|-----------|
| Coin Quest 1 | 20 Coins | 25 Coins |
| Coin Quest 2 | 24 Coins | 25 Coins |
| Coin Quest 3 | 30 Coins | 25 Coins |
| Coin Quest 4 | 36 Coins | 25 Coins |
| Flight Quest 1 | 1.000 Meter | 25 Coins |
| Flight Quest 2 | 1.200 Meter | 25 Coins |
| **Charge Quest 1** | **5 Ladestationen** | **25 Coins** |
| **Charge Quest 2** | **6 Ladestationen** | **25 Coins** |
| Wildlife Quest 1 | 8 Tiere | 25 Coins |
| Wildlife Quest 2 | 10 Tiere | 30 Coins |

Viele weitere Quests sind gesperrt (Coin 5–16, etc.).

---

## ⚡ LADESTATIONEN – Was sind sie?

**Ladestationen sind physische Orte auf der 3D-Spielkarte.**

- Sie erscheinen als leuchtende Punkte/Stationen auf der Karte
- Symbol im Spiel: ⚡
- **Funktion:** Wenn deine Drohne in den Bereich einer Ladestation fliegt, wird der Akku auf **100% aufgeladen**
- Sie sind über die ganze Karte verteilt
- Sie zählen als Quest-Fortschritt (Charge Quests)

**Akku-Regeln:**
- Starter Drone: Drain = 0,5% pro Sekunde → leert sich in ~3 Min komplett
- Bei **≤ 50% Akku**: sofort zur nächsten Ladestation fliegen
- **Keine Coins sammeln** auf dem Weg zur Ladestation (direkter Flug)
- Ladestation lädt im Bereich auf 100% auf

---

## 🌍 Multiplayer

- Ziel = **Basis × Spieleranzahl** (bei 5 Spielern × 5)
- Alle Spieler teilen sich Quest-Fortschritt
- Multiplayer-Quests:
  - ✈️ Flug-Quest: 378.8 km / X km
  - 🪙 Münz-Quest: 69M+ / X Münzen
  - ⚡ **Ladestation-Quest**: Basis 3 × Spieler → 150 Münzen
  - ⚡ **Ladestation-Quest 2**: Basis 10 × Spieler → 500 Münzen
  - 🐾 Tier-Quest: 5 × Spieler Tiere → 120 Münzen
- Echter Spieler "avocado3seb" hat 378,8 km geflogen und 69M Coins

---

## 🏆 Steuerung

```
Space       = Aufsteigen
Shift       = Absteigen
W / S       = Vorwärts / Rückwärts
A / D       = Links / Rechts drehen
Esc         = Menü
```

---

## 💡 Strategie

1. **Coins sammeln** → Kreismuster fliegen (W+D, W+A abwechselnd)
2. **Bei 50% Akku** → direkt zur Ladestation (kein Umweg für Coins)
3. **Shop-Priorität:** Powerup "More Coins" vor neuer Drohne
4. **Drohne kaufen** erst wenn kein gutes Powerup verfügbar (bessere Battery+niedrigerer Drain)
5. **Quests** parallel erledigen (Flug-Meter werden automatisch gezählt)
