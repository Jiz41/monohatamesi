'use strict';

/* ── Oni ────────────────────────────────────── */
const ONI_HP   = 160, ONI_SPD  = 55, ONI_DMG  = 8;
const ONI_ATK  = 2000, ONI_RNG = 75, ONI_INT  = 2000;
const ONI_WAVE = 10,   ONI_W   = 38, ONI_H    = 54;
const ONI_BW   = 38,   ONI_BH  = 5;

/* ── Named ──────────────────────────────────── */
const NM_HP = 480, NM_SPD = 35, NM_DMG = 12;

/* ── Ogre (WAVE8-9 中ボス) ───────────────────── */
const OGRE_HP = 800, OGRE_SPD = 30, OGRE_DMG = 15;

/* ── Boss ───────────────────────────────────── */
const BOSS_HP = [null, 3000, 4000, 5000, 6500, 6500]; // ch1-4 章別HP、ch5は不死のため参照しない
const BOSS_SPD = 15, BOSS_DMG = 50;
const BOSS_NAMES_BY_CHAPTER = ['温羅', '茨木童子', '酒呑童子', '大嶽丸', '空無童子'];

/* ── Bullet ─────────────────────────────────── */
const BUL_DMG = 20, BUL_MS = 1300, BUL_SPD = 300, BUL_RNG = 320;

/* ── Slash ──────────────────────────────────── */
const SL_BASE = 10, COMBO_STEP = 0.1, COMBO_MAX = 1.3, COMBO_RST = 1500;
const GAUGE_MAX = 100, GAUGE_HIT = 1, SUPER_DMG = 120;

/* ── EXP ────────────────────────────────────── */
const EXP_G = 10, EXP_N = 30, EXP_B = 150;

/* ── Chapter damage table ───────────────────── */
const CHAPTER_DMG = [
  null,
  { oni: 40,  named: 60,  ogre: 80,  boss: 100 },
  { oni: 55,  named: 82,  ogre: 110, boss: 137 },
  { oni: 70,  named: 105, ogre: 140, boss: 175 },
  { oni: 85,  named: 127, ogre: 170, boss: 212 },
  { oni: 100, named: 150, ogre: 200, boss: 250 },
];

/* ── Wave enemy count table [wic-1][chapter-1] ─ */
const WAVE_COUNTS = [
  [ 5,  8, 10, 12, 15], // wic=1
  [ 8, 10, 12, 15, 18], // wic=2
  [ 8, 10, 12, 15, 18], // wic=3
  [10, 12, 15, 18, 22], // wic=4
  [10, 12, 15, 18, 22], // wic=5
  [12, 15, 18, 22, 25], // wic=6
  [12, 15, 18, 22, 25], // wic=7
  [15, 20, 22, 25, 28], // wic=8
  [15, 20, 22, 25, 28], // wic=9
];

/* ── Attribute unlock by chapter ────────────── */
const ATTR_UNLOCK = [
  null,
  ['water'],
  ['water', 'earth'],
  ['water', 'earth', 'fire'],
  ['water', 'earth', 'fire', 'wind'],
  ['water', 'earth', 'fire', 'wind'],
];
