'use strict';

/* ── HyakkiScene 敵定数 ────────────────────── */
const HK_GRUNT = { baseHP: 160, baseDmg: 167 };
const HK_NAMED = { baseHP: 480, baseDmg: 251 };
const HK_OGRE  = { baseHP: 800, baseDmg: 334 };
const HK_BG_COLORS  = [0x8B0000, 0x4A0000, 0x4A2000, 0x2A0040, 0x1A0010];
const HK_BOSS_NAMES = ['温羅', '茨木童子', '酒呑童子', '大嶽丸'];
const HK_BOSS_IMGS  = ['oni-ura', 'oni-ibaraki', 'oni-shuten', 'oni-otake'];

class HyakkiScene extends Phaser.Scene {
  constructor() { super({ key: 'HyakkiScene' }); }

  preload() {
    const img = (key, path) => { if (!this.textures.exists(key)) this.load.image(key, path); };
    img('kibitsu',     'img/kibitsu.png');
    img('oni-small',   'img/oni-small.png');
    img('oni-mid',     'img/oni-mid.png');
    img('oni-large',   'img/oni-large.png');
    img('oni-ura',     'img/oni-ura.png');
    img('oni-ibaraki', 'img/oni-ibaraki.png');
    img('oni-shuten',  'img/oni-shuten.png');
    img('oni-otake',   'img/oni-otake.png');
    img('bg_sky',      'img/back_sky.png');
    img('bg_ground',   'img/back_ground.png');

    const aud = (key, path) => { if (!this.cache.audio.has(key)) this.load.audio(key, path); };
    aud('se_slash_1',        'audio/se_slash_1.mp3');
    aud('se_slash_2',        'audio/se_slash_2.mp3');
    aud('se_charm_fire',     'audio/se_charm_fire.mp3');
    aud('se_charm_water',    'audio/se_charm_water.mp3');
    aud('se_charm_wind',     'audio/se_charm_wind.mp3');
    aud('se_charm_earth',    'audio/se_charm_earth.mp3');
    aud('se_death_small',    'audio/se_death_small.mp3');
    aud('se_death_boss',     'audio/se_death_boss.mp3');
    aud('se_kibitsu_damage', 'audio/se_kibitsu_damage.mp3');
    aud('se_ultimate',       'audio/se_ultimate.mp3');
    if (!this.cache.audio.has('se_wave_clear'))   this.load.audio('se_wave_clear',   ['audio/se_wave_clear.mp3',   'audio/se_wave_clear.wav']);
    if (!this.cache.audio.has('se_boss_warning')) this.load.audio('se_boss_warning', ['audio/se_boss_warning.mp3', 'audio/se_boss_warning.wav']);
    if (!this.cache.audio.has('se_slot_open'))    this.load.audio('se_slot_open',    ['audio/se_slot_open.mp3',    'audio/se_slot_open.wav']);
    if (!this.cache.audio.has('se_exp_gain'))     this.load.audio('se_exp_gain',     ['audio/se_exp_gain.mp3',     'audio/se_exp_gain.wav']);
  }

  create() {
    /* ── 初期ステータス ─────────────────────── */
    this.wave          = 1;
    this.kbHP          = 500;
    this.kbHPMax       = 500;
    this.slashDmg      = SL_BASE;
    this.totalExp      = 0;
    this.unlockedSlots = 3;
    this.slotCharms    = new Array(9).fill(null);
    this.charmTimers   = new Array(9).fill(0);
    this.bagCharms     = [];
    this.selectedUltId = 'kaguya';
    this.waveDone      = false;
    this.upgradeCounts = { hp: 0, slash: 0, cast: 0, slot: 0 };

    this.combo     = 1.0; this.comboTimer = 0;
    this.gauge     = 0;   this.gaugeReady = false;
    this.ultCooldown = 0;
    this._bagPickMode = -1;

    this.dialogActive        = false;
    this._dlgLines           = [];
    this._dlgIdx             = 0;
    this._dlgOnComplete      = null;
    this._waveTimer          = null;
    this._spawnTimer         = null;
    this._restActive         = false;
    this._upgVis             = false;
    this._cpVis              = false;
    this._bossWarnFlashTimer = null;
    this._bossWarnShakeTimer = null;
    this._goVis              = false;
    this.paused              = false;
    this._lpTimer            = null;
    this._lpActive           = false;
    this._lpIdx              = -1;
    this._ultLpTimer         = null;
    this._ultMenuVis         = false;

    const opts = loadOpts();
    this.seVol      = opts.seVol  ?? 0.8;
    this._seLastMs  = {};

    this.onis = this.add.group();
    this.sfx  = this.add.graphics().setDepth(10);

    /* ── UI構築 ───────────────────────────── */
    this._bg();      this._kb();
    this._hdr();
    this._grid();    this._slash();
    this._bagBuild(); this._superBtn();

    /* ── ボスHPバー（上部） ─────────────── */
    this._bossHpBarBg = this.add.rectangle(W / 2, 32, W - 40, 12, 0x220000)
      .setAlpha(0).setDepth(6);
    this._bossHpBar   = this.add.rectangle(20, 32, W - 40, 12, 0xff3333)
      .setAlpha(0).setOrigin(0, 0.5).setDepth(7);
    this._bossNameTxt = this.add.text(W / 2, 48, '', {
      fontSize: '13px', color: '#ff88ff', fontFamily: 'serif',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setAlpha(0).setDepth(7);

    /* ── 各種UI ─────────────────────────── */
    this._goBuild();
    this._upgBuild();
    this._cpBuild();
    this._dlgBuild();
    this._pauseBuild();
    this._tooltipBuild();
    this._ultMenuBuild();

    /* ── 入力 ───────────────────────────── */
    this.input.on('pointerdown', p => { this._lpStart(p); this._tap(p); });
    this.input.on('pointerup',   p => this._lpEnd(p));

    this._hdrUp(); this._waveUiUp(); this._gridUp(); this._bagUp();

    this.events.on('shutdown', () => this.shutdown());

    /* ── 冒頭セリフ → 戦闘開始 ─────────── */
    const openingLines = [
      { speaker: 'キビツ', text: '夢を見ていたのか……' },
      { speaker: 'キビツ', text: '甘ったれたものだ……' },
      { speaker: 'キビツ', text: '咎が終わるはずもなかろう。' },
      { speaker: 'キビツ', text: 'さあ、殺し合おう。' },
    ];
    this._dlgShow(openingLines, () => this._battleStart());
  }

  /* ── update ─────────────────────────────── */
  update(_t, dt) {
    if (this.dialogActive || this.paused) return;

    // ult cooldown
    if (this.ultCooldown > 0) {
      this.ultCooldown = Math.max(0, this.ultCooldown - dt);
      if (this.ultCooldown === 0 && this.gaugeReady) {
        this._sbUpdate();
        this.sBtnBg.setAlpha(1); this.sBtnTxt.setAlpha(1);
        this.tweens.add({ targets: [this.sBtnBg, this.sBtnTxt], alpha: { from: 1, to: 0.35 }, yoyo: true, repeat: -1, duration: 450 });
      }
    }

    // combo decay
    if (this.combo > 1.0) {
      this.comboTimer += dt;
      if (this.comboTimer >= COMBO_RST) { this.combo = 1.0; this.comboTimer = 0; this._slashLbl(); }
    }

    // charm charge + auto-fire
    for (let i = 0; i < 9; i++) {
      const c = this.slotCharms[i]; if (!c) continue;
      if (this.charmTimers[i] < c.chargeMs) {
        this.charmTimers[i] = Math.min(c.chargeMs, this.charmTimers[i] + dt);
        this._cellUp(i);
      } else { this._useCharm(i); }
    }

    // 敵移動
    for (const oni of [...this.onis.getChildren()]) {
      if (!oni.active) continue;
      if (oni.stunTimer > 0) oni.stunTimer = Math.max(0, oni.stunTimer - dt);
      if (oni.knockTimer > 0) {
        oni.knockTimer = Math.max(0, oni.knockTimer - dt);
        oni.x += oni.spd * 2.5 * (dt / 1000);
      }
      if (oni.burnTimer > 0) {
        oni.burnTimer = Math.max(0, oni.burnTimer - dt);
        oni.burnTick += dt;
        if (oni.burnTick >= 500) { oni.burnTick -= 500; this._oniDmg(oni, 8, 'fire', true); }
      }
      if (oni.rootStacks > 0) {
        oni.rootTick += dt;
        if (oni.rootTick >= 500) { oni.rootTick -= 500; this._oniDmg(oni, oni.rootStacks * 5, 'earth', true); }
      }
      if (oni.stunTimer <= 0 && oni.knockTimer <= 0) oni.x -= oni.spd * (dt / 1000);
      this._oniSync(oni);
      if (oni.x < KB_X) { this._kbDmg(oni.dmg); this._oniRm(oni); }
    }
  }

  /* ── スケール式 ──────────────────────────── */
  _getScale(wave) { return 1 + Math.sqrt(wave) * 0.3; }

  /* ── 漢数字変換 ─────────────────────────── */
  _toKanji(n) {
    const units = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const tens  = ['', '十', '二十', '三十', '四十', '五十', '六十', '七十', '八十', '九十'];
    if (n < 10)  return units[n];
    if (n < 100) return tens[Math.floor(n / 10)] + units[n % 10];
    return String(n);
  }

  /* ── 背景 ───────────────────────────────── */
  _bg() {
    const skyNat    = this.textures.get('bg_sky').getSourceImage();
    const groundNat = this.textures.get('bg_ground').getSourceImage();
    const scale     = W / skyNat.width;
    this._skyH      = Math.round(skyNat.height * scale);
    const groundH   = Math.round(groundNat.height * scale);

    this.add.image(W / 2, this._skyH / 2, 'bg_sky').setDisplaySize(W, this._skyH).setDepth(0);
    this.add.image(W / 2, this._skyH + groundH / 2, 'bg_ground').setDisplaySize(W, groundH).setDepth(1);

    this.bgSkyOvl = this.add.rectangle(W / 2, this._skyH / 2, W, this._skyH, 0x000000, 0).setDepth(2);
    this.bgGndGfx = this.add.graphics().setDepth(3);

    this.add.rectangle(W / 2, UI_Y0 + UI_H / 2, W, UI_H, 0x0c100c).setDepth(0);
    this.add.rectangle(W / 2, UI_Y0 + 1, W, 3, 0x44664a).setDepth(0);

    const pBtnBg = this.add.graphics().setDepth(20);
    pBtnBg.fillStyle(0x000000, 0.6);
    pBtnBg.fillRoundedRect(355, 0, 30, 30, 4);
    this.add.text(370, 15, '≡', { fontSize: '18px', color: '#ffffff', fontFamily: 'serif' }).setOrigin(0.5).setDepth(20);

    this._bgUp();
  }

  _bgUp() {
    const idx = Math.floor(((this.wave - 1) % 250) / 50);
    const col = HK_BG_COLORS[idx];
    if (this.bgSkyOvl) this.bgSkyOvl.setFillStyle(col, 0.75);
    if (this.bgGndGfx) {
      this.bgGndGfx.clear();
      for (let i = 0; i < BG_GROUND_GRAD_H; i++) {
        this.bgGndGfx.fillStyle(col, 0.75 * (1 - i / BG_GROUND_GRAD_H));
        this.bgGndGfx.fillRect(0, this._skyH + i, W, 1);
      }
    }
  }

  /* ── Kibitsu ────────────────────────────── */
  _kb() {
    const h = BATTLE_H * 0.22;
    const kx = 65, ky = 190;
    this.kbSpr = this.add.image(kx, ky, 'kibitsu').setOrigin(0.5, 0.5).setDepth(3);
    const naturalH = this.kbSpr.height || 1;
    this.kbSpr.setDisplaySize(this.kbSpr.width * h / naturalH, h);
    const kow = this.kbSpr.displayWidth, koh = this.kbSpr.displayHeight;
    [[-4,0],[4,0],[0,-4],[0,4],[-3,-3],[3,-3],[-3,3],[3,3]].forEach(([dx, dy]) => {
      this.add.image(kx + dx, ky + dy, 'kibitsu')
        .setDisplaySize(kow, koh).setTintFill(0xffffff).setAlpha(0.8).setDepth(2.9);
    });
    this._kbSX = kx + this.kbSpr.displayWidth / 2;
    this._kbSY = ky;
    const barY = ky - h / 2 - 8;
    this.add.rectangle(kx - 27, barY, 54, 9, 0x220000).setOrigin(0, 0.5).setDepth(4);
    this.kbHpBar = this.add.rectangle(kx - 27, barY, 54, 9, 0x22dd55).setOrigin(0, 0.5).setDepth(4);
  }

  /* ── Header ─────────────────────────────── */
  _hdr() {
    this.hpTxt   = this.add.text(14, UI_Y0 + 6, '', { fontSize: '13px', color: '#88aaff', fontFamily: 'Arial' }).setDepth(5);
    this.waveTxt = this.add.text(W / 2, UI_Y0 + 14, '', { fontSize: '21px', color: '#ddcc44', fontFamily: 'serif', fontStyle: 'bold' }).setOrigin(0.5).setDepth(5);
    this.expTxt  = this.add.text(W - 14, UI_Y0 + 6, '', { fontSize: '13px', color: '#aaee88', fontFamily: 'Arial' }).setOrigin(1, 0).setDepth(5);
  }

  _hdrUp() {
    this.hpTxt.setText(`HP: ${this.kbHP}/${this.kbHPMax}`);
    this.expTxt.setText(`EXP: ${this.totalExp}`);
  }

  _waveUiUp() {
    this.waveTxt.setText(`第${this._toKanji(this.wave)}波`);
  }

  /* ── Grid ───────────────────────────────── */
  _grid() {
    this.cBg = []; this.cGfx = []; this.cBdr = []; this.cTxt = []; this.cSub = [];
    for (let i = 0; i < 9; i++) {
      const col = i % 3, row = Math.floor(i / 3);
      const cellX = GRID_X0 + col * CELL_W, cellY = GRID_TOP + row * CELL_H;
      const cx = cellX + CELL_W / 2, cy = cellY + CELL_H / 2;
      this.cBg.push(this.add.rectangle(cx, cy, CELL_W, CELL_H, 0x050810).setDepth(5));
      this.cGfx.push(this.add.graphics().setDepth(6));
      this.cBdr.push(this.add.rectangle(cx, cy, CELL_W, CELL_H, 0x000000, 0).setStrokeStyle(2, 0x334433).setDepth(7));
      this.cTxt.push(this.add.text(cx, cy, '', { fontSize: '11px', color: '#fff', fontFamily: 'serif', align: 'center', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(8));
      this.cSub.push(this.add.text(cx, cellY + CELL_H - 4, '', { fontSize: '9px', color: '#ffffff', fontFamily: 'serif' }).setOrigin(0.5, 1).setDepth(9));
    }
  }

  _gridUp() {
    for (let i = 0; i < 9; i++) {
      const locked = i >= this.unlockedSlots;
      const c = this.slotCharms[i];
      if (locked) {
        this.cBg[i].setFillStyle(0x050505);
        this.cGfx[i].clear();
        this.cBdr[i].setStrokeStyle(1, 0x1a1a1a);
        this.cTxt[i].setText('施錠').setStyle({ color: '#2a2a2a', fontSize: '10px', align: 'center', stroke: '#000', strokeThickness: 0 });
        this.cSub[i].setText('');
      } else if (!c) {
        this.cBg[i].setFillStyle(0x050810);
        this.cGfx[i].clear();
        this.cBdr[i].setStrokeStyle(1, 0x334433);
        this.cTxt[i].setText('＋\n空き').setStyle({ color: '#447744', fontSize: '12px', align: 'center', stroke: '#000', strokeThickness: 2 });
        this.cSub[i].setText('');
      } else {
        this._cellUp(i);
      }
    }
  }

  _cellUp(idx) {
    const c = this.slotCharms[idx]; if (!c) return;
    const r = Math.min(1, this.charmTimers[idx] / c.chargeMs);
    const ready = r >= 1;
    const an = ATTR_NAMES[c.attr] || '－';
    const attributeColor = ready ? 0xffffff : (ATTR_FILL[c.attr] || ATTR_FILL.none);
    const col = idx % 3, row = Math.floor(idx / 3);
    const cellX = GRID_X0 + col * CELL_W, cellY = GRID_TOP + row * CELL_H;
    const gfx = this.cGfx[idx];
    gfx.clear();
    const fillHeight = CELL_H * r;
    gfx.fillStyle(attributeColor, 0.6);
    gfx.fillRect(cellX, cellY + CELL_H - fillHeight, CELL_W, fillHeight);
    this.cBdr[idx].setStrokeStyle(2, ready ? 0x44ffaa : (r > 0.05 ? attributeColor : 0x334433));
    const pct = Math.floor(r * 100);
    this.cTxt[idx].setText(`[${an}]${c.name}\n${ready ? '【発動！】' : `${pct}%`}`)
      .setStyle({ color: '#ffffff', fontSize: '11px', align: 'center', stroke: '#000', strokeThickness: 3 });
    this.cSub[idx].setText(c.name.length > 6 ? c.name.slice(0, 6) : c.name);
  }

  /* ── Slash area ─────────────────────────── */
  _slash() {
    this.add.rectangle(W / 2, SLASH_Y + SLASH_H / 2, W - 20, SLASH_H, 0x141422).setStrokeStyle(2, 0x4444aa).setDepth(5);
    this.slLbl  = this.add.text(W / 2, SLASH_Y + 18, '⚔  斬撃', { fontSize: '20px', color: '#ffdd88', fontFamily: 'serif', fontStyle: 'bold' }).setOrigin(0.5).setDepth(6);
    this.cboLbl = this.add.text(W / 2, SLASH_Y + 38, '', { fontSize: '12px', color: '#ffaa44', fontFamily: 'Arial' }).setOrigin(0.5).setDepth(6);
    this.add.text(22, SLASH_Y + SLASH_H - 26, '大技ゲージ', { fontSize: '11px', color: '#8877bb', fontFamily: 'Arial' }).setDepth(6);
    this.gPct = this.add.text(W - 22, SLASH_Y + SLASH_H - 26, '0%', { fontSize: '11px', color: '#8877bb', fontFamily: 'Arial' }).setOrigin(1, 0).setDepth(6);
    const gy = SLASH_Y + SLASH_H - 11;
    this.add.rectangle(W / 2, gy, W - 40, 14, 0x111122).setDepth(6);
    this.gBar = this.add.rectangle(20, gy, 0, 14, 0x6633cc).setOrigin(0, 0.5).setDepth(7);
  }

  _doSlash() {
    const list = this.onis.getChildren().filter(o => o.active);
    if (!list.length) return;
    this._sePlay(Math.random() < 0.5 ? 'se_slash_1' : 'se_slash_2', 0.4 * this.seVol);
    const t = list.reduce((a, b) => a.x < b.x ? a : b);
    const dmg = Math.round(this.slashDmg * this.combo);
    this._oniDmg(t, dmg);
    this._slashFx(t.x, t.y);
    if (this.combo < COMBO_MAX) this.combo = Math.min(COMBO_MAX, Math.round((this.combo + COMBO_STEP) * 10) / 10);
    this.comboTimer = 0;
    this.gauge = Math.min(GAUGE_MAX, this.gauge + GAUGE_HIT);
    this._gaugeUp(); this._slashLbl();
  }

  _slashFx(tx, ty) {
    this.sfx.clear();
    this.sfx.lineStyle(3, 0xffffff, 1);
    this.sfx.beginPath(); this.sfx.moveTo(tx - 28, ty - 28); this.sfx.lineTo(tx + 28, ty + 28); this.sfx.strokePath();
    this.sfx.lineStyle(2, 0xffcc44, 0.7);
    this.sfx.beginPath(); this.sfx.moveTo(tx - 18, ty - 32); this.sfx.lineTo(tx + 26, ty + 22); this.sfx.strokePath();
    this.tweens.add({ targets: this.sfx, alpha: 0, duration: 180, onComplete: () => { this.sfx.clear(); this.sfx.setAlpha(1); } });
  }

  _slashLbl() { this.cboLbl.setText(this.combo > 1.0 ? `COMBO ×${this.combo.toFixed(1)}` : ''); }

  _gaugeUp() {
    const pct = this.gauge / GAUGE_MAX;
    const col = pct >= 1.0 ? 0xff66aa : pct >= 0.7 ? 0xcc44ff : 0x6633cc;
    this.gBar.setDisplaySize((W - 40) * pct, 14).setFillStyle(col);
    this.gPct.setText(`${Math.floor(pct * 100)}%`);
    if (pct >= 1.0 && !this.gaugeReady) {
      this.gaugeReady = true;
      this._sbUpdate();
      if (this.ultCooldown <= 0) {
        this.sBtnBg.setAlpha(1); this.sBtnTxt.setAlpha(1);
        this.tweens.add({ targets: [this.sBtnBg, this.sBtnTxt], alpha: { from: 1, to: 0.35 }, yoyo: true, repeat: -1, duration: 450 });
      }
    } else if (pct < 1.0 && this.gaugeReady) {
      this.gaugeReady = false;
      this.tweens.killTweensOf([this.sBtnBg, this.sBtnTxt]);
      this.sBtnBg.setAlpha(0); this.sBtnTxt.setAlpha(0);
    }
  }

  /* ── Bag ────────────────────────────────── */
  _bagBuild() {
    const ty = DESC_Y + 8;
    this._bagLbl  = this.add.text(16, ty, '持ち物袋', { fontSize: '12px', color: '#667766', fontFamily: 'serif' }).setDepth(5);
    this._bagCnt  = this.add.text(W - 16, ty, '0/3', { fontSize: '12px', color: '#667766', fontFamily: 'Arial' }).setOrigin(1, 0).setDepth(5);
    this._bagHint = this.add.text(W / 2, ty + 16, '', { fontSize: '10px', color: '#ffcc44', fontFamily: 'Arial', align: 'center', wordWrap: { width: W - 20 } }).setOrigin(0.5).setDepth(5);
    this._bagCells = [];
    for (let i = 0; i < 3; i++) {
      const cx = GRID_X0 + i * CELL_W + CELL_W / 2, cy = DESC_Y + 60;
      const bg  = this.add.rectangle(cx, cy, CELL_W - 6, 56, 0x050810).setStrokeStyle(1, 0x334433).setDepth(5);
      const txt = this.add.text(cx, cy, '', { fontSize: '11px', color: '#334433', fontFamily: 'serif', align: 'center', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5).setDepth(6);
      this._bagCells.push({ bg, txt });
    }
  }

  _bagUp() {
    this._bagCnt.setText(`${this.bagCharms.length}/3`);
    this._bagHint.setText(this._bagPickMode >= 0
      ? '配置先のマス（空き）をタップ　同じ袋をタップでキャンセル'
      : (this.bagCharms.length > 0 ? '袋の呪符をタップ → 配置先のマスを選択' : ''));
    for (let i = 0; i < 3; i++) {
      const cell = this._bagCells[i], c = this.bagCharms[i];
      const selected = (this._bagPickMode === i);
      if (c) {
        cell.txt.setText(`[${ATTR_NAMES[c.attr] || '－'}]\n${c.name}`)
          .setStyle({ color: selected ? '#ffcc44' : '#aaccaa', fontSize: '11px', align: 'center', stroke: '#000', strokeThickness: 2 });
        cell.bg.setStrokeStyle(2, selected ? 0xffcc44 : 0x336633);
      } else {
        cell.txt.setText('空き').setStyle({ color: '#334433', fontSize: '11px', align: 'center', stroke: '#000', strokeThickness: 2 });
        cell.bg.setStrokeStyle(1, 0x334433);
      }
    }
  }

  /* ── Super button ───────────────────────── */
  _superBtn() {
    this.sBtnBg  = this.add.rectangle(SB_X, SB_Y, 120, 40, 0x330011).setStrokeStyle(2, 0xff3388).setAlpha(0).setDepth(8);
    this.sBtnTxt = this.add.text(SB_X, SB_Y, '★ 香山颪', { fontSize: '14px', color: '#ff88cc', fontFamily: 'serif', fontStyle: 'bold', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setAlpha(0).setDepth(9);
  }

  _sbUpdate() {
    const ult = ULTIMATE_DATA.find(u => u.id === this.selectedUltId);
    if (ult) this.sBtnTxt.setText(`★ ${ult.name}`);
  }

  /* ── Oni system ─────────────────────────── */
  _makeOni(ox, oy, ow, oh, col, stk, name, fs, fc, hp, spd, dmg, bw, exp, isBoss, imgKey, attr = 'none') {
    const ONI_RATIO = { 'oni-small': 0.18, 'oni-mid': 0.22, 'oni-large': 0.30,
      'oni-ura': 0.75, 'oni-ibaraki': 0.75, 'oni-shuten': 0.75, 'oni-otake': 0.75 };
    const ratio = ONI_RATIO[imgKey] || 0.18;
    const sprH  = BATTLE_H * ratio;
    const body  = this.add.image(ox, oy, imgKey).setOrigin(0.5, 0.5).setDepth(3);
    body.setDisplaySize(body.width * sprH / body.height, sprH);
    const sprW = body.displayWidth, sprH2 = body.displayHeight;
    body.outlines = [[-4,0],[4,0],[0,-4],[0,4],[-3,-3],[3,-3],[-3,3],[3,3]].map(([dx, dy]) =>
      this.add.image(ox + dx, oy + dy, imgKey)
        .setDisplaySize(sprW, sprH2).setTintFill(0xffffff).setAlpha(0.8).setDepth(2.9)
    );
    const barY   = oy - sprH / 2 - 6;
    const barH   = isBoss ? 7 : ONI_BH;
    const lbl    = this.add.text(ox, barY - 13, name, { fontSize: fs, color: fc, fontFamily: 'serif', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5).setDepth(4);
    const hpBg   = this.add.rectangle(ox - bw / 2, barY, bw, barH, 0x330000).setOrigin(0, 0.5).setDepth(4);
    const hpFill = this.add.rectangle(ox - bw / 2, barY, bw, barH, isBoss ? 0xff33ff : (col === 0x661199 ? 0xaa44ff : 0xff2222)).setOrigin(0, 0.5).setDepth(4);
    let attrLbl = null;
    if (attr !== 'none') {
      const ac = '#' + ATTR_COLORS[attr].toString(16).padStart(6, '0');
      attrLbl = this.add.text(ox, barY - 24, ATTR_NAMES[attr], { fontSize: '11px', color: ac, fontFamily: 'serif', fontStyle: 'bold', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5).setDepth(4);
    }
    body.hp = body.maxHp = hp; body.atkT = 0;
    body.lbl = lbl; body.hpBg = hpBg; body.hpFill = hpFill; body.attrLbl = attrLbl;
    body.spd = spd; body.dmg = dmg; body.bw = bw; body.hSz = sprH; body.barH = barH;
    body.exp = exp; body.isBoss = isBoss; body.attr = attr;
    body.burnTimer = 0; body.burnTick = 0;
    body.rootStacks = 0; body.rootTick = 0;
    body.stunTimer = 0; body.knockTimer = 0;
    this.onis.add(body);
  }

  _oniSync(oni) {
    const by = oni.y - oni.hSz / 2 - 6;
    oni.lbl.setPosition(oni.x, by - 13);
    oni.hpBg.setPosition(oni.x - oni.bw / 2, by);
    oni.hpFill.setPosition(oni.x - oni.bw / 2, by);
    if (oni.attrLbl) oni.attrLbl.setPosition(oni.x, by - 24);
    if (oni.outlines) {
      const offs = [[-4,0],[4,0],[0,-4],[0,4],[-3,-3],[3,-3],[-3,3],[3,3]];
      oni.outlines.forEach((o, i) => o.setPosition(oni.x + offs[i][0], oni.y + offs[i][1]));
    }
  }

  _oniRm(oni) {
    oni.lbl?.destroy(); oni.hpBg?.destroy(); oni.hpFill?.destroy(); oni.attrLbl?.destroy();
    oni.outlines?.forEach(o => o.destroy()); oni.destroy();
  }

  _oniRmUI(oni) {
    oni.lbl?.destroy();     oni.lbl     = null;
    oni.hpBg?.destroy();    oni.hpBg    = null;
    oni.hpFill?.destroy();  oni.hpFill  = null;
    oni.attrLbl?.destroy(); oni.attrLbl = null;
    oni.outlines?.forEach(o => o.destroy()); oni.outlines = null;
  }

  _oniDmg(oni, rawDmg, atkAttr = 'none', dot = false) {
    if (!oni.active) return;
    const mult = attrMult(atkAttr, oni.attr || 'none');
    const dmg  = Math.max(1, Math.round(rawDmg * mult));
    oni.hp -= dmg;
    const r = Phaser.Math.Clamp(oni.hp / oni.maxHp, 0, 1);
    oni.hpFill.setDisplaySize(oni.bw * r, oni.barH);
    if (oni.isBoss) this._bossHpBar.setDisplaySize((W - 40) * r, 12);
    const isCrit = !dot && mult >= 1.0 && atkAttr !== 'none' && (oni.attr || 'none') !== 'none';
    const col = dot ? '#ffff00' : isCrit ? '#ff3300' : '#ffffff';
    this._dmgNum(oni.x, oni.y - oni.hSz / 2, dmg, col);
    if (oni.setTint) { oni.setTint(0xff4444); this.time.delayedCall(100, () => { if (oni?.active) oni.clearTint?.(); }); }
    if (oni.hp <= 0) {
      if (oni.isBoss) {
        this._deathFxBoss(oni, () => this._bossDefeated());
      } else {
        this.totalExp += oni.exp;
        if (oni.exp > 0) this._sePlay('se_exp_gain', 0.4 * this.seVol);
        this._deathFxSmall(oni, null);
      }
    }
  }

  _dmgNum(x, y, dmg, col) {
    const t = this.add.text(x, y - 10, String(dmg), { fontSize: '18px', color: col || '#ffffff', stroke: '#000', strokeThickness: 3, fontFamily: 'Arial', fontStyle: 'bold' }).setOrigin(0.5).setDepth(11);
    this.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 800, ease: 'Power1', onComplete: () => t.destroy() });
  }

  _kbDmg(dmg) {
    if (this._goVis) return;
    this._sePlay('se_kibitsu_damage', 0.4 * this.seVol);
    this.kbHP = Math.max(0, this.kbHP - dmg);
    const r = this.kbHP / this.kbHPMax;
    this.kbHpBar.setDisplaySize(54 * r, 9).setFillStyle(r > 0.5 ? 0x22dd55 : r > 0.25 ? 0xddcc22 : 0xdd2222);
    if (this.kbSpr?.setTint) this.kbSpr.setTint(0xff3333);
    this.time.delayedCall(130, () => { if (this.kbSpr?.active) this.kbSpr.clearTint?.(); });
    this._hdrUp();
    if (this.kbHP <= 0) this._gameOver();
  }

  /* ── Death FX ───────────────────────────── */
  _deathFxSmall(oni, onComplete) {
    this._sePlay('se_death_small', 0.4 * this.seVol);
    this._oniRmUI(oni);
    oni.setActive(false);
    this.tweens.add({
      targets: oni, x: oni.x + 100, alpha: 0, duration: 300, ease: 'Power2',
      onComplete: () => {
        const px = oni.x, py = oni.y;
        oni.destroy();
        const count = Phaser.Math.Between(12, 15);
        for (let i = 0; i < count; i++) {
          const angle = Phaser.Math.FloatBetween(-Math.PI * 0.85, 0.05);
          const spd   = Phaser.Math.Between(30, 80);
          const sz    = Phaser.Math.Between(2, 4);
          const g = this.add.graphics().setDepth(9);
          g.fillStyle(0xCCBB99, 1); g.fillRect(-sz / 2, -sz / 2, sz, sz);
          g.x = px + Phaser.Math.Between(-15, 15);
          g.y = py + Phaser.Math.Between(-10, 10);
          this.tweens.add({ targets: g, x: g.x + Math.cos(angle) * spd, y: g.y + Math.sin(angle) * spd, alpha: 0, duration: 800, onComplete: () => g.destroy() });
        }
        if (onComplete) onComplete();
      },
    });
  }

  _deathFxBoss(oni, onComplete) {
    this._oniRmUI(oni);
    oni.setActive(false);
    const origX = oni.x;
    let shakes = 0;
    const shake = () => {
      if (shakes >= 6) { this._bossSandify(oni, onComplete); return; }
      this.tweens.add({ targets: oni, x: origX + (shakes % 2 === 0 ? 3 : -3), duration: 80, onComplete: () => { shakes++; shake(); } });
    };
    shake();
  }

  _bossSandify(oni, onComplete) {
    this._sePlay('se_death_boss', 0.4 * this.seVol);
    const texW = oni.width, texH = oni.height;
    const sprTop = oni.y - oni.hSz / 2;
    const count  = Phaser.Math.Between(40, 50);
    for (let i = 0; i < count; i++) {
      const delay = (i / count) * 1200;
      this.time.delayedCall(delay, () => {
        if (!oni.scene) return;
        const px    = oni.x + Phaser.Math.Between(-Math.floor(oni.displayWidth / 2), Math.floor(oni.displayWidth / 2));
        const py    = sprTop + (i / count) * oni.hSz;
        const angle = Phaser.Math.FloatBetween(Math.PI * 0.25, Math.PI * 0.75);
        const spd   = Phaser.Math.Between(40, 100);
        const sz    = Phaser.Math.Between(2, 5);
        const g = this.add.graphics().setDepth(9);
        g.fillStyle(0xCCBB99, 1); g.fillRect(-sz / 2, -sz / 2, sz, sz);
        g.x = px; g.y = py;
        this.tweens.add({ targets: g, x: g.x + Math.cos(angle) * spd, y: g.y + Math.sin(angle) * spd, alpha: 0, duration: 800, onComplete: () => g.destroy() });
      });
    }
    const tw = { t: 0 };
    this.tweens.add({
      targets: tw, t: 1, duration: 1200,
      onUpdate: () => {
        if (!oni.scene) return;
        oni.setCrop(0, Math.floor(tw.t * texH), texW, Math.ceil((1 - tw.t) * texH));
      },
      onComplete: () => { oni.destroy(); if (onComplete) onComplete(); },
    });
  }

  /* ── Charm FX ───────────────────────────── */
  _useCharm(idx) {
    const c = this.slotCharms[idx];
    this.charmTimers[idx] = 0; this._cellUp(idx);
    if (this.seVol > 0) this._sePlay(`se_charm_${c.attr}`, 0.4 * this.seVol);
    fireCharm(c.id, this);
  }

  _beamFx(ang) {
    const g = this.add.graphics().setDepth(8);
    g.lineStyle(5, 0xffff66, 0.9);
    g.beginPath(); g.moveTo(this._kbSX, this._kbSY);
    g.lineTo(this._kbSX + Math.cos(ang) * 500, this._kbSY + Math.sin(ang) * 500);
    g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() });
  }

  _burstFx() {
    const g = this.add.graphics().setDepth(8);
    g.fillStyle(0xff5500, 0.5); g.fillCircle(this._kbSX + 80, this._kbSY, 100);
    this.tweens.add({ targets: g, alpha: 0, scaleX: 1.5, scaleY: 1.5, duration: 350, onComplete: () => g.destroy() });
  }

  _burnFx(oni) {
    if (!oni?.active) return;
    const g = this.add.graphics().setDepth(8);
    g.fillStyle(0xff3300, 0.7); g.fillCircle(oni.x, oni.y, 22);
    this.tweens.add({ targets: g, alpha: 0, duration: 400, onComplete: () => g.destroy() });
  }

  _rockFx() {
    for (let i = 0; i < 4; i++) {
      const rx = Phaser.Math.Between(80, W - 30), ry = Phaser.Math.Between(30, BATTLE_H - 40);
      const g = this.add.graphics().setDepth(8).setAlpha(0);
      g.fillStyle(0x886644, 1); g.fillRect(-12, -12, 24, 24);
      g.x = rx; g.y = 0;
      this.tweens.add({ targets: g, y: ry, alpha: 1, duration: 300, delay: i * 80, onComplete: () => this.tweens.add({ targets: g, alpha: 0, duration: 250, onComplete: () => g.destroy() }) });
    }
  }

  _rootFx(oni) {
    if (!oni?.active) return;
    const g = this.add.graphics().setDepth(8);
    g.lineStyle(3, 0x88bb33, 0.9);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      g.strokeCircle(oni.x + Math.cos(a) * 18, oni.y + Math.sin(a) * 18, 6);
    }
    this.tweens.add({ targets: g, alpha: 0, duration: 500, onComplete: () => g.destroy() });
  }

  _slashWindFx(base) {
    const g = this.add.graphics().setDepth(8);
    g.lineStyle(4, 0x99ffaa, 0.85);
    for (let i = -2; i <= 2; i++) {
      const a = base + i * 0.12;
      g.beginPath(); g.moveTo(this._kbSX, this._kbSY);
      g.lineTo(this._kbSX + Math.cos(a) * 340, this._kbSY + Math.sin(a) * 340); g.strokePath();
    }
    this.tweens.add({ targets: g, alpha: 0, duration: 250, onComplete: () => g.destroy() });
  }

  _blowFx() {
    const g = this.add.graphics().setDepth(8);
    g.lineStyle(6, 0xccffee, 0.8);
    g.beginPath(); g.moveTo(this._kbSX, 0); g.lineTo(this._kbSX, BATTLE_H); g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, scaleX: 3, duration: 300, onComplete: () => g.destroy() });
  }

  _mistFx() {
    const g = this.add.graphics().setDepth(2).setAlpha(0);
    g.fillStyle(0x4499ff, 0.2); g.fillRect(0, 0, W, BATTLE_H);
    this.tweens.add({ targets: g, alpha: 1, duration: 400, yoyo: true, repeat: 2, onComplete: () => g.destroy() });
  }

  /* ── Ultimate ───────────────────────────── */
  _ultFire() {
    this.gauge = 0; this.ultCooldown = 60000; this._gaugeUp();
    this._sePlay('se_ultimate', 0.4 * this.seVol);
    const ult = ULTIMATE_DATA.find(u => u.id === this.selectedUltId);
    if (!ult) return;
    switch (ult.id) {
      case 'kaguya': this._ultKaguya(ult); break;
      case 'hyosen': this._ultHyosen(ult); break;
      case 'hiroto': this._ultHiroto(ult); break;
    }
  }

  _ultKaguya(ult) {
    const sx = this._kbSX, sy = this._kbSY;
    const drawCrescent = (g) => {
      g.lineStyle(14, 0xAADDFF, 0.35);
      g.beginPath(); g.arc(0, 0, 40, -Math.PI * 0.75, Math.PI * 0.35, false); g.strokePath();
      g.lineStyle(9, 0xFFFFFF, 0.95);
      g.beginPath(); g.arc(0, 0, 40, -Math.PI * 0.75, Math.PI * 0.35, false); g.strokePath();
    };
    for (let i = 1; i <= 3; i++) {
      this.time.delayedCall(i * 38, () => {
        const ghost = this.add.graphics().setDepth(7);
        drawCrescent(ghost); ghost.x = sx; ghost.y = sy; ghost.scaleX = 0;
        this.tweens.add({ targets: ghost, scaleX: 1, duration: 60, ease: 'Power1', onComplete: () => {
          this.tweens.add({ targets: ghost, x: W + 100, rotation: 0.3, alpha: 0, duration: 280, ease: 'Power3', onComplete: () => ghost.destroy() });
        }});
      });
    }
    const g = this.add.graphics().setDepth(8);
    drawCrescent(g); g.x = sx; g.y = sy; g.scaleX = 0;
    this.tweens.add({ targets: g, scaleX: 1, duration: 70, ease: 'Back.Out', onComplete: () => {
      this.tweens.add({ targets: g, x: W + 100, rotation: 0.3, duration: 280, ease: 'Power3', onComplete: () => g.destroy() });
    }});
    for (const oni of this.onis.getChildren().filter(o => o.active)) {
      if (Math.abs(oni.y - sy) < 60) this._oniDmg(oni, ult.dmg, 'wind');
    }
  }

  _ultHyosen(ult) {
    const g = this.add.graphics().setDepth(8);
    g.fillStyle(0x220044, 0.7); g.fillRect(0, 0, W, BATTLE_H);
    g.setAlpha(0);
    this.tweens.add({ targets: g, alpha: 1, duration: 400, yoyo: true, hold: 300, onComplete: () => g.destroy() });
    for (const oni of this.onis.getChildren().filter(o => o.active)) {
      this._oniDmg(oni, ult.dmg, 'water');
      applyStatus(oni, ult.status, ult.statusDuration, this);
    }
  }

  _ultHiroto(ult) {
    const col = this.add.rectangle(W / 2, 0, W, BATTLE_H, 0xffffff, 0.5).setDepth(8).setOrigin(0.5, 0).setScale(1, 0);
    this.tweens.add({ targets: col, scaleY: 1, duration: 280, ease: 'Power2', onComplete: () =>
      this.tweens.add({ targets: col, alpha: 0, duration: 400, onComplete: () => col.destroy() }) });
    for (const oni of this.onis.getChildren().filter(o => o.active)) this._oniDmg(oni, ult.dmg, 'fire');
  }

  _ultMenuBuild() {
    this._ultMenuItems = ULTIMATE_DATA.map(u => ({
      id:  u.id,
      bg:  this.add.rectangle(0, 0, 150, 40, 0x111122).setStrokeStyle(1, 0x6644aa).setAlpha(0).setDepth(28),
      nm:  this.add.text(0, 0, u.name, { fontSize: '14px', color: '#ccaaff', fontFamily: 'serif', fontStyle: 'bold', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5).setAlpha(0).setDepth(29),
      sub: this.add.text(0, 0, u.yomi, { fontSize: '9px', color: '#887799', fontFamily: 'serif', stroke: '#000', strokeThickness: 1 }).setOrigin(0.5).setAlpha(0).setDepth(29),
    }));
  }

  _ultMenuOpen() {
    const available = ULTIMATE_DATA.filter(u => u.unlockChapter <= 1);
    if (available.length < 2) return;
    this._ultMenuVis = true;
    available.forEach((u, i) => {
      const item = this._ultMenuItems.find(m => m.id === u.id);
      const iy = SB_Y - 52 - i * 48, sel = u.id === this.selectedUltId;
      item.bg.setPosition(SB_X, iy).setAlpha(1).setStrokeStyle(sel ? 2 : 1, sel ? 0xffcc44 : 0x6644aa);
      item.nm.setPosition(SB_X, iy - 7).setAlpha(1);
      item.sub.setPosition(SB_X, iy + 11).setAlpha(1);
    });
  }

  _ultMenuClose() {
    this._ultMenuVis = false;
    for (const item of this._ultMenuItems) { item.bg.setAlpha(0); item.nm.setAlpha(0); item.sub.setAlpha(0); }
  }

  _ultMenuTap(x, y) {
    const available = ULTIMATE_DATA.filter(u => u.unlockChapter <= 1);
    for (let i = 0; i < available.length; i++) {
      const iy = SB_Y - 52 - i * 48;
      if (Math.abs(x - SB_X) < 78 && Math.abs(y - iy) < 22) {
        this.selectedUltId = available[i].id; this._sbUpdate(); this._ultMenuClose(); return;
      }
    }
    this._ultMenuClose();
  }

  /* ── 戦闘ループ（百鬼夜行固有） ─────────── */
  _battleStart() {
    this._restActive = false;

    this._waveTimer = this.time.addEvent({
      delay: 30000, loop: true,
      callback: () => {
        this.wave++;
        this._bgUp();
        this._waveUiUp();
        if      (this.wave % 50 === 0) this._bossStart();
        else if (this.wave % 10 === 0) this._restStart();
      },
    });

    this._spawnTimer = this.time.addEvent({
      delay: 1500, loop: true,
      callback: () => {
        if (!this._restActive && this.onis.countActive(true) < 8) this._spawnEnemy();
      },
    });
  }

  /* ── 敵スポーン ─────────────────────────── */
  _spawnEnemy() {
    const sc = this._getScale(this.wave);
    let base, imgKey, name, fs, fc, col, stk, bw, exp;
    if (this.wave >= 80) {
      base = HK_OGRE;  imgKey = 'oni-large'; name = '【大鬼】'; fs = '13px'; fc = '#ffcc88'; col = 0x441100; stk = 0xff8833; bw = 66; exp = 60;
    } else if (this.wave >= 20 && Math.random() < 0.3) {
      base = HK_NAMED; imgKey = 'oni-mid';   name = '中鬼';     fs = '13px'; fc = '#ddaaff'; col = 0x661199; stk = 0xcc88ff; bw = 52; exp = EXP_N;
    } else {
      base = HK_GRUNT; imgKey = 'oni-small'; name = '小鬼';     fs = '20px'; fc = '#ffbbbb'; col = 0xaa1a1a; stk = 0xff6644; bw = ONI_BW; exp = EXP_G;
    }
    const hp  = Math.round(base.baseHP  * sc);
    const dmg = Math.round(base.baseDmg * sc);
    const spd = 30 + this.wave * 0.5;
    const sy  = Phaser.Math.Between(40, BATTLE_H - 40);
    this._makeOni(W + 20, sy, 28, 28, col, stk, name, fs, fc, hp, spd, dmg, bw, exp, false, imgKey, 'none');
  }

  /* ── 10WAVE 休憩 ─────────────────────────── */
  _restStart() {
    this._restActive = true;
    if (this._spawnTimer) this._spawnTimer.paused = true;
    if (this._waveTimer)  this._waveTimer.paused  = true;
    this._clearEnemies();
    this.kbHP = this.kbHPMax;
    this._hdrUp();
    this._upgOpen(() => this._restEnd());
  }

  _restEnd() {
    this._restActive = false;
    if (this._spawnTimer) this._spawnTimer.paused = false;
    if (this._waveTimer)  this._waveTimer.paused  = false;
  }

  /* ── 50WAVE ボス ─────────────────────────── */
  _bossStart() {
    this._restActive = true;
    if (this._spawnTimer) this._spawnTimer.paused = true;
    if (this._waveTimer)  this._waveTimer.paused  = true;
    this._clearEnemies();

    const overlay = this.add.rectangle(W / 2, BATTLE_H / 2, W, BATTLE_H, 0x000000, 0).setDepth(50);
    const warnTxt = this.add.text(W / 2, BATTLE_H / 2 - 20, '恐ろしい鬼の\n気配がする……', {
      fontSize: '22px', color: '#ff3333', fontFamily: 'serif', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 8, align: 'center', lineSpacing: 8,
    }).setOrigin(0.5).setAlpha(0).setDepth(51);

    this._sePlay('se_boss_warning', 0.4 * this.seVol);
    this.tweens.add({ targets: overlay, alpha: 0.88, duration: 500, onComplete: () => {
      this.tweens.add({ targets: warnTxt, alpha: 1, duration: 200 });
      let flashRed = true;
      this._bossWarnFlashTimer = this.time.addEvent({
        delay: 200, loop: true,
        callback: () => { flashRed = !flashRed; warnTxt.setColor(flashRed ? '#ff3333' : '#ffcc00'); },
      });
      this._bossWarnShakeTimer = this.time.addEvent({
        delay: 80, loop: true,
        callback: () => { warnTxt.setX(W / 2 + (Math.random() - 0.5) * 14); },
      });
      this.time.delayedCall(1500, () => {
        if (this._bossWarnFlashTimer) { this._bossWarnFlashTimer.remove(false); this._bossWarnFlashTimer = null; }
        if (this._bossWarnShakeTimer) { this._bossWarnShakeTimer.remove(false); this._bossWarnShakeTimer = null; }
        warnTxt.setX(W / 2);
        this.tweens.add({ targets: [overlay, warnTxt], alpha: 0, duration: 500,
          onComplete: () => { overlay.destroy(); warnTxt.destroy(); this._bossSpawn(); },
        });
      });
    }});
  }

  _bossSpawn() {
    const nameIdx = Phaser.Math.Between(0, HK_BOSS_NAMES.length - 1);
    const name    = HK_BOSS_NAMES[nameIdx];
    const sc      = this._getScale(this.wave);
    const hp      = Math.round(BOSS_HP[nameIdx + 1] * sc);
    const dmg     = Math.round(BOSS_DMG * sc);
    const sy      = Phaser.Math.Between(80, BATTLE_H - 50);
    const imgKey  = HK_BOSS_IMGS[nameIdx] || 'oni-ura';

    this._makeOni(W + 30, sy, 56, 84, 0x220044, 0xff33ff, `【${name}】`, '13px', '#ff88ff', hp, BOSS_SPD, dmg, 72, EXP_B, true, imgKey, 'none');

    this._bossHpBarBg.setAlpha(1);
    this._bossHpBar.setAlpha(1).setDisplaySize(W - 40, 12);
    this._bossNameTxt.setText(`【${name}】`).setAlpha(1);
  }

  _bossDefeated() {
    this._bossHpBarBg.setAlpha(0);
    this._bossHpBar.setAlpha(0);
    this._bossNameTxt.setAlpha(0);
    this._cpOpen(() => {
      this._upgOpen(() => {
        this.kbHP = this.kbHPMax;
        this._hdrUp();
        this._restEnd();
      });
    });
  }

  _clearEnemies() {
    for (const oni of [...this.onis.getChildren()]) {
      if (oni.active) this._oniRm(oni);
    }
    this._bossHpBarBg.setAlpha(0);
    this._bossHpBar.setAlpha(0);
    this._bossNameTxt.setAlpha(0);
  }

  /* ── ゲームオーバー ─────────────────────── */
  _goBuild() {
    this._goBg      = this.add.rectangle(W / 2, H / 2, W, H, 0x000000).setAlpha(0).setDepth(60);
    this._goTitle   = this.add.text(W / 2, H / 2 - 130, '討死', { fontSize: '32px', color: '#ffffff', fontFamily: '"Yuji Syuku", serif', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setAlpha(0).setDepth(61);
    this._goWaveTxt = this.add.text(W / 2, H / 2 - 80, '', { fontSize: '22px', color: '#ffffff', fontFamily: '"Yuji Syuku", serif', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setAlpha(0).setDepth(61);
    this._goPostBg  = this.add.rectangle(W / 2, H / 2 + 10, 240, 52, 0x000000).setStrokeStyle(2, 0xffffff).setAlpha(0).setDepth(60);
    this._goPostTxt = this.add.text(W / 2, H / 2 + 10, 'Xに投稿する', { fontSize: '18px', color: '#ffffff', fontFamily: 'serif' }).setOrigin(0.5).setAlpha(0).setDepth(61);
    this._goBackBg  = this.add.rectangle(W / 2, H / 2 + 82, 240, 52, 0x000000).setStrokeStyle(2, 0xffffff).setAlpha(0).setDepth(60);
    this._goBackTxt = this.add.text(W / 2, H / 2 + 82, 'タイトルへ戻る', { fontSize: '18px', color: '#ffffff', fontFamily: 'serif' }).setOrigin(0.5).setAlpha(0).setDepth(61);
  }

  _gameOver() {
    this._clearEnemies();
    if (this._spawnTimer) { this._spawnTimer.remove(false); this._spawnTimer = null; }
    if (this._waveTimer)  { this._waveTimer.remove(false);  this._waveTimer  = null; }
    this._goVis = true;
    this._goBg.setAlpha(0.85);
    this._goTitle.setAlpha(1);
    this._goWaveTxt.setText(`第${this._toKanji(this.wave)}波ニ至ル`).setAlpha(1);
    this._goPostBg.setAlpha(1); this._goPostTxt.setAlpha(1);
    this._goBackBg.setAlpha(1); this._goBackTxt.setAlpha(1);
  }

  _goTap(x, y) {
    if (Math.abs(x - W / 2) < 124 && Math.abs(y - (H / 2 + 10)) < 28) { window.open(this._xPostUrl(), '_blank'); return; }
    if (Math.abs(x - W / 2) < 124 && Math.abs(y - (H / 2 + 82)) < 28) { this._goVis = false; this.scene.start('TitleScene'); }
  }

  _xPostUrl() {
    const w = this.wave;
    let battle, end;
    if      (w <= 5)  { battle = '若干数ヲ屠ル';           end = '敢闘ノ末、戦死ヲ遂グ'; }
    else if (w <= 10) { battle = '相当数ヲ屠ル';           end = '奮戦ノ末、戦死ヲ遂グ'; }
    else if (w <= 20) { battle = '夥シキ数ヲ屠ル';         end = '死闘ノ末、戦死ヲ遂グ'; }
    else if (w <= 30) { battle = '無数ヲ屠ル';             end = '壮烈ナル戦死ヲ遂グ'; }
    else if (w <= 50) { battle = '無尽ノ鬼共ヲ屠ル';       end = '神州不滅ヲ信ジ、戦死ヲ遂グ'; }
    else              { battle = '天地ヲ埋メル鬼共ヲ屠ル'; end = '鬼神ニモ劣ラヌ奮闘ノ末、戦死ヲ遂グ'; }
    const text = `【百鬼夜行記録】\n交戦：第${this._toKanji(w)}波ニ至ル\n戦果：${battle}\n結末：${end}\n#KibitsuREact`;
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  }

  /* ── Pause ──────────────────────────────── */
  _pauseBuild() {
    this._pauseOv = this.add.rectangle(W / 2, BATTLE_H / 2, W, BATTLE_H, 0x000000, 0.7).setDepth(35).setVisible(false);
    const baseY = BATTLE_H / 2 - 100;
    const labels = ['再開', '音楽 ●ON', '効果音 ●ON', '書紀を読む', 'タイトルへ'];
    this._pauseItems = labels.map((lbl, i) =>
      this.add.text(W / 2, baseY + i * 50, lbl, { fontSize: '24px', color: '#ffffff', fontFamily: 'serif', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(36).setVisible(false)
    );
    const confBaseY = BATTLE_H / 2 - 50;
    const confLabels = ['タイトルへ戻る', 'キャンセル'];
    this._pauseConfItems = confLabels.map((lbl, i) =>
      this.add.text(W / 2, confBaseY + i * 55, lbl, { fontSize: '22px', color: '#ffffff', fontFamily: 'serif', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(36).setVisible(false)
    );
    this._pauseConfVis = false;
  }

  _pauseOpen() {
    this.paused = true;
    this.tweens.pauseAll();
    this._pauseOv.setVisible(true);
    this._pauseItems[1].setText(this.seVol > 0 ? '音楽 ●ON' : '音楽 ○OFF')
      .setStyle({ color: this.seVol > 0 ? '#ffffff' : '#888888', fontSize: '24px', fontFamily: 'serif', stroke: '#000', strokeThickness: 3 });
    this._pauseItems[2].setText(this.seVol > 0 ? '効果音 ●ON' : '効果音 ○OFF')
      .setStyle({ color: this.seVol > 0 ? '#ffffff' : '#888888', fontSize: '24px', fontFamily: 'serif', stroke: '#000', strokeThickness: 3 });
    for (const t of this._pauseItems) t.setVisible(true);
    this._pauseConfVis = false;
    for (const t of this._pauseConfItems) t.setVisible(false);
  }

  _pauseClose() {
    this.paused = false;
    this.tweens.resumeAll();
    this._pauseOv.setVisible(false);
    for (const t of this._pauseItems)     t.setVisible(false);
    for (const t of this._pauseConfItems) t.setVisible(false);
    this._pauseConfVis = false;
  }

  _pauseTap(x, y) {
    const confBaseY = BATTLE_H / 2 - 50;
    if (this._pauseConfVis) {
      for (let i = 0; i < 2; i++) {
        if (Math.abs(y - (confBaseY + i * 55)) < 24) {
          if (i === 0) { this.scene.start('TitleScene'); }
          else { this._pauseConfVis = false; for (const t of this._pauseConfItems) t.setVisible(false); for (const t of this._pauseItems) t.setVisible(true); }
          return;
        }
      }
      return;
    }
    const baseY = BATTLE_H / 2 - 100;
    for (let i = 0; i < 5; i++) {
      if (Math.abs(y - (baseY + i * 50)) < 22) {
        if (i === 0) { this._pauseClose(); }
        else if (i === 1 || i === 2) {
          const opts = loadOpts();
          this.seVol = this.seVol > 0 ? 0 : 0.8;
          saveOpts({ ...opts, seVol: this.seVol });
          this._pauseItems[1].setText(this.seVol > 0 ? '音楽 ●ON' : '音楽 ○OFF').setStyle({ color: this.seVol > 0 ? '#ffffff' : '#888888', fontSize: '24px', fontFamily: 'serif', stroke: '#000', strokeThickness: 3 });
          this._pauseItems[2].setText(this.seVol > 0 ? '効果音 ●ON' : '効果音 ○OFF').setStyle({ color: this.seVol > 0 ? '#ffffff' : '#888888', fontSize: '24px', fontFamily: 'serif', stroke: '#000', strokeThickness: 3 });
        }
        else if (i === 3) { window.openTutorial?.(); }
        else if (i === 4) { this._pauseConfVis = true; for (const t of this._pauseItems) t.setVisible(false); for (const t of this._pauseConfItems) t.setVisible(true); }
        return;
      }
    }
  }

  /* ── Long press / Tooltip ───────────────── */
  _lpStart(p) {
    if (this._lpActive) return;
    if (Math.abs(p.x - SB_X) < 62 && Math.abs(p.y - SB_Y) < 24) {
      if (this._ultLpTimer) { this._ultLpTimer.remove(false); this._ultLpTimer = null; }
      this._ultLpTimer = this.time.delayedCall(500, () => {
        this._ultLpTimer = null;
        if (!this.dialogActive) this._ultMenuOpen();
      });
      return;
    }
    if (this._lpTimer) { this._lpTimer.remove(false); this._lpTimer = null; }
    const { x, y } = p;
    if (y < GRID_TOP || y >= GRID_BOT) return;
    const col = Math.floor((x - GRID_X0) / CELL_W), row = Math.floor((y - GRID_TOP) / CELL_H);
    if (col < 0 || col >= 3 || row < 0 || row >= 3) return;
    const idx = row * 3 + col;
    if (idx >= this.unlockedSlots || !this.slotCharms[idx]) return;
    this._lpTimer = this.time.delayedCall(500, () => { this._lpActive = true; this._tooltipShow(idx); });
  }

  _lpEnd(p) {
    if (this._ultLpTimer) {
      this._ultLpTimer.remove(false); this._ultLpTimer = null;
      if (this.gaugeReady && this.ultCooldown <= 0 && !this.paused && !this.dialogActive) this._ultFire();
      return;
    }
    if (this._lpTimer) { this._lpTimer.remove(false); this._lpTimer = null; }
  }

  _removeCharmViaTooltip() {
    if (this._lpIdx < 0) return;
    this.slotCharms[this._lpIdx] = null;
    this.charmTimers[this._lpIdx] = 0;
    this._gridUp(); this._tooltipHide(); this._lpActive = false;
  }

  _tooltipBuild() {
    this._tipBg  = this.add.graphics().setDepth(25).setAlpha(0);
    this._tipTxt = this.add.text(0, 0, '', { fontSize: '12px', color: '#ffffff', fontFamily: 'serif', lineSpacing: 4, stroke: '#000', strokeThickness: 2 }).setDepth(26).setAlpha(0);
    this._tipRemoveBg  = this.add.graphics().setDepth(26).setAlpha(0);
    this._tipRemoveTxt = this.add.text(0, 0, '外す', { fontSize: '13px', color: '#ffffff', fontFamily: 'serif', fontStyle: 'bold', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5).setDepth(27).setAlpha(0);
    this._tipOverlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(24).setVisible(false);
    this._tipOverlay.setInteractive();
    this._tipOverlay.input.enabled = false;
    this._tipOverlay.on('pointerdown', () => { this._tooltipHide(); this._lpActive = false; });
    this._tipRemoveHit = this.add.rectangle(0, 0, 70, 28, 0xffffff, 0).setDepth(27).setVisible(false);
    this._tipRemoveHit.setInteractive();
    this._tipRemoveHit.input.enabled = false;
    this._tipRemoveHit.on('pointerdown', (pointer, lx, ly, event) => { event.stopPropagation(); this._removeCharmViaTooltip(); });
    this._lpIdx = -1;
  }

  _tooltipShow(idx) {
    const c = this.slotCharms[idx]; if (!c) return;
    const col = idx % 3, row = Math.floor(idx / 3);
    const cellCX = GRID_X0 + col * CELL_W + CELL_W / 2, cellTop = GRID_TOP + row * CELL_H;
    const tgtMap = { single: '単体', fan3: '扇3体', pierceAll: '貫通', areaAll: '全体' };
    const stMap  = { burn: '燃焼', stun: 'スタン', root: '拘束', slow: '鈍足' };
    const lines  = [c.name, `属性：${ATTR_NAMES[c.attr] || '－'}  DMG：${c.damage}`, `対象：${tgtMap[c.target] || c.target}`];
    if (c.status) lines.push(`状態異常：${stMap[c.status] || c.status}（${c.statusDuration / 1000}s）`);
    lines.push(`チャージ：${(c.chargeMs / 1000).toFixed(1)}s`);
    this._tipTxt.setText(lines.join('\n')).setAlpha(1);
    const pad = 12, tw = this._tipTxt.width + pad * 2, th = this._tipTxt.height + pad * 2;
    const tipCY = Math.max(th / 2 + 5, cellTop - 10 - th / 2);
    const tipCX = Phaser.Math.Clamp(cellCX, tw / 2 + 5, W - tw / 2 - 5);
    this._tipBg.clear(); this._tipBg.fillStyle(0x000000, 0.85);
    this._tipBg.fillRoundedRect(tipCX - tw / 2, tipCY - th / 2, tw, th, 8); this._tipBg.setAlpha(1);
    this._tipTxt.setPosition(tipCX - tw / 2 + pad, tipCY - th / 2 + pad).setAlpha(1);
    const btnW = 70, btnH = 28, btnX = tipCX, btnY = tipCY + th / 2 + 8 + btnH / 2;
    this._tipRemoveBg.clear(); this._tipRemoveBg.fillStyle(0xAA0000, 1);
    this._tipRemoveBg.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 6); this._tipRemoveBg.setAlpha(1);
    this._tipRemoveTxt.setPosition(btnX, btnY).setAlpha(1);
    this._tipOverlay.setVisible(true); this._tipOverlay.input.enabled = true;
    this._tipRemoveHit.setPosition(btnX, btnY).setVisible(true); this._tipRemoveHit.input.enabled = true;
    this._lpIdx = idx;
  }

  _tooltipHide() {
    this._tipBg.setAlpha(0); this._tipTxt.setAlpha(0);
    this._tipRemoveBg.setAlpha(0); this._tipRemoveTxt.setAlpha(0);
    this._tipOverlay.setVisible(false); this._tipOverlay.input.enabled = false;
    this._tipRemoveHit.setVisible(false); this._tipRemoveHit.input.enabled = false;
    this._lpIdx = -1;
  }

  /* ── Upgrade ────────────────────────────── */
  _upgBuild() {
    const b = UI_Y0;
    this._upgBg  = this.add.rectangle(W / 2, b + UI_H / 2, W, UI_H, 0x050308).setAlpha(0).setDepth(17);
    this._upgTtl = this.add.text(W / 2, b + 18, 'キビツを強化する', { fontSize: '17px', color: '#ffcc88', fontFamily: 'serif', fontStyle: 'bold' }).setOrigin(0.5).setAlpha(0).setDepth(18);
    this._upgExpTxt = this.add.text(W / 2, b + 44, '', { fontSize: '13px', color: '#aaeeaa', fontFamily: 'Arial' }).setOrigin(0.5).setAlpha(0).setDepth(18);
    this._upgBtns = [
      { label: 'HP強化',       key: 'hp',    baseCost: 20, desc: '+50 最大HP' },
      { label: '斬撃強化',     key: 'slash',  baseCost: 25, desc: '基本威力 +3' },
      { label: '詠唱短縮',     key: 'cast',   baseCost: 20, desc: 'チャージ速度 +3%' },
      { label: 'スロット解放', key: 'slot',   baseCost: 30, desc: '呪符スロット +1（上限9）' },
    ].map((item, i) => {
      const by = b + 80 + i * 86;
      return {
        bg:  this.add.rectangle(W / 2, by, W - 40, 70, 0x100a1a).setStrokeStyle(2, 0x664488).setAlpha(0).setDepth(18),
        lbl: this.add.text(W / 2, by - 12, '', { fontSize: '15px', color: '#ccaaff', fontFamily: 'serif' }).setOrigin(0.5).setAlpha(0).setDepth(19),
        ds:  this.add.text(W / 2, by + 12, '', { fontSize: '12px', color: '#998899', fontFamily: 'Arial' }).setOrigin(0.5).setAlpha(0).setDepth(19),
        item,
      };
    });
    this._upgSkip = this.add.text(W / 2, b + 430, 'スキップ', { fontSize: '14px', color: '#665566', fontFamily: 'Arial' }).setOrigin(0.5).setAlpha(0).setDepth(19);
    this._upgOnComplete = null;
  }

  _upgCost(key) {
    const b = this._upgBtns.find(u => u.item.key === key);
    return b ? b.item.baseCost * Math.pow(2, this.upgradeCounts[key] ?? 0) : 0;
  }

  _upgOpen(onComplete) {
    this._upgOnComplete = onComplete || null;
    this._upgVis = true;
    this._upgBg.setAlpha(0.97); this._upgTtl.setAlpha(1); this._upgSkip.setAlpha(1);
    this._upgRefresh();
  }

  _upgRefresh() {
    this._upgExpTxt.setText(`所持EXP: ${this.totalExp}  /  スロット: ${this.unlockedSlots}/9`).setAlpha(1);
    for (const b of this._upgBtns) {
      const disabled = b.item.key === 'slot' && this.unlockedSlots >= 9;
      b.bg.setAlpha(1).setStrokeStyle(2, disabled ? 0x333333 : 0x664488);
      const cost = this._upgCost(b.item.key);
      b.lbl.setText(`${b.item.label}  ${disabled ? '（上限到達）' : `[${cost} EXP]`}`)
        .setStyle({ color: disabled ? '#555555' : '#ccaaff', fontSize: '15px', fontFamily: 'serif' }).setAlpha(1);
      b.ds.setText(b.item.desc).setAlpha(1);
    }
  }

  _upgTap(x, y) {
    const b = UI_Y0;
    if (Math.abs(y - (b + 430)) < 22) { this._upgClose(); return; }
    for (let i = 0; i < this._upgBtns.length; i++) {
      const by = b + 80 + i * 86;
      if (Math.abs(y - by) < 38) {
        const { key } = this._upgBtns[i].item;
        if (key === 'slot' && this.unlockedSlots >= 9) return;
        const cost = this._upgCost(key);
        if (this.totalExp >= cost) { this.totalExp -= cost; this._upgApply(key); this._upgRefresh(); }
        return;
      }
    }
  }

  _upgApply(key) {
    if      (key === 'hp')    { this.kbHPMax += 50; this.kbHP = Math.min(this.kbHP + 50, this.kbHPMax); this._hdrUp(); }
    else if (key === 'slash') { this.slashDmg += 3; }
    else if (key === 'cast')  {
      for (const c of [...this.bagCharms, ...this.slotCharms.filter(Boolean)]) {
        c.chargeMs = Math.max(400, Math.round(c.chargeMs * 0.97));
      }
    }
    else if (key === 'slot') { this.unlockedSlots = Math.min(9, this.unlockedSlots + 1); this._gridUp(); }
    this.upgradeCounts[key] = (this.upgradeCounts[key] ?? 0) + 1;
  }

  _upgClose() {
    this._upgVis = false;
    this._upgBg.setAlpha(0); this._upgTtl.setAlpha(0); this._upgExpTxt.setAlpha(0); this._upgSkip.setAlpha(0);
    for (const b of this._upgBtns) { b.bg.setAlpha(0); b.lbl.setAlpha(0); b.ds.setAlpha(0); }
    if (this._upgOnComplete) {
      const cb = this._upgOnComplete;
      this._upgOnComplete = null;
      cb();
    }
  }

  /* ── 呪符選択UI ──────────────────────────── */
  _cpBuild() {
    const b = UI_Y0;
    this._cpBg  = this.add.rectangle(W / 2, b + UI_H / 2, W, UI_H, 0x020d18).setAlpha(0).setDepth(17);
    this._cpTtl = this.add.text(W / 2, b + 18, '呪符を選ぶ（3択）', { fontSize: '16px', color: '#88ccff', fontFamily: 'serif', fontStyle: 'bold' }).setOrigin(0.5).setAlpha(0).setDepth(18);
    this._cpBtns = [];
    for (let i = 0; i < 3; i++) {
      const by = b + 70 + i * 110;
      this._cpBtns.push({
        bg:  this.add.rectangle(W / 2, by, W - 36, 96, 0x0a1520).setStrokeStyle(2, 0x3366aa).setAlpha(0).setDepth(18),
        nm:  this.add.text(W / 2, by - 22, '', { fontSize: '16px', color: '#88ccff', fontFamily: 'serif', fontStyle: 'bold' }).setOrigin(0.5).setAlpha(0).setDepth(19),
        ds:  this.add.text(W / 2, by + 8, '',  { fontSize: '12px', color: '#aabbcc', fontFamily: 'Arial', align: 'center' }).setOrigin(0.5).setAlpha(0).setDepth(19),
        charm: null,
      });
    }
    this._cpSkip = this.add.text(W / 2, b + 420, 'スキップ', { fontSize: '14px', color: '#556655', fontFamily: 'Arial' }).setOrigin(0.5).setAlpha(0).setDepth(19);
    this._cpOnComplete = null;
  }

  _cpOpen(onComplete) {
    this._cpOnComplete = onComplete || null;
    this._cpVis = true;
    this._cpBg.setAlpha(0.97); this._cpTtl.setAlpha(1); this._cpSkip.setAlpha(1);
    const pool    = shuffle(CHARM_DEFS.filter(c => ['water', 'earth', 'fire', 'wind'].includes(c.attr)));
    const choices = pool.slice(0, 3);
    for (let i = 0; i < 3; i++) {
      const btn = this._cpBtns[i], c = choices[i];
      if (c) {
        btn.charm = c;
        btn.bg.setAlpha(1).setStrokeStyle(2, 0x3366aa);
        btn.nm.setText(`[${ATTR_NAMES[c.attr] || '－'}] ${c.name}`).setAlpha(1);
        btn.ds.setText(`${c.desc}  [${(c.chargeMs / 1000).toFixed(1)}s]`).setAlpha(1);
      } else {
        btn.charm = null; btn.bg.setAlpha(0); btn.nm.setAlpha(0); btn.ds.setAlpha(0);
      }
    }
  }

  _cpTap(x, y) {
    const b = UI_Y0;
    if (Math.abs(y - (b + 420)) < 22) { this._cpClose(); return; }
    for (let i = 0; i < 3; i++) {
      const by = b + 70 + i * 110;
      if (Math.abs(y - by) < 52 && this._cpBtns[i].charm) {
        if (this.bagCharms.length < 3) this.bagCharms.push({ ...this._cpBtns[i].charm });
        this._bagUp();
        this._cpClose(); return;
      }
    }
  }

  _cpClose() {
    this._cpVis = false;
    this._cpBg.setAlpha(0); this._cpTtl.setAlpha(0); this._cpSkip.setAlpha(0);
    for (const b of this._cpBtns) { b.bg.setAlpha(0); b.nm.setAlpha(0); b.ds.setAlpha(0); }
    if (this._cpOnComplete) {
      const cb = this._cpOnComplete;
      this._cpOnComplete = null;
      cb();
    }
  }

  /* ── Dialog ─────────────────────────────── */
  _dlgBuild() {
    const boxH = 120, boxCY = BATTLE_H - boxH / 2;
    this._dlgBg = this.add.rectangle(W / 2, boxCY, W, boxH, 0x000000).setAlpha(0).setDepth(20);
    this._dlgLine = this.add.rectangle(W / 2, BATTLE_H - boxH, W, 2, 0x445544).setAlpha(0).setDepth(20);
    this._dlgSpeakerTxt = this.add.text(14, BATTLE_H - boxH + 10, '', { fontSize: '17px', color: '#ffdd88', fontFamily: 'serif', fontStyle: 'bold', stroke: '#000', strokeThickness: 2 }).setAlpha(0).setDepth(21);
    this._dlgBodyTxt    = this.add.text(14, BATTLE_H - boxH + 30, '', { fontSize: '18px', color: '#ffffff', fontFamily: 'serif', stroke: '#000', strokeThickness: 2 }).setAlpha(0).setDepth(21);
    this._dlgIndTxt     = this.add.text(W - 12, BATTLE_H - 10, '▼', { fontSize: '13px', color: '#aaaaaa', fontFamily: 'Arial' }).setOrigin(1, 1).setAlpha(0).setDepth(21);
    this._dlgIndTween = this.tweens.add({ targets: this._dlgIndTxt, alpha: { from: 0.25, to: 1.0 }, yoyo: true, repeat: -1, duration: 550, paused: true });
  }

  _dlgShow(lines, onComplete) {
    this._dlgLines = lines; this._dlgIdx = 0; this._dlgOnComplete = onComplete || null;
    this.dialogActive = true;
    this._dlgIndTween.resume();
    this._dlgRender();
  }

  _dlgRender() {
    const line = this._dlgLines[this._dlgIdx];
    this._dlgBg.setFillStyle(0x000000).setAlpha(0.92);
    this._dlgLine.setAlpha(1);
    this._dlgSpeakerTxt.setText(line.speaker || '').setAlpha(line.speaker ? 1 : 0);
    this._dlgBodyTxt
      .setX(14).setY(BATTLE_H - 85).setOrigin(0, 0)
      .setStyle({ fontSize: '18px', color: '#ffffff', fontFamily: 'serif', fontStyle: 'normal', align: 'left', stroke: '#000', strokeThickness: 2 })
      .setText(this._kinsokuWrap(line.text, W - 28, '18px serif'))
      .setAlpha(1);
  }

  _dlgNext() {
    this._dlgIdx++;
    if (this._dlgIdx >= this._dlgLines.length) this._dlgHide();
    else this._dlgRender();
  }

  _dlgHide() {
    this.dialogActive = false;
    this._dlgBg.setAlpha(0); this._dlgLine.setAlpha(0);
    this._dlgSpeakerTxt.setAlpha(0); this._dlgBodyTxt.setAlpha(0);
    this._dlgIndTxt.setAlpha(0); this._dlgIndTween.pause();
    if (this._dlgOnComplete) { const cb = this._dlgOnComplete; this._dlgOnComplete = null; cb(); }
  }

  _kinsokuWrap(text, maxPx, fontStr) {
    const KINSOKU = new Set(['。','、','，','．','・','：','；','？','！','）','〕','】','』','」','〉','》','…','ー','っ','ッ','ぁ','ァ','ぃ','ィ','ぅ','ゥ','ぇ','ェ','ぉ','ォ','ゃ','ャ','ゅ','ュ','ょ','ョ','ゎ','ヮ']);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = fontStr;
    const lines = []; let cur = '', curW = 0;
    for (const ch of text) {
      if (ch === '\n') { lines.push(cur); cur = ''; curW = 0; continue; }
      const cw = ctx.measureText(ch).width;
      if (curW + cw > maxPx) {
        if (KINSOKU.has(ch)) { lines.push(cur + ch); cur = ''; curW = 0; }
        else { lines.push(cur); cur = ch; curW = cw; }
      } else { cur += ch; curW += cw; }
    }
    if (cur) lines.push(cur);
    return lines.join('\n');
  }

  /* ── SE ─────────────────────────────────── */
  _sePlay(key, vol) {
    if (vol <= 0) return;
    if (!this.cache.audio.has(key)) return;
    const now = Date.now();
    if (this._seLastMs[key] && now - this._seLastMs[key] < 150) return;
    this._seLastMs[key] = now;
    this.sound.play(key, { volume: vol });
  }

  /* ── タップ振り分け ─────────────────────── */
  _tap(ptr) {
    const { x, y } = ptr;
    if (this._lpActive) return;
    if (x >= 355 && x <= 385 && y >= 0 && y <= 30) {
      if (!this.paused && !this.dialogActive) this._pauseOpen(); return;
    }
    if (this._ultMenuVis) { this._ultMenuTap(x, y); return; }
    if (this.paused && y < BATTLE_H) { if (!this.dialogActive) this._pauseTap(x, y); return; }
    if (this.dialogActive) { this._dlgNext(); return; }
    if (this._goVis)  { this._goTap(x, y);  return; }
    if (this._cpVis)  { this._cpTap(x, y);  return; }
    if (this._upgVis) { this._upgTap(x, y); return; }

    if (y < BATTLE_H) return;

    if (y >= SLASH_Y && y < SLASH_Y + SLASH_H) {
      if (this._bagPickMode >= 0) { this._bagPickMode = -1; this._bagUp(); return; }
      this._doSlash(); return;
    }
    if (y >= DESC_Y + 22 && y < DESC_Y + 88) {
      const col = Math.floor((x - GRID_X0) / CELL_W);
      if (col >= 0 && col < 3) {
        if (this._bagPickMode === col) { this._bagPickMode = -1; this._bagUp(); }
        else if (this.bagCharms[col])  { this._bagPickMode = col;  this._bagUp(); }
      }
      return;
    }
    if (y >= GRID_TOP && y < GRID_BOT) {
      const col = Math.floor((x - GRID_X0) / CELL_W), row = Math.floor((y - GRID_TOP) / CELL_H);
      if (col >= 0 && col < 3 && row >= 0 && row < 3) {
        const idx = row * 3 + col;
        if (idx >= this.unlockedSlots) return;
        if (this._bagPickMode >= 0) {
          if (!this.slotCharms[idx]) {
            const c = this.bagCharms.splice(this._bagPickMode, 1)[0];
            this.slotCharms[idx] = { ...c };
            this.charmTimers[idx] = 0;
            this._bagPickMode = -1;
            this._bagUp(); this._gridUp();
          }
        }
      }
    }
  }

  /* ── Shutdown ───────────────────────────── */
  shutdown() {
    if (this._bossWarnFlashTimer) { this._bossWarnFlashTimer.remove(false); this._bossWarnFlashTimer = null; }
    if (this._bossWarnShakeTimer) { this._bossWarnShakeTimer.remove(false); this._bossWarnShakeTimer = null; }
    if (this._waveTimer)  { this._waveTimer.remove(false);  this._waveTimer  = null; }
    if (this._spawnTimer) { this._spawnTimer.remove(false); this._spawnTimer = null; }
    for (const oni of [...this.onis.getChildren()]) { if (oni.active) this._oniRm(oni); }
    this.tweens.killAll();
  }
}
