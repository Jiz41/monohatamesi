'use strict';

const DEBUG = true; // 本番リリース時は false に

/* ── BG ─────────────────────────────────────── */
const BG_CHAPTER_COLORS = [0x1a2a4a, 0x3a1a4a, 0x4a1a1a, 0x2a2a2a, 0xd0d0d0];
const BG_OVERLAY_ALPHA  = 0.4;
const BG_GROUND_GRAD_H  = 70;

/* ── Ultimate Data ──────────────────────────── */
const ULTIMATE_DATA = [
  { id:'kaguya', name:'香山颪', yomi:'かぐやまおろし', unlockChapter:1, dmg:150 },
  { id:'hyosen', name:'氷川叢雲', yomi:'ひょうせんむらくも', unlockChapter:3, dmg:80,  status:'slow', statusDuration:3000 },
  { id:'hiroto', name:'广斗越天', yomi:'ひろとえてん',       unlockChapter:5, dmg:200 },
];

/* ══════════════════════════════════════════════ */
class MainScene extends Phaser.Scene {
  constructor() { super({ key: 'MainScene' }); }

  preload() {
    this.load.image('kibitsu',      'img/kibitsu.png');
    this.load.image('oni-small',    'img/oni-small.png');
    this.load.image('oni-mid',      'img/oni-mid.png');
    this.load.image('oni-large',    'img/oni-large.png');
    this.load.image('oni-ura',      'img/oni-ura.png');
    this.load.image('oni-ibaraki',  'img/oni-ibaraki.png');
    this.load.image('oni-shuten',   'img/oni-shuten.png');
    this.load.image('oni-otake',    'img/oni-otake.png');
    this.load.image('oni-soranaki', 'img/oni-soranaki.png');
    this.load.image('momotaro',     'img/???.png');
    this.load.image('bg_sky',    'img/back_sky.png');
    this.load.image('bg_ground', 'img/back_ground.png');
    this.load.audio('bgm_battle', 'audio/onisankochira.mp3');
    this.load.audio('bgm_shurai', 'audio/shurai.mp3');
    this.load.audio('bgm_boss5',  'audio/ushitoraMantra.mp3');

    /* ── ローディング画面 ───────────────────────── */
    const LD    = 50;                          // depth（ゲームオブジェクト全て上）
    const BAR_W = 270, BAR_H = 14;
    const BAR_X = (W - BAR_W) / 2;
    const BAR_Y = H / 2 + 46;

    const ldBg = this.add.rectangle(W/2, H/2, W, H, 0x000000).setDepth(LD);

    // 「開闢支度中」静止部分（右端をW/2に揃える）
    const ldLabel = this.add.text(W/2 - 1, H/2 - 2, '開闢支度中', {
      fontSize: '22px', fontFamily: '"Yuji Syuku", serif', color: '#ffffff',
    }).setOrigin(1, 0.5).setDepth(LD + 1);

    // 「…」フェード点滅部分（左端をW/2に揃える）
    const ldDots = this.add.text(W/2 + 1, H/2 - 2, '…', {
      fontSize: '22px', fontFamily: '"Yuji Syuku", serif', color: '#ffffff',
    }).setOrigin(0, 0.5).setDepth(LD + 1);
    this._ldDotsTw = this.tweens.add({
      targets: ldDots, alpha: { from: 0.1, to: 1 },
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // バー外枠
    const ldBarBg = this.add.graphics().setDepth(LD + 1);
    ldBarBg.lineStyle(1, 0x555555, 1);
    ldBarBg.strokeRect(BAR_X - 1, BAR_Y - 1, BAR_W + 2, BAR_H + 2);

    // バー塗り（進捗で伸びる）
    const ldBarFill = this.add.graphics().setDepth(LD + 1);

    // 小鬼（TitleSceneで先読み済み。左右反転で右向きに）
    let ldOni = null;
    let ldOniOutlines = [];
    if (this.textures.exists('oni-small')) {
      const nat  = this.textures.get('oni-small').getSourceImage();
      const oH   = 52;
      const oW   = nat?.width > 0 ? Math.round(nat.width * oH / nat.height) : 36;
      const oniX = BAR_X + BAR_W;
      const oniY = BAR_Y - oH / 2 - 3;
      ldOniOutlines = [[-4,0],[4,0],[0,-4],[0,4],[-3,-3],[3,-3],[-3,3],[3,3]].map(([dx, dy]) =>
        this.add.image(oniX + dx, oniY + dy, 'oni-small')
          .setDisplaySize(oW, oH).setFlipX(true)
          .setTintFill(0xffffff).setAlpha(0.8).setDepth(LD + 2)
      );
      ldOni = this.add.image(oniX, oniY, 'oni-small')
        .setDisplaySize(oW, oH)
        .setFlipX(true)   // 立ち絵は左向きのため反転して右向きに
        .setDepth(LD + 3);
    }

    this._loadObjs = [ldBg, ldBarBg, ldBarFill, ldLabel, ldDots, ...ldOniOutlines, ldOni].filter(Boolean);

    // 進捗補間オブジェクト（tweenで滑らかに動かす）
    const progObj = { val: 0 };
    const drawBar = () => {
      const p = Phaser.Math.Clamp(progObj.val, 0, 1);
      ldBarFill.clear();
      ldBarFill.fillStyle(0x55bb55, 1);
      ldBarFill.fillRect(BAR_X, BAR_Y, Math.ceil(BAR_W * p), BAR_H);
      if (ldOni) {
        const oniX = BAR_X + BAR_W * (1 - p);
        ldOni.setX(oniX);
        const offs = [[-4,0],[4,0],[0,-4],[0,4],[-3,-3],[3,-3],[-3,3],[3,3]];
        ldOniOutlines.forEach((o, i) => o.setX(oniX + offs[i][0]));
      }
    };
    drawBar(); // 初期描画

    // progress イベント → tween補間でガクつき抑制
    this.load.on('progress', (value) => {
      this.tweens.killTweensOf(progObj);
      this.tweens.add({ targets: progObj, val: value, duration: 350, ease: 'Power1', onUpdate: drawBar });
    });

    // 全ファイル読み込み完了 → バーを100%まで補間 → 小鬼が左端到達 → フェードアウト
    this.load.on('complete', () => {
      this.tweens.killTweensOf(progObj);
      this.tweens.add({
        targets: progObj, val: 1, duration: 300, ease: 'Power1',
        onUpdate: drawBar,
        onComplete: () => {
          drawBar();
          if (this._ldDotsTw) { this._ldDotsTw.stop(); this._ldDotsTw = null; }
          const objs = this._loadObjs; this._loadObjs = null;
          if (objs?.length) {
            this.tweens.add({
              targets: objs, alpha: 0, duration: 400,
              onComplete: () => objs.forEach(o => o?.destroy?.()),
            });
          }
        },
      });
    });
  }

  create() {
    this.kbHP = this.kbHPMax = 300;
    this.wave = 1;
    this.chapter = 1;
    this.spawned = this.defeated = this.spawnTimer = 0;
    this.dead = this.waveDone = this.bossSpawned = false;
    this.phase = 'battle';
    this.totalExp = 0;
    this.slashDmg = SL_BASE;
    this.combo = 1.0; this.comboTimer = 0;
    this.gauge = 0; this.gaugeReady = false;
    this.unlockedSlots = 3;
    this.slotCharms  = new Array(9).fill(null);
    this.charmTimers = new Array(9).fill(0);
    this.bagCharms   = [];
    this._bagPickMode = -1;
    this._rmVis = false;

    // load save on continue
    const _initType = (this.scene.settings.data || {}).type;
    if (_initType === 'continue') {
      const sv = loadGame();
      if (sv) {
        this.wave          = sv.wave;
        this.kbHP          = sv.kbHP;
        this.kbHPMax       = sv.kbHPMax;
        this.slashDmg      = sv.slashDmg;
        this.totalExp      = sv.totalExp;
        this.unlockedSlots = sv.unlockedSlots != null ? sv.unlockedSlots : 3;
        this.bagCharms     = sv.bagCharms || [];
        this.slotCharms    = sv.slotCharmIds.map(id => id ? ({ ...CHARM_DEFS.find(c => c.id === id) } || null) : null);
        this.charmTimers   = sv.charmTimers;
        this.selectedUltId = sv.selectedUltId || 'kaguya';
      }
    }

    this.chapter = Math.ceil(this.wave / 10);

    this._cpVis = false; this._upgVis = false;
    this.dialogActive = false;
    this._bossSpawnTimerKobuki = null; this._bossSpawnTimerNamed = null;
    this._dlgLines = []; this._dlgIdx = 0; this._dlgOnComplete = null;

    this.charmSelected = false;
    this._lpTimer  = null;
    this._lpActive = false;
    this.paused    = false;
    this.bgmVol    = loadOpts().bgmVol;
    this.bgmOn     = this.bgmVol > 0;
    this.seVol     = loadOpts().seVol;
    this.bgmCurrent = null;
    this.soranaki        = null;
    this._sorPeaceMs     = 0;
    this._sorClearDone   = false;
    this._sorShakeTimer  = null;
    this._sorGlitchTimer = null;
    this.selectedUltId = this.selectedUltId || 'kaguya';
    this._ultLpTimer   = null;
    this._ultMenuVis   = false;

    this._bg();    this._kb();    this._hdr();
    this._grid();  this._slash(); this._bagBuild();
    this._superBtn();
    this._ovBuild();  this._resBuild();
    this._cpBuild();  this._upgBuild();
    this._dlgBuild(); this._rmBuild();
    this._tooltipBuild();
    this._pauseBuild();
    this._ultMenuBuild();
    this._debugBuild();

    this.onis = this.add.group();
    this.sfx  = this.add.graphics().setDepth(10);

    this.input.on('pointerdown', p => { this._lpStart(p); this._tap(p); });
    this.input.on('pointerup',   p => this._lpEnd(p));
    this._hdrUp(); this._gridUp(); this._bagUp();

    // OP曲フェードアウト
    const _opBgm = this.sound.get('bgm_op');
    if (_opBgm) {
      this.tweens.add({ targets: _opBgm, volume: 0, duration: 800, onComplete: () => { _opBgm.stop(); _opBgm.destroy(); } });
    }
    // 通常戦闘BGM開始
    if (this.bgmOn) {
      this.bgmCurrent = this.sound.add('bgm_battle', { loop: true, volume: 0 });
      this.bgmCurrent.play();
      this.tweens.add({ targets: this.bgmCurrent, volume: this.bgmVol, duration: 1000 });
    }

    this.events.on('shutdown', () => { this.sound.stopAll(); });

    // OPENINGシーン：はじめから選択時のみ表示
    if (_initType === 'new' && SCENARIO && SCENARIO.opening) {
      this._dlgShow(SCENARIO.opening, null);
    }
  }

  /* ── update ─────────────────────────────── */
  update(_t, dt) {
    if (this.dead || this.waveDone) return;
    if (this.dialogActive) return;
    if (this.paused) return;

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

    // spawn grunts
    if (this.spawned < ONI_WAVE) {
      this.spawnTimer += dt;
      if (this.spawnTimer >= ONI_INT) { this.spawnTimer -= ONI_INT; this._spawnOni(); }
    }
    // boss/ogre wave
    if (this.spawned >= ONI_WAVE && !this.bossSpawned) {
      this.bossSpawned = true;
      const wic = ((this.wave - 1) % 10) + 1;
      if (wic === 10)    this._spawnBoss();       // ネームドボス
      else if (wic >= 8) this._spawnOgre();       // 大鬼（WAVE8-9）
      // WAVE1-7: bossSpawned=trueのみ、全滅でwaveClear発火
    }

    // oni AI
    for (const oni of [...this.onis.getChildren()]) {
      if (!oni.active) continue;
      // 空無童子：専用移動のみ（攻撃・ノックバック等すべてスキップ）
      if (oni.isSoranaki) {
        oni._baseX -= oni.spd * (dt / 1000);
        this._oniSync(oni);
        continue;
      }
      // stun countdown
      if (oni.stunTimer > 0) oni.stunTimer = Math.max(0, oni.stunTimer - dt);
      // knockback movement
      if (oni.knockTimer > 0) {
        oni.knockTimer = Math.max(0, oni.knockTimer - dt);
        oni.x += oni.spd * 2.5 * (dt / 1000);
      }
      // burn DoT
      if (oni.burnTimer > 0) {
        oni.burnTimer = Math.max(0, oni.burnTimer - dt);
        oni.burnTick += dt;
        if (oni.burnTick >= 500) { oni.burnTick -= 500; this._oniDmg(oni, 8, 'fire', true); }
      }
      // root DoT
      if (oni.rootStacks > 0) {
        oni.rootTick += dt;
        if (oni.rootTick >= 500) { oni.rootTick -= 500; this._oniDmg(oni, oni.rootStacks * 5, 'earth', true); }
      }
      // movement & attack (skip while stunned or knocked back)
      if (oni.stunTimer <= 0 && oni.knockTimer <= 0) {
        if (oni.x - KB_X > ONI_RNG) {
          oni.x -= oni.spd * (dt / 1000);
        } else {
          oni.atkT += dt;
          if (oni.atkT >= ONI_ATK) { oni.atkT -= ONI_ATK; this._kbDmg(oni.dmg); }
        }
      }
      this._oniSync(oni);
      if (oni.x < -60) this._oniRm(oni);
    }

    // 空無童子：平和タイマー加算
    if (this.soranaki?.active && !this._sorClearDone) {
      this._sorPeaceMs += dt;
      if (this._sorPeaceMs >= 180000) this._sorClear();
    }

    // wave clear（bossDeathSequenceによる二重発火防止、WAVE10はボス撃破のみ）
    const _wic = ((this.wave - 1) % 10) + 1;
    if (!this.waveDone && this.spawned >= ONI_WAVE && this.bossSpawned && this.onis.countActive(true) === 0 && _wic !== 10)
      this._waveClear();

    this._hdrUp();
  }

  /* ── BG ─────────────────────────────────── */
  _bg() {
    const skyNat    = this.textures.get('bg_sky').getSourceImage();
    const groundNat = this.textures.get('bg_ground').getSourceImage();
    const scale     = W / skyNat.width;
    this._skyH      = Math.round(skyNat.height * scale);
    const groundH   = Math.round(groundNat.height * scale);

    // レイヤー1：空（奥）
    this.add.image(W/2, this._skyH/2, 'bg_sky').setDisplaySize(W, this._skyH).setDepth(0);
    // レイヤー2：地面（手前）
    this.add.image(W/2, this._skyH + groundH/2, 'bg_ground').setDisplaySize(W, groundH).setDepth(1);

    // 章別カラーオーバーレイ（空全体）
    this.bgSkyOvl = this.add.rectangle(W/2, this._skyH/2, W, this._skyH, 0x000000, 0).setDepth(2);
    // 地面上端グラデーション用 Graphics
    this.bgGndGfx = this.add.graphics().setDepth(3);

    this.add.rectangle(W/2, UI_Y0 + UI_H/2, W, UI_H, 0x0c100c).setDepth(0);
    this.add.rectangle(W/2, UI_Y0 + 1, W, 3, 0x44664a).setDepth(0);
    // PAUSEボタン（戦闘エリア右上）
    const pBtnBg = this.add.graphics().setDepth(20);
    pBtnBg.fillStyle(0x000000, 0.6);
    pBtnBg.fillRoundedRect(355, 0, 30, 30, 4);
    this.add.text(370, 15, '≡', { fontSize:'18px', color:'#ffffff', fontFamily:'serif' }).setOrigin(0.5).setDepth(20);

    this._bgChapterUp();
  }

  _bgChapterUp() {
    const col = BG_CHAPTER_COLORS[Math.min(this.chapter - 1, BG_CHAPTER_COLORS.length - 1)];
    this.bgSkyOvl.setFillStyle(col, BG_OVERLAY_ALPHA);
    this.bgGndGfx.clear();
    for (let i = 0; i < BG_GROUND_GRAD_H; i++) {
      this.bgGndGfx.fillStyle(col, BG_OVERLAY_ALPHA * (1 - i / BG_GROUND_GRAD_H));
      this.bgGndGfx.fillRect(0, this._skyH + i, W, 1);
    }
  }

  /* ── Kibitsu ────────────────────────────── */
  _kb() {
    const h = BATTLE_H * 0.22;   // 72.6px
    const kx = 65, ky = 190;     // 門の左柱寄り・地面上
    this.kbSpr = this.add.image(kx, ky, 'kibitsu').setOrigin(0.5, 0.5).setDepth(3);
    const naturalH = this.kbSpr.height || 1;
    this.kbSpr.setDisplaySize(this.kbSpr.width * h / naturalH, h);
    this.kbSpr.setPosition(kx, ky); // setDisplaySize後に位置を再確定
    const kow = this.kbSpr.displayWidth, koh = this.kbSpr.displayHeight;
    [[-4,0],[4,0],[0,-4],[0,4],[-3,-3],[3,-3],[-3,3],[3,3]].forEach(([dx, dy]) => {
      this.add.image(kx + dx, ky + dy, 'kibitsu')
        .setDisplaySize(kow, koh).setTintFill(0xffffff).setAlpha(0.8).setDepth(2.9);
    });
    // 弾発射基点（スプライト右端）を保存
    this._kbSX = kx + this.kbSpr.displayWidth / 2;
    this._kbSY = ky;
    const barY = ky - h / 2 - 8;
    this.add.rectangle(kx - 27, barY, 54, 9, 0x220000).setOrigin(0, 0.5).setDepth(4);
    this.kbHpBar = this.add.rectangle(kx - 27, barY, 54, 9, 0x22dd55).setOrigin(0, 0.5).setDepth(4);
  }

  /* ── Header ─────────────────────────────── */
  _hdr() {
    this.hpTxt      = this.add.text(14, UI_Y0 + 6, '', { fontSize:'13px', color:'#88aaff', fontFamily:'Arial' }).setDepth(5);
    this.waveTxt    = this.add.text(W/2, UI_Y0 + 14, 'WAVE 1', { fontSize:'21px', color:'#ddcc44', fontFamily:'serif', fontStyle:'bold' }).setOrigin(0.5).setDepth(5);
    this.expTxt     = this.add.text(W - 14, UI_Y0 + 6, '', { fontSize:'13px', color:'#aaee88', fontFamily:'Arial' }).setOrigin(1, 0).setDepth(5);
    this.eneCountTxt = this.add.text(W/2, UI_Y0 + 31, '', { fontSize:'10px', color:'#cc8866', fontFamily:'Arial' }).setOrigin(0.5, 0).setDepth(5);
  }

  /* ── Grid ───────────────────────────────── */
  _grid() {
    this.cBg = []; this.cGfx = []; this.cBdr = []; this.cTxt = []; this.cSub = [];
    for (let i = 0; i < 9; i++) {
      const col = i % 3, row = Math.floor(i / 3);
      const cellX = GRID_X0 + col * CELL_W;
      const cellY = GRID_TOP + row * CELL_H;
      const cx = cellX + CELL_W / 2, cy = cellY + CELL_H / 2;
      const bg  = this.add.rectangle(cx, cy, CELL_W, CELL_H, 0x050810).setDepth(5);
      const gfx = this.add.graphics().setDepth(6);
      const bdr = this.add.rectangle(cx, cy, CELL_W, CELL_H, 0x000000, 0)
                    .setStrokeStyle(2, 0x334433).setDepth(7);
      const txt = this.add.text(cx, cy, '', {
        fontSize:'11px', color:'#fff', fontFamily:'serif',
        align:'center', stroke:'#000', strokeThickness:3
      }).setOrigin(0.5).setDepth(8);
      const sub = this.add.text(cx, cellY + CELL_H - 4, '', {
        fontSize:'9px', color:'#ffffff', fontFamily:'serif',
      }).setOrigin(0.5, 1).setDepth(9);
      this.cBg.push(bg); this.cGfx.push(gfx); this.cBdr.push(bdr); this.cTxt.push(txt); this.cSub.push(sub);
    }
  }

  /* ── Slash area ─────────────────────────── */
  _slash() {
    this.add.rectangle(W/2, SLASH_Y + SLASH_H/2, W - 20, SLASH_H, 0x141422).setStrokeStyle(2, 0x4444aa).setDepth(5);
    this.slLbl   = this.add.text(W/2, SLASH_Y + 18, '⚔  斬撃', { fontSize:'20px', color:'#ffdd88', fontFamily:'serif', fontStyle:'bold' }).setOrigin(0.5).setDepth(6);
    this.cboLbl  = this.add.text(W/2, SLASH_Y + 38, '', { fontSize:'12px', color:'#ffaa44', fontFamily:'Arial' }).setOrigin(0.5).setDepth(6);
    this.add.text(22, SLASH_Y + SLASH_H - 26, '大技ゲージ', { fontSize:'11px', color:'#8877bb', fontFamily:'Arial' }).setDepth(6);
    this.gPct    = this.add.text(W - 22, SLASH_Y + SLASH_H - 26, '0%', { fontSize:'11px', color:'#8877bb', fontFamily:'Arial' }).setOrigin(1, 0).setDepth(6);
    const gy = SLASH_Y + SLASH_H - 11;
    this.add.rectangle(W/2, gy, W - 40, 14, 0x111122).setDepth(6);
    this.gBar    = this.add.rectangle(20, gy, 0, 14, 0x6633cc).setOrigin(0, 0.5).setDepth(7);
  }

  /* ── Bag display ────────────────────────── */
  _bagBuild() {
    const ty = DESC_Y + 8;
    this._bagLbl  = this.add.text(16, ty, '持ち物袋', { fontSize:'12px', color:'#667766', fontFamily:'serif' }).setDepth(5);
    this._bagCnt  = this.add.text(W - 16, ty, '0/3', { fontSize:'12px', color:'#667766', fontFamily:'Arial' }).setOrigin(1, 0).setDepth(5);
    this._bagHint = this.add.text(W/2, ty + 16, '', { fontSize:'10px', color:'#ffcc44', fontFamily:'Arial', align:'center', wordWrap:{width:W-20} }).setOrigin(0.5).setDepth(5);
    this._bagCells = [];
    for (let i = 0; i < 3; i++) {
      const cx = GRID_X0 + i * CELL_W + CELL_W / 2;
      const cy = DESC_Y + 60;
      const bg  = this.add.rectangle(cx, cy, CELL_W - 6, 56, 0x050810).setStrokeStyle(1, 0x334433).setDepth(5);
      const txt = this.add.text(cx, cy, '', { fontSize:'11px', color:'#334433', fontFamily:'serif', align:'center', stroke:'#000', strokeThickness:2 }).setOrigin(0.5).setDepth(6);
      this._bagCells.push({ bg, txt });
    }
  }

  _bagUp() {
    this._bagCnt.setText(`${this.bagCharms.length}/3`);
    if (this._bagPickMode >= 0) {
      this._bagHint.setText('配置先のマス（空き）をタップ　同じ袋をタップでキャンセル');
    } else {
      this._bagHint.setText(this.bagCharms.length > 0 ? '袋の呪符をタップ → 配置先のマスを選択' : '');
    }
    for (let i = 0; i < 3; i++) {
      const cell = this._bagCells[i];
      const c = this.bagCharms[i];
      const selected = (this._bagPickMode === i);
      if (c) {
        const an = ATTR_NAMES[c.attr] || '－';
        cell.txt.setText(`[${an}]\n${c.name}`)
          .setStyle({ color: selected ? '#ffcc44' : '#aaccaa', fontSize:'11px', align:'center', stroke:'#000', strokeThickness:2 });
        cell.bg.setStrokeStyle(2, selected ? 0xffcc44 : 0x336633);
      } else {
        cell.txt.setText('空き')
          .setStyle({ color:'#334433', fontSize:'11px', align:'center', stroke:'#000', strokeThickness:2 });
        cell.bg.setStrokeStyle(1, 0x334433);
      }
    }
  }

  /* ── Super button (battle area BR) ─────── */
  _superBtn() {
    this.sBtnBg  = this.add.rectangle(SB_X, SB_Y, 120, 40, 0x330011).setStrokeStyle(2, 0xff3388).setAlpha(0).setDepth(8);
    this.sBtnTxt = this.add.text(SB_X, SB_Y, '★ 香山颪', { fontSize:'14px', color:'#ff88cc', fontFamily:'serif', fontStyle:'bold', stroke:'#000', strokeThickness:3 }).setOrigin(0.5).setAlpha(0).setDepth(9);
  }

  _sbUpdate() {
    const ult = ULTIMATE_DATA.find(u => u.id === this.selectedUltId);
    if (ult) this.sBtnTxt.setText(`★ ${ult.name}`);
  }

  /* ── Battle overlay ─────────────────────── */
  _ovBuild() {
    this.ovBg    = this.add.rectangle(W/2, BATTLE_H/2, W, BATTLE_H, 0x000).setAlpha(0).setDepth(12);
    this.ovTitle = this.add.text(W/2, BATTLE_H/2 - 30, '', { fontSize:'46px', fontFamily:'serif', fontStyle:'bold', stroke:'#000', strokeThickness:8 }).setOrigin(0.5).setAlpha(0).setDepth(13);
    this.ovSub   = this.add.text(W/2, BATTLE_H/2 + 40, '', { fontSize:'19px', color:'#eee', fontFamily:'Arial' }).setOrigin(0.5).setAlpha(0).setDepth(13);
  }

  /* ── Result screen ──────────────────────── */
  _resBuild() {
    const b = UI_Y0;
    this.resBg     = this.add.rectangle(W/2, b + UI_H/2, W, UI_H, 0x050a05).setAlpha(0).setDepth(14);
    this.resTtl    = this.add.text(W/2, b + 22, '', { fontSize:'18px', color:'#ddcc44', fontFamily:'serif', fontStyle:'bold' }).setOrigin(0.5).setAlpha(0).setDepth(15);
    this.resExp    = this.add.text(W/2, b + 50, '', { fontSize:'13px', color:'#aaeebb', fontFamily:'Arial' }).setOrigin(0.5).setAlpha(0).setDepth(15);
    this.resBagTxt = this.add.text(W/2, b + 72, '', { fontSize:'11px', color:'#aa5533', fontFamily:'Arial' }).setOrigin(0.5).setAlpha(0).setDepth(15);
    this.resBtns = ['呪符を選ぶ', 'キビツを強化する', '次のWAVEへ'].map((lbl, i) => {
      const by = b + 96 + i * 76;
      return {
        bg:  this.add.rectangle(W/2, by, W - 40, 60, 0x0f1f0f).setStrokeStyle(2, 0x44aa44).setAlpha(0).setDepth(15),
        txt: this.add.text(W/2, by, lbl, { fontSize:'18px', color:'#cceecc', fontFamily:'serif' }).setOrigin(0.5).setAlpha(0).setDepth(16),
        i
      };
    });
    const healY = b + 96 + 3 * 76;
    this.resHealBg  = this.add.rectangle(W/2, healY, W - 40, 60, 0x0a1a2a).setStrokeStyle(2, 0x4488aa).setAlpha(0).setDepth(15);
    this.resHealTxt = this.add.text(W/2, healY, 'EXPで回復', { fontSize:'18px', color:'#88ddff', fontFamily:'serif' }).setOrigin(0.5).setAlpha(0).setDepth(16);
  }

  /* ── Charm pick screen ──────────────────── */
  _cpBuild() {
    const b = UI_Y0;
    this.cpBg      = this.add.rectangle(W/2, b + UI_H/2, W, UI_H, 0x030508).setAlpha(0).setDepth(17);
    this.cpTtl     = this.add.text(W/2, b + 18, '', { fontSize:'16px', color:'#ffdd88', fontFamily:'serif', fontStyle:'bold' }).setOrigin(0.5).setAlpha(0).setDepth(18);
    this.cpFullMsg = this.add.text(W/2, b + UI_H/2, '持ち物袋が満杯です', { fontSize:'15px', color:'#aa5533', fontFamily:'serif' }).setOrigin(0.5).setAlpha(0).setDepth(19);
    this.cpBtns = [];
    for (let i = 0; i < 3; i++) {
      const by = b + 70 + i * 110;
      this.cpBtns.push({
        bg: this.add.rectangle(W/2, by, W - 36, 96, 0x0a1520).setStrokeStyle(2, 0x3366aa).setAlpha(0).setDepth(18),
        nm: this.add.text(W/2, by - 22, '', { fontSize:'16px', color:'#88ccff', fontFamily:'serif', fontStyle:'bold' }).setOrigin(0.5).setAlpha(0).setDepth(19),
        ds: this.add.text(W/2, by + 8,  '', { fontSize:'12px', color:'#aabbcc', fontFamily:'Arial', align:'center' }).setOrigin(0.5).setAlpha(0).setDepth(19),
        charm: null, bagIdx: -1
      });
    }
    this.cpCnl = this.add.text(W/2, b + 420, '戻る', { fontSize:'14px', color:'#556655', fontFamily:'Arial' }).setOrigin(0.5).setAlpha(0).setDepth(19);
  }

  /* ── Upgrade screen ─────────────────────── */
  _upgBuild() {
    const b = UI_Y0;
    this.upgBg  = this.add.rectangle(W/2, b + UI_H/2, W, UI_H, 0x050308).setAlpha(0).setDepth(17);
    this.upgTtl = this.add.text(W/2, b + 18, 'キビツを強化する', { fontSize:'17px', color:'#ffcc88', fontFamily:'serif', fontStyle:'bold' }).setOrigin(0.5).setAlpha(0).setDepth(18);
    this.upgExp = this.add.text(W/2, b + 44, '', { fontSize:'13px', color:'#aaeeaa', fontFamily:'Arial' }).setOrigin(0.5).setAlpha(0).setDepth(18);
    this.upgBtns = [
      { label:'HP強化',       key:'hp',    cost:20, desc:'+30 最大HP' },
      { label:'斬撃強化',     key:'slash',  cost:25, desc:'基本威力 +2' },
      { label:'詠唱短縮',     key:'cast',   cost:20, desc:'チャージ速度 +15%' },
      { label:'スロット解放', key:'slot',   cost:30, desc:'呪符スロット +1（上限9）' },
    ].map((item, i) => {
      const by = b + 80 + i * 86;
      return {
        bg:  this.add.rectangle(W/2, by, W - 40, 70, 0x100a1a).setStrokeStyle(2, 0x664488).setAlpha(0).setDepth(18),
        lbl: this.add.text(W/2, by - 12, '', { fontSize:'15px', color:'#ccaaff', fontFamily:'serif' }).setOrigin(0.5).setAlpha(0).setDepth(19),
        ds:  this.add.text(W/2, by + 12, '', { fontSize:'12px', color:'#998899', fontFamily:'Arial' }).setOrigin(0.5).setAlpha(0).setDepth(19),
        item
      };
    });
    this.upgCnl = this.add.text(W/2, b + 430, '戻る', { fontSize:'14px', color:'#665566', fontFamily:'Arial' }).setOrigin(0.5).setAlpha(0).setDepth(19);
  }

  /* ── Input ──────────────────────────────── */
  _tap(ptr) {
    const { x, y } = ptr;
    if (this._lpActive) return;
    if (this._introLock) return;
    // デバッグボタン
    if (DEBUG) {
      if (x >= 4 && x <= 80 && y >= 3 && y <= 24) { this._dbgWaveSkip(); return; }
      if (x >= 4 && x <= 80 && y >= 27 && y <= 48) { this._dbgJumpToggle(); return; }
      if (this._dbgJumpVisible) {
        if (Math.abs(x - W/2) < 60 && Math.abs(y - 308) < 16) { this._dbgJumpUiHide(); return; }
        for (let ch = 1; ch <= 5; ch++) {
          if (Math.abs(x - W/2) < 100 && Math.abs(y - (56 + ch * 44)) < 17) { this._dbgJump(ch); return; }
        }
        return;
      }
    }
    // PAUSEボタン（戦闘エリア右上 355-385, 0-30）
    if (x >= 355 && x <= 385 && y >= 0 && y <= 30) {
      if (!this.paused && !this.dialogActive) this._pauseOpen();
      return;
    }
    if (this._ultMenuVis) { this._ultMenuTap(x, y); return; }
    if (this.paused && y < BATTLE_H) {
      if (this.dialogActive) return;
      this._pauseTap(x, y); return;
    }
    if (this.dialogActive) { this._dlgNext(); return; }
    if (this.dead) { this.scene.start('MainScene', { type:'new' }); return; }
    if (this._rmVis)  { this._rmTap(x, y);  return; }
    if (this._upgVis) { this._upgTap(x, y); return; }
    if (this._cpVis)  { this._cpTap(x, y);  return; }
    if (this.phase === 'result') { this._resTap(x, y); return; }

    if (y < BATTLE_H) return;

    // slash area
    if (y >= SLASH_Y && y < SLASH_Y + SLASH_H) {
      if (this.paused) return;
      if (this._bagPickMode >= 0) { this._bagPickMode = -1; this._bagUp(); return; }
      this._doSlash(); return;
    }

    // bag area
    const BAG_SLOT_Y = DESC_Y + 52;
    if (y >= DESC_Y + 22 && y < DESC_Y + 88) {
      const col = Math.floor((x - GRID_X0) / CELL_W);
      if (col >= 0 && col < 3) {
        if (this._bagPickMode === col) {
          this._bagPickMode = -1; this._bagUp(); // cancel
        } else if (this.bagCharms[col]) {
          this._bagPickMode = col; this._bagUp(); // select
        }
      }
      return;
    }

    // grid
    if (y >= GRID_TOP && y < GRID_BOT) {
      const col = Math.floor((x - GRID_X0) / CELL_W);
      const row = Math.floor((y - GRID_TOP) / CELL_H);
      if (col >= 0 && col < 3 && row >= 0 && row < 3) {
        const idx = row * 3 + col;
        if (idx >= this.unlockedSlots) return;
        if (this._bagPickMode >= 0) {
          // bagPickMode: place charm into this slot (only empty allowed)
          if (!this.slotCharms[idx]) {
            const c = this.bagCharms.splice(this._bagPickMode, 1)[0];
            this.slotCharms[idx] = { ...c };
            this.charmTimers[idx] = 0;
            this._bagPickMode = -1;
            this._bagUp(); this._gridUp();
          }
        } else if (this.slotCharms[idx]) {
          // 外す操作は長押しツールチップ経由のみ
        } else if (this.bagCharms.length > 0) {
          this._cpOpen('place', idx); // empty → pick from bag modal
        }
      }
    }
  }

  /* ── Charm pick ─────────────────────────── */
  _cpOpen(mode, slot) {
    this._cpMode = mode; this._cpSlot = slot; this._cpVis = true;
    this.cpBg.setAlpha(0.97); this.cpTtl.setAlpha(1); this.cpCnl.setAlpha(1);
    this.cpFullMsg.setAlpha(0);

    if (mode === 'place') {
      // 袋にある呪符を表示
      this.cpTtl.setText('袋から呪符を配置する');
      const choices = this.bagCharms;
      for (let i = 0; i < 3; i++) {
        const btn = this.cpBtns[i], c = choices[i];
        if (c) {
          btn.charm = c; btn.bagIdx = i;
          btn.bg.setAlpha(1).setStrokeStyle(2, 0x3366aa);
          btn.nm.setText(`[${ATTR_NAMES[c.attr] || '－'}] ${c.name}`).setStyle({ color:'#88ccff', fontSize:'16px' }).setAlpha(1);
          btn.ds.setText(`${c.desc}  [${(c.chargeMs/1000).toFixed(1)}s]`).setAlpha(1);
        } else {
          btn.charm = null; btn.bagIdx = -1;
          btn.bg.setAlpha(0); btn.nm.setAlpha(0); btn.ds.setAlpha(0);
        }
      }
    } else {
      // WAVEクリア報酬：CHARM_DEFSからランダム3択
      this.cpTtl.setText('呪符を選ぶ（3択）');
      const bagFull = this.bagCharms.length >= 3;
      if (bagFull) {
        this.cpFullMsg.setAlpha(1);
        for (const btn of this.cpBtns) {
          btn.charm = null; btn.bg.setAlpha(0.3).setStrokeStyle(1, 0x333333);
          btn.nm.setAlpha(0); btn.ds.setAlpha(0);
        }
      } else {
        const choices = [...CHARM_DEFS].sort(() => Math.random() - 0.5).slice(0, 3);
        for (let i = 0; i < 3; i++) {
          const btn = this.cpBtns[i], c = choices[i];
          btn.charm = c; btn.bagIdx = -1;
          btn.bg.setAlpha(1).setStrokeStyle(2, 0x3366aa);
          btn.nm.setText(`[${ATTR_NAMES[c.attr] || '－'}] ${c.name}`).setStyle({ color:'#88ccff', fontSize:'16px' }).setAlpha(1);
          btn.ds.setText(`${c.desc}  [${(c.chargeMs/1000).toFixed(1)}s]`).setAlpha(1);
        }
      }
    }
  }

  _cpTap(x, y) {
    const b = UI_Y0;
    if (Math.abs(y - (b + 420)) < 22) { this._cpClose(); return; }
    for (let i = 0; i < 3; i++) {
      const by = b + 70 + i * 110;
      if (Math.abs(y - by) < 52 && this.cpBtns[i].charm) {
        const c = this.cpBtns[i].charm;
        if (this._cpMode === 'place') {
          // 袋から取り出してスロットに配置
          this.bagCharms.splice(this.cpBtns[i].bagIdx, 1);
          this.slotCharms[this._cpSlot] = { ...c };
          this.charmTimers[this._cpSlot] = 0;
          this._bagUp(); this._gridUp();
        } else {
          // WAVEクリア報酬：袋に追加（重複選択防止）
          if (this.charmSelected) return;
          if (this.bagCharms.length < 3) this.bagCharms.push({ ...c });
          this.charmSelected = true;
          this._bagUp();
        }
        this._cpClose(); return;
      }
    }
  }

  _cpClose() {
    this._cpVis = false;
    this.cpBg.setAlpha(0); this.cpTtl.setAlpha(0); this.cpCnl.setAlpha(0);
    this.cpFullMsg.setAlpha(0);
    for (const b of this.cpBtns) { b.bg.setAlpha(0); b.nm.setAlpha(0); b.ds.setAlpha(0); }
  }

  /* ── Result ─────────────────────────────── */
  _resTap(x, y) {
    // EXPで回復ボタン
    const healY = UI_Y0 + 96 + 3 * 76;
    if (Math.abs(y - healY) < 32) {
      const cost = this.kbHPMax;
      if (this.totalExp >= cost) {
        this.totalExp -= cost;
        this.kbHP = this.kbHPMax;
        const r = 1;
        this.kbHpBar.setDisplaySize(54 * r, 9).setFillStyle(0x22dd55);
        this.resExp.setText(`EXP: ${this.totalExp}  /  持ち物袋: ${this.bagCharms.length}/3`);
        this._resHealRefresh();
      }
      return;
    }
    for (const btn of this.resBtns) {
      const by = UI_Y0 + 96 + btn.i * 76;
      if (Math.abs(y - by) < 32) {
        if (btn.i === 0) {
          if (this.bagCharms.length < 3) this._cpOpen('result', -1);
        } else if (btn.i === 1) {
          this._upgOpen();
        } else {
          this._resClose(); this._nextWave();
        }
        return;
      }
    }
  }

  _resOpen() {
    this.phase = 'result';
    this.charmSelected = false;
    const bagFull = this.bagCharms.length >= 3;
    this.resBg.setAlpha(0.97);
    this.resTtl.setText(`WAVE ${this.wave} クリア！`).setAlpha(1);
    this.resExp.setText(`EXP: ${this.totalExp}  /  持ち物袋: ${this.bagCharms.length}/3`).setAlpha(1);
    this.resBagTxt.setText(bagFull ? '持ち物袋が満杯です' : '').setAlpha(bagFull ? 1 : 0);
    for (const b of this.resBtns) {
      b.bg.setAlpha(1);
      if (b.i === 0 && bagFull) {
        b.txt.setText('呪符を選ぶ（袋が満杯）').setStyle({ color:'#554444', fontSize:'16px', fontFamily:'serif' }).setAlpha(0.5);
        b.bg.setStrokeStyle(1, 0x334433);
      } else {
        b.txt.setText(b.i === 0 ? '呪符を選ぶ' : b.i === 1 ? 'キビツを強化する' : '次のWAVEへ')
          .setStyle({ color:'#cceecc', fontSize:'18px', fontFamily:'serif' }).setAlpha(1);
        b.bg.setStrokeStyle(2, 0x44aa44);
      }
    }
    this._resHealRefresh();
  }

  _resHealRefresh() {
    const cost = this.kbHPMax;
    const canHeal = this.totalExp >= cost;
    this.resHealBg.setAlpha(1).setStrokeStyle(2, canHeal ? 0x4488aa : 0x334444);
    this.resHealTxt
      .setText(`EXPで回復  [${cost} EXP]`)
      .setStyle({ color: canHeal ? '#88ddff' : '#446655', fontSize:'18px', fontFamily:'serif' })
      .setAlpha(canHeal ? 1 : 0.5);
  }

  _resClose() {
    this.phase = 'battle';
    this.resBg.setAlpha(0); this.resTtl.setAlpha(0); this.resExp.setAlpha(0);
    this.resBagTxt.setAlpha(0);
    for (const b of this.resBtns) { b.bg.setAlpha(0); b.txt.setAlpha(0); }
    this.resHealBg.setAlpha(0); this.resHealTxt.setAlpha(0);
  }

  /* ── Upgrade ────────────────────────────── */
  _upgOpen() {
    this._upgVis = true;
    this.upgBg.setAlpha(0.97); this.upgTtl.setAlpha(1); this.upgCnl.setAlpha(1);
    this._upgRefresh();
  }

  _upgRefresh() {
    this.upgExp.setText(`所持EXP: ${this.totalExp}  /  スロット: ${this.unlockedSlots}/9`).setAlpha(1);
    for (const b of this.upgBtns) {
      const disabled = b.item.key === 'slot' && this.unlockedSlots >= 9;
      b.bg.setAlpha(1).setStrokeStyle(2, disabled ? 0x333333 : 0x664488);
      const costLabel = disabled ? '（上限到達）' : `[${b.item.cost} EXP]`;
      b.lbl.setText(`${b.item.label}  ${costLabel}`)
        .setStyle({ color: disabled ? '#555555' : '#ccaaff', fontSize:'15px', fontFamily:'serif' }).setAlpha(1);
      b.ds.setText(b.item.desc).setAlpha(1);
    }
  }

  _upgTap(x, y) {
    const b = UI_Y0;
    if (Math.abs(y - (b + 430)) < 22) { this._upgClose(); return; }
    for (let i = 0; i < this.upgBtns.length; i++) {
      const by = b + 80 + i * 86;
      if (Math.abs(y - by) < 38) {
        const { cost, key } = this.upgBtns[i].item;
        if (key === 'slot' && this.unlockedSlots >= 9) return;
        if (this.totalExp >= cost) { this.totalExp -= cost; this._upgApply(key); this._upgRefresh(); }
        return;
      }
    }
  }

  _upgApply(key) {
    if      (key === 'hp')    { this.kbHPMax += 30; this.kbHP = Math.min(this.kbHP + 30, this.kbHPMax); }
    else if (key === 'slash') { this.slashDmg += 2; }
    else if (key === 'cast')  {
      for (const c of [...this.bagCharms, ...this.slotCharms.filter(Boolean)]) {
        c.chargeMs = Math.max(400, Math.round(c.chargeMs * 0.85));
      }
    }
    else if (key === 'slot')  { this.unlockedSlots = Math.min(9, this.unlockedSlots + 1); this._gridUp(); }
  }

  _upgClose() {
    this._upgVis = false;
    this.upgBg.setAlpha(0); this.upgTtl.setAlpha(0); this.upgExp.setAlpha(0); this.upgCnl.setAlpha(0);
    for (const b of this.upgBtns) { b.bg.setAlpha(0); b.lbl.setAlpha(0); b.ds.setAlpha(0); }
  }

  /* ── Slash ──────────────────────────────── */
  _doSlash() {
    const list = this.onis.getChildren().filter(o => o.active);
    if (!list.length) return;
    this._sorActionTaken();
    const t = list.reduce((a, b) => a.x < b.x ? a : b);
    const dmg = Math.round(this.slashDmg * this.combo);
    this._oniDmg(t, dmg);
    this._slashFx(t.x, t.y);
    if (this.combo < COMBO_MAX) this.combo = Math.min(COMBO_MAX, Math.round((this.combo + COMBO_STEP) * 10) / 10);
    this.comboTimer = 0;
    this.gauge = Math.min(GAUGE_MAX, this.gauge + GAUGE_HIT);
    this._gaugeUp();
    this._slashLbl();
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
      this.sBtnBg.setAlpha(1); this.sBtnTxt.setAlpha(1);
      this.tweens.add({ targets: [this.sBtnBg, this.sBtnTxt], alpha: { from:1, to:0.35 }, yoyo:true, repeat:-1, duration:450 });
    } else if (pct < 1.0 && this.gaugeReady) {
      this.gaugeReady = false;
      this.tweens.killTweensOf([this.sBtnBg, this.sBtnTxt]);
      this.sBtnBg.setAlpha(0); this.sBtnTxt.setAlpha(0);
    }
  }

  /* ── Ultimate ───────────────────────────── */
  _ultFire() {
    this._sorActionTaken();
    this.gauge = 0; this._gaugeUp();
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
      // グロー層（水色）
      g.lineStyle(14, 0xAADDFF, 0.35);
      g.beginPath(); g.arc(0, 0, 40, -Math.PI * 0.75, Math.PI * 0.35, false); g.strokePath();
      // 本体（白）
      g.lineStyle(9, 0xFFFFFF, 0.95);
      g.beginPath(); g.arc(0, 0, 40, -Math.PI * 0.75, Math.PI * 0.35, false); g.strokePath();
    };

    // 残像3個（stagger追従）
    for (let i = 1; i <= 3; i++) {
      this.time.delayedCall(i * 38, () => {
        const ghost = this.add.graphics().setDepth(7);
        drawCrescent(ghost);
        ghost.x = sx; ghost.y = sy;
        ghost.scaleX = 0;
        this.tweens.add({
          targets: ghost, scaleX: 1, duration: 60, ease: 'Power1',
          onComplete: () => {
            this.tweens.add({ targets: ghost, x: W + 100, rotation: 0.3, alpha: 0, duration: 280, ease: 'Power3',
              onComplete: () => ghost.destroy() });
          }
        });
      });
    }

    // 本体
    const g = this.add.graphics().setDepth(8);
    drawCrescent(g);
    g.x = sx; g.y = sy; g.scaleX = 0;
    this.tweens.add({
      targets: g, scaleX: 1, duration: 70, ease: 'Back.Out',
      onComplete: () => {
        this.tweens.add({ targets: g, x: W + 100, rotation: 0.3, duration: 280, ease: 'Power3',
          onComplete: () => g.destroy() });
      }
    });

    // 射線上（y±60）の全敵を貫通
    for (const oni of this.onis.getChildren().filter(o => o.active)) {
      if (Math.abs(oni.y - sy) < 60) this._oniDmg(oni, ult.dmg, 'wind');
    }
  }

  _ultHyosen(ult) {
    // 紫暗色オーバーレイがふわっと広がってフェード
    const g = this.add.graphics().setDepth(8);
    g.fillStyle(0x220044, 0.7); g.fillRect(0, 0, W, BATTLE_H);
    g.setAlpha(0);
    this.tweens.add({ targets: g, alpha: 1, duration: 400, yoyo: true, hold: 300,
      onComplete: () => g.destroy() });
    for (const oni of this.onis.getChildren().filter(o => o.active)) {
      this._oniDmg(oni, ult.dmg, 'water');
      applyStatus(oni, ult.status, ult.statusDuration, this);
    }
  }

  _ultHiroto(ult) {
    // 画面上部から巨大な光柱が降り注ぐ（白・半透明・幅390px）
    const col = this.add.rectangle(W / 2, 0, W, BATTLE_H, 0xffffff, 0.5)
      .setDepth(8).setOrigin(0.5, 0).setScale(1, 0);
    this.tweens.add({ targets: col, scaleY: 1, duration: 280, ease: 'Power2',
      onComplete: () => this.tweens.add({ targets: col, alpha: 0, duration: 400,
        onComplete: () => col.destroy() }) });
    for (const oni of this.onis.getChildren().filter(o => o.active)) {
      this._oniDmg(oni, ult.dmg, 'fire');
    }
  }

  /* ── Ultimate menu (長押し選択) ──────────── */
  _ultMenuBuild() {
    this._ultMenuItems = ULTIMATE_DATA.map(u => ({
      id:  u.id,
      bg:  this.add.rectangle(0, 0, 150, 40, 0x111122).setStrokeStyle(1, 0x6644aa).setAlpha(0).setDepth(28),
      nm:  this.add.text(0, 0, u.name, { fontSize:'14px', color:'#ccaaff', fontFamily:'serif',
             fontStyle:'bold', stroke:'#000', strokeThickness:2 }).setOrigin(0.5, 0.5).setAlpha(0).setDepth(29),
      sub: this.add.text(0, 0, u.yomi, { fontSize:'9px',  color:'#887799', fontFamily:'serif',
             stroke:'#000', strokeThickness:1 }).setOrigin(0.5, 0.5).setAlpha(0).setDepth(29),
    }));
  }

  _ultMenuOpen() {
    const available = ULTIMATE_DATA.filter(u => this.chapter >= u.unlockChapter);
    if (available.length < 2) return;
    this._ultMenuVis = true;
    available.forEach((u, i) => {
      const item = this._ultMenuItems.find(m => m.id === u.id);
      const iy = SB_Y - 52 - i * 48;
      const sel = u.id === this.selectedUltId;
      item.bg.setPosition(SB_X, iy).setAlpha(1).setStrokeStyle(sel ? 2 : 1, sel ? 0xffcc44 : 0x6644aa);
      item.nm.setPosition(SB_X, iy - 7).setAlpha(1);
      item.sub.setPosition(SB_X, iy + 11).setAlpha(1);
    });
  }

  _ultMenuClose() {
    this._ultMenuVis = false;
    for (const item of this._ultMenuItems) {
      item.bg.setAlpha(0); item.nm.setAlpha(0); item.sub.setAlpha(0);
    }
  }

  _ultMenuTap(x, y) {
    const available = ULTIMATE_DATA.filter(u => this.chapter >= u.unlockChapter);
    for (let i = 0; i < available.length; i++) {
      const iy = SB_Y - 52 - i * 48;
      if (Math.abs(x - SB_X) < 78 && Math.abs(y - iy) < 22) {
        this.selectedUltId = available[i].id;
        this._sbUpdate();
        this._ultMenuClose();
        return;
      }
    }
    this._ultMenuClose();
  }

  /* ── Charm auto-fire ────────────────────── */
  _useCharm(idx) {
    const c = this.slotCharms[idx];
    this.charmTimers[idx] = 0; this._cellUp(idx);
    this._sorActionTaken();
    fireCharm(c.id, this);
  }

  _beamFx(ang) {
    const sx = this._kbSX, sy = this._kbSY;
    const g = this.add.graphics().setDepth(8);
    g.lineStyle(5, 0xffff66, 0.9);
    g.beginPath(); g.moveTo(sx, sy);
    g.lineTo(sx + Math.cos(ang) * 500, sy + Math.sin(ang) * 500);
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
      const rx = Phaser.Math.Between(80, W - 30);
      const ry = Phaser.Math.Between(30, BATTLE_H - 40);
      const g = this.add.graphics().setDepth(8).setAlpha(0);
      g.fillStyle(0x886644, 1); g.fillRect(-12, -12, 24, 24);
      g.x = rx; g.y = 0;
      this.tweens.add({ targets: g, y: ry, alpha: 1, duration: 300, delay: i * 80,
        onComplete: () => this.tweens.add({ targets: g, alpha: 0, duration: 250, onComplete: () => g.destroy() }) });
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
    const sx = this._kbSX, sy = this._kbSY;
    const g = this.add.graphics().setDepth(8);
    g.lineStyle(4, 0x99ffaa, 0.85);
    for (let i = -2; i <= 2; i++) {
      const a = base + i * 0.12;
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(sx + Math.cos(a) * 340, sy + Math.sin(a) * 340);
      g.strokePath();
    }
    this.tweens.add({ targets: g, alpha: 0, duration: 250, onComplete: () => g.destroy() });
  }

  _blowFx() {
    const sx = this._kbSX;
    const g = this.add.graphics().setDepth(8);
    g.lineStyle(6, 0xccffee, 0.8);
    g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx, BATTLE_H);
    g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, scaleX: 3, duration: 300, onComplete: () => g.destroy() });
  }

  _mistFx() {
    const g = this.add.graphics().setDepth(2).setAlpha(0);
    g.fillStyle(0x4499ff, 0.2); g.fillRect(0, 0, W, BATTLE_H);
    this.tweens.add({ targets: g, alpha: 1, duration: 400, yoyo: true, repeat: 2,
      onComplete: () => g.destroy() });
  }

  /* ── Oni ────────────────────────────────── */
  _spawnOni(count = true) {
    if (count) this.spawned++;
    const wic   = ((this.wave - 1) % 10) + 1;
    const named = wic >= 5 && wic <= 7 && count && (this.spawned % 3 === 0);
    const hp    = named ? NM_HP : ONI_HP;
    const col   = named ? 0x661199 : 0xaa1a1a;
    const stk   = named ? 0xcc88ff : 0xff6644;
    const spd   = named ? NM_SPD : ONI_SPD;
    const dmg   = named ? NM_DMG : ONI_DMG;
    const bw    = named ? 52 : ONI_BW;
    const name  = named ? '中鬼' : '小鬼';
    const imgKey = named ? 'oni-mid' : 'oni-small';
    const attrPool = ['fire', 'water', 'earth', 'wind'];
    const attrChance = Math.min(1, (this.wave - 2) * 0.25);
    const attr = (this.wave >= 3 && Math.random() < attrChance) ? attrPool[Phaser.Math.Between(0, 3)] : 'none';
    const sy = Phaser.Math.Between(160, 290);
    this._makeOni(W, sy, named ? 48 : ONI_W, named ? 64 : ONI_H, col, stk, name, named ? '13px' : '20px', named ? '#ddaaff' : '#ffbbbb', hp, spd, dmg, bw, named ? EXP_N : EXP_G, false, imgKey, attr);
  }

  _spawnOgre() {
    // WAVE8-9：大鬼（isBoss=false）+ 小鬼の無限湧き、全滅でWAVEクリア
    const sy = Phaser.Math.Between(160, 290);
    this._makeOni(W, sy, 52, 78, 0x441100, 0xff8833, '【大鬼】', '13px', '#ffcc88', OGRE_HP, OGRE_SPD, OGRE_DMG, 66, 60, false, 'oni-large', 'none');
    const ogre = this.onis.getLast(true);
    ogre.isOgre = true;
    this._bossSpawnTimerKobuki = this.time.addEvent({
      delay: 1500, loop: true,
      callback: () => {
        if (!this.waveDone && this.onis.countActive(true) < 8) this._spawnBossGrunt(false);
      }
    });
  }

  _spawnBoss() {
    // ボス登場BGM切り替え
    if (this.bgmOn && this.bgmCurrent) {
      const bossBgmKey = this.chapter === 5 ? 'bgm_boss5' : 'bgm_shurai';
      const fadeMs     = this.chapter === 5 ? 1500 : 1000;
      const prev = this.bgmCurrent;
      this.bgmCurrent = null;
      this.tweens.add({ targets: prev, volume: 0, duration: fadeMs, onComplete: () => {
        prev.stop();
        this.bgmCurrent = this.sound.add(bossBgmKey, { loop: true, volume: 0 });
        this.bgmCurrent.play();
        this.tweens.add({ targets: this.bgmCurrent, volume: this.bgmVol, duration: fadeMs });
      }});
    }
    // 暗転ロック演出 → 完了後にボス登場台詞＆実体スポーン
    this._bossIntroLock(() => {
      if (this.wave % 10 === 0 && SCENARIO) {
        const boss_scene = this.chapter === 5
          ? SCENARIO.ending?.soranaki
          : SCENARIO.chapters[this.chapter - 1]?.boss_scene;
        if (boss_scene?.length) {
          this._dlgShow(boss_scene, () => this._bossSpawnBody());
          return;
        }
      }
      this._bossSpawnBody();
    });
  }

  _bossIntroLock(onDone) {
    const warnBody = this.chapter === 5
      ? 'とてつもなく\n恐ろしい鬼の\n気配がする……'
      : '恐ろしい鬼の\n気配がする……';

    this.dialogActive = true;
    this._introLock = true;
    const overlay = this.add.rectangle(W/2, BATTLE_H/2, W, BATTLE_H, 0x000000, 0).setDepth(50);

    const warnTxt = this.add.text(W/2, BATTLE_H/2 - 20, warnBody, {
      fontSize: '22px', color: '#ff3333', fontFamily: 'serif', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 8, align: 'center', lineSpacing: 8,
    }).setOrigin(0.5).setAlpha(0).setDepth(51);

    this.tweens.add({ targets: overlay, alpha: 0.88, duration: 500, onComplete: () => {
      // 警告テキスト出現
      this.tweens.add({ targets: warnTxt, alpha: 1, duration: 200 });

      // 点滅：赤→黄を200ms交互
      let flashRed = true;
      const flashTimer = this.time.addEvent({
        delay: 200, loop: true,
        callback: () => { flashRed = !flashRed; warnTxt.setColor(flashRed ? '#ff3333' : '#ffcc00'); },
      });

      // 振動：80ms毎にランダムX揺れ
      const shakeTimer = this.time.addEvent({
        delay: 80, loop: true,
        callback: () => { warnTxt.setX(W/2 + (Math.random() - 0.5) * 14); },
      });

      // 1500ms後：警告→フェードアウト→ダイアログ接続
      this.time.delayedCall(1500, () => {
        flashTimer.remove(); shakeTimer.remove(); warnTxt.setX(W/2);
        this.tweens.add({ targets: [overlay, warnTxt], alpha: 0, duration: 500, onComplete: () => {
          overlay.destroy(); warnTxt.destroy();
          this._introLock = false;
          this.dialogActive = false;
          if (onDone) onDone();
        }});
      });
    }});
  }

  _bossSpawnBody() {
    // 五章：空無童子（特殊ボス）
    if (this.chapter === 5) { this._spawnSoranaki(); return; }

    const chapIdx = Math.min(this.chapter - 1, BOSS_NAMES_BY_CHAPTER.length - 1);
    const name = BOSS_NAMES_BY_CHAPTER[chapIdx];
    const BOSS_IMGS = ['oni-ura', 'oni-ibaraki', 'oni-shuten', 'oni-otake', 'oni-soranaki'];
    const bossImg = BOSS_IMGS[chapIdx] || 'oni-ura';
    const attrPool = ['fire', 'water', 'earth', 'wind'];
    const attr = this.wave >= 2 ? attrPool[Phaser.Math.Between(0, 3)] : 'none';
    const sy = Phaser.Math.Between(160, 290);
    this._makeOni(W, sy, 56, 84, 0x220044, 0xff33ff, `【${name}】`, '13px', '#ff88ff', BOSS_HP, BOSS_SPD, BOSS_DMG, 72, EXP_B, true, bossImg, attr);
    this.onis.getLast(true).isNamed = true;

    // ボス出現と同時に無限湧き：小鬼1500ms・中鬼4000ms、同時上限8体（EXP0）
    this._bossSpawnTimerKobuki = this.time.addEvent({
      delay: 1500, loop: true,
      callback: () => {
        if (!this.waveDone && this.onis.countActive(true) < 8) this._spawnBossGrunt(false, true);
      }
    });
    this._bossSpawnTimerNamed = this.time.addEvent({
      delay: 4000, loop: true,
      callback: () => {
        if (!this.waveDone && this.onis.countActive(true) < 8) this._spawnBossGrunt(true, true);
      }
    });
  }

  _spawnBossGrunt(named, exp0 = false) {
    const hp  = named ? NM_HP : ONI_HP;
    const col = named ? 0x661199 : 0xaa1a1a;
    const stk = named ? 0xcc88ff : 0xff6644;
    const spd = named ? NM_SPD : ONI_SPD;
    const dmg = named ? NM_DMG : ONI_DMG;
    const bw  = named ? 52 : ONI_BW;
    const nm  = named ? '中鬼' : '小鬼';
    const imgKey = named ? 'oni-mid' : 'oni-small';
    const attrPool = ['fire', 'water', 'earth', 'wind'];
    const attrChance = Math.min(1, (this.wave - 2) * 0.25);
    const attr = (this.wave >= 3 && Math.random() < attrChance) ? attrPool[Phaser.Math.Between(0, 3)] : 'none';
    const sy = Phaser.Math.Between(160, 290);
    const exp = exp0 ? 0 : (named ? EXP_N : EXP_G);
    this._makeOni(W, sy, named ? 48 : ONI_W, named ? 64 : ONI_H, col, stk, nm, named ? '13px' : '20px', named ? '#ddaaff' : '#ffbbbb', hp, spd, dmg, bw, exp, false, imgKey, attr);
  }

  /* ── 空無童子 ───────────────────────────── */
  _spawnSoranaki() {
    // 登場速度：180秒で x=W から x=65 まで移動
    const sorSpd = (W - 65) / 180;
    const sy = BATTLE_H - (BATTLE_H * 0.85) / 2;
    this._makeOni(W, sy, 56, 84, 0x000000, 0x9966cc, '【空無童子】', '13px', '#ccccff',
      Number.MAX_SAFE_INTEGER, sorSpd, 0, 72, EXP_B, true, 'oni-soranaki', 'none');
    this.soranaki = this.onis.getLast(true);
    this.soranaki.isNamed    = true;
    this.soranaki.isSoranaki = true;
    this.soranaki._baseX     = W;

    // 震えタイマー（60ms間隔）
    this._sorShakeTimer = this.time.addEvent({
      delay: 60, loop: true,
      callback: () => {
        if (!this.soranaki?.active || this._sorClearDone) return;
        const progress  = Math.min(1, this._sorPeaceMs / 180000);
        const maxOff    = 8 * progress;
        this.soranaki.x = this.soranaki._baseX + (Math.random() - 0.5) * 2 * maxOff;
      }
    });

    // グリッチタイマー（30秒間隔）
    this._sorGlitchTimer = this.time.addEvent({
      delay: 30000, loop: true,
      callback: () => {
        if (!this.soranaki?.active || this._sorClearDone) return;
        this._sorGlitch();
      }
    });
  }

  _sorActionTaken() {
    if (this.soranaki?.active && !this._sorClearDone) this._sorPeaceMs = 0;
  }

  _sorGlitch() {
    if (!this.soranaki?.active) return;

    // ① 短冊ノイズ（5〜8本、100ms）
    const noise = this.add.graphics().setDepth(52);
    for (let i = 0, n = Phaser.Math.Between(5, 8); i < n; i++) {
      noise.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.08, 0.28));
      noise.fillRect(
        Phaser.Math.Between(0, W),
        Phaser.Math.Between(0, BATTLE_H - 4),
        Phaser.Math.Between(20, W),
        Phaser.Math.Between(2, 4)
      );
    }
    this.time.delayedCall(100, () => { if (noise.active) noise.destroy(); });

    // ② 色収差オーバーレイ（150ms）
    const aberr = this.add.graphics().setDepth(51);
    const sh = Phaser.Math.Between(1, 2);
    aberr.fillStyle(0xff2200, 0.07); aberr.fillRect(sh,  0, W, BATTLE_H);
    aberr.fillStyle(0x0033ff, 0.07); aberr.fillRect(-sh, 0, W, BATTLE_H);
    this.time.delayedCall(150, () => { if (aberr.active) aberr.destroy(); });

    // ③ スキャンラインずれ：戦闘エリアをRenderTextureに焼き付けて横ずれ（200ms）
    const rt = this.add.renderTexture(0, 0, W, BATTLE_H).setDepth(50).setAlpha(0.7);
    this.children.list
      .filter(o => o !== rt && o !== noise && o !== aberr &&
                   o.active && o.visible && o.depth < 45 &&
                   typeof o.y === 'number' && o.y < BATTLE_H + 80)
      .forEach(o => rt.draw(o));
    const ox = [
      Phaser.Math.Between(-15, 15),
      Phaser.Math.Between(-15, 15),
      Phaser.Math.Between(-8,  8),
    ];
    rt.x = ox[0];
    this.time.delayedCall(67,  () => { if (rt.active) rt.x = ox[1]; });
    this.time.delayedCall(134, () => { if (rt.active) rt.x = ox[2]; });
    this.time.delayedCall(200, () => { if (rt.active) rt.destroy(); });
  }

  _sorClear() {
    if (this._sorClearDone) return;
    this._sorClearDone = true;
    this.waveDone = true;

    if (this._sorShakeTimer)  { this._sorShakeTimer.remove(false);  this._sorShakeTimer  = null; }
    if (this._sorGlitchTimer) { this._sorGlitchTimer.remove(false); this._sorGlitchTimer = null; }

    const s = this.soranaki;
    const targets = [s];
    if (s.lbl)     targets.push(s.lbl);
    if (s.hpBg)    targets.push(s.hpBg);
    if (s.hpFill)  targets.push(s.hpFill);
    if (s.attrLbl) targets.push(s.attrLbl);
    if (s.outlines) s.outlines.forEach(o => targets.push(o)); // 輪郭スプライトも砂化対象に

    this.tweens.add({
      targets, alpha: 0, duration: 2000,
      onComplete: () => {
        // 輪郭スプライト明示的破棄
        s.outlines?.forEach(o => o.destroy()); s.outlines = null;

        // ボス戦BGMフェードアウト（砂化完了と同時）
        if (this.bgmOn && this.bgmCurrent) {
          const prev = this.bgmCurrent;
          this.bgmCurrent = null;
          this.tweens.add({ targets: prev, volume: 0, duration: 1500, onComplete: () => prev.stop() });
        }

        this._healOnWaveClear();
        this._saveGame();

        // 独白開始（砂化完了後）
        const monologue = SCENARIO?.ending?.monologue;
        if (monologue?.length) {
          this._dlgShow(monologue, () => this._endingFlow());
        } else {
          this._endingFlow();
        }
      }
    });
  }

  _endingFlow() {
    // monologue完了後：降臨演出 → momotaro → ending_narration → EndingScene
    if (!SCENARIO?.ending) { this.dead = true; this.scene.start('EndingScene'); return; }
    const ed = SCENARIO.ending;

    const runDialog = () => {
      const steps = [];
      if (ed.momotaro?.length)         steps.push(ed.momotaro);
      if (ed.ending_narration?.length) steps.push(ed.ending_narration);
      const runNext = (i) => {
        if (i >= steps.length) { this.dead = true; this.scene.start('EndingScene'); return; }
        this._dlgShow(steps[i], () => runNext(i + 1));
      };
      runNext(0);
    };

    if (!ed.momotaro?.length) { runDialog(); return; }

    // 桃太郎降臨演出
    const mmH   = Math.round(BATTLE_H * 0.75);
    const mmKey = 'momotaro';
    const nat   = this.textures.exists(mmKey) ? this.textures.get(mmKey).getSourceImage() : null;
    const mmW   = nat?.width > 0 ? Math.round(nat.width * mmH / nat.height) : mmH;
    const mmX   = 195, landY = 165;
    const OFFS  = [[-4,0],[4,0],[0,-4],[0,4],[-3,-3],[3,-3],[-3,3],[3,3]];

    const outlines = OFFS.map(([dx, dy]) =>
      this.add.image(mmX + dx, -200 + dy, mmKey)
        .setDisplaySize(mmW, mmH).setTintFill(0xffffff).setAlpha(0.8).setDepth(3.9)
    );
    const mmt = this.add.image(mmX, -200, mmKey).setDisplaySize(mmW, mmH).setDepth(4);

    // 光の柱（降下と同時にフェードアウト）
    const pillar = this.add.rectangle(mmX, BATTLE_H / 2, 40, BATTLE_H, 0xffffff, 0.6).setDepth(3.8);
    this.tweens.add({ targets: pillar, alpha: 0, duration: 2000,
      onComplete: () => pillar.destroy() });

    // 降下tween
    this.tweens.add({
      targets: mmt, y: landY, duration: 2000, ease: 'Cubic.easeOut',
      onUpdate: () => OFFS.forEach(([, dy], i) => outlines[i].setY(mmt.y + dy)),
      onComplete: () => {
        // 浮遊ループ（mmt＋アウトライン）
        this.tweens.add({
          targets: [mmt, ...outlines], y: '+=8',
          duration: 2000, ease: 'Sine.easeInOut', yoyo: true, repeat: -1,
        });
        runDialog();
      },
    });
  }

  _stopBossTimers() {
    if (this._bossSpawnTimerKobuki) { this._bossSpawnTimerKobuki.remove(false); this._bossSpawnTimerKobuki = null; }
    if (this._bossSpawnTimerNamed)  { this._bossSpawnTimerNamed.remove(false);  this._bossSpawnTimerNamed  = null; }
  }

  _makeOni(ox, oy, ow, oh, col, stk, name, fs, fc, hp, spd, dmg, bw, exp, isBoss, imgKey, attr = 'none') {
    // スプライトサイズ (BATTLE_H 比)
    const ONI_RATIO = { 'oni-small':0.18, 'oni-mid':0.22, 'oni-large':0.30,
      'oni-ura':0.75, 'oni-ibaraki':0.75, 'oni-shuten':0.75, 'oni-otake':0.75, 'oni-soranaki':0.85 };
    const ratio  = ONI_RATIO[imgKey] || 0.18;
    const sprH   = BATTLE_H * ratio;
    // oy はスプライト中心座標として渡す
    const actualOy = oy;

    const body = this.add.image(ox, actualOy, imgKey).setOrigin(0.5, 0.5).setDepth(3);
    body.setDisplaySize(body.width * sprH / body.height, sprH);
    const sprW = body.displayWidth, sprH2 = body.displayHeight;
    body.outlines = [[-4,0],[4,0],[0,-4],[0,4],[-3,-3],[3,-3],[-3,3],[3,3]].map(([dx, dy]) =>
      this.add.image(ox + dx, actualOy + dy, imgKey)
        .setDisplaySize(sprW, sprH2).setTintFill(0xffffff).setAlpha(0.8).setDepth(2.9)
    );

    const barY   = actualOy - sprH / 2 - 6;
    const barH   = isBoss ? 7 : ONI_BH;
    const lbl    = this.add.text(ox, barY - 13, name, { fontSize: fs, color: fc, fontFamily:'serif', stroke:'#000', strokeThickness:2 }).setOrigin(0.5).setDepth(4);
    const hpBg   = this.add.rectangle(ox - bw/2, barY, bw, barH, 0x330000).setOrigin(0, 0.5).setDepth(4);
    const hpFill = this.add.rectangle(ox - bw/2, barY, bw, barH, isBoss ? 0xff33ff : (col === 0x661199 ? 0xaa44ff : 0xff2222)).setOrigin(0, 0.5).setDepth(4);
    let attrLbl = null;
    if (attr !== 'none') {
      const ac = '#' + ATTR_COLORS[attr].toString(16).padStart(6, '0');
      attrLbl = this.add.text(ox, barY - 24, ATTR_NAMES[attr], { fontSize:'11px', color: ac, fontFamily:'serif', fontStyle:'bold', stroke:'#000', strokeThickness:2 }).setOrigin(0.5).setDepth(4);
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
    const by = oni.y - oni.hSz/2 - 6;
    oni.lbl.setPosition(oni.x, by - 13);
    oni.hpBg.setPosition(oni.x - oni.bw/2, by);
    oni.hpFill.setPosition(oni.x - oni.bw/2, by);
    if (oni.attrLbl) oni.attrLbl.setPosition(oni.x, by - 24);
    if (oni.outlines) {
      const offs = [[-4,0],[4,0],[0,-4],[0,4],[-3,-3],[3,-3],[-3,3],[3,3]];
      oni.outlines.forEach((o, i) => o.setPosition(oni.x + offs[i][0], oni.y + offs[i][1]));
    }
  }

  _oniRm(oni) { oni.lbl?.destroy(); oni.hpBg?.destroy(); oni.hpFill?.destroy(); oni.attrLbl?.destroy(); oni.outlines?.forEach(o => o.destroy()); oni.destroy(); }

  // UI要素のみ即時除去（ボディはアニメ後に破棄）
  _oniRmUI(oni) {
    oni.lbl?.destroy();     oni.lbl     = null;
    oni.hpBg?.destroy();    oni.hpBg    = null;
    oni.hpFill?.destroy();  oni.hpFill  = null;
    oni.attrLbl?.destroy(); oni.attrLbl = null;
    if (oni._burnEvent)   { oni._burnEvent.remove(false);     oni._burnEvent   = null; }
    if (oni._statusTimer) { clearTimeout(oni._statusTimer);   oni._statusTimer = null; }
    oni.outlines?.forEach(o => o.destroy()); oni.outlines = null;
  }

  /* ── Death FX: 小鬼・中鬼・大鬼 ──────────── */
  _deathFxSmall(oni, onComplete) {
    this._oniRmUI(oni);
    oni.setActive(false);
    this.tweens.add({
      targets: oni, x: oni.x + 100, alpha: 0, duration: 300, ease: 'Power2',
      onComplete: () => {
        const px = oni.x, py = oni.y;
        oni.destroy();
        const count = Phaser.Math.Between(12, 15);
        for (let i = 0; i < count; i++) {
          // 上方向＋右方向（-PI〜0 の上半円、右寄り）
          const angle = Phaser.Math.FloatBetween(-Math.PI * 0.85, 0.05);
          const spd   = Phaser.Math.Between(30, 80);
          const sz    = Phaser.Math.Between(2, 4);
          const g = this.add.graphics().setDepth(9);
          g.fillStyle(0xCCBB99, 1);
          g.fillRect(-sz / 2, -sz / 2, sz, sz);
          g.x = px + Phaser.Math.Between(-15, 15);
          g.y = py + Phaser.Math.Between(-10, 10);
          this.tweens.add({
            targets: g,
            x: g.x + Math.cos(angle) * spd,
            y: g.y + Math.sin(angle) * spd,
            alpha: 0, duration: 800, onComplete: () => g.destroy(),
          });
        }
        if (onComplete) onComplete();
      },
    });
  }

  /* ── Death FX: ネームドボス ─────────────── */
  _deathFxBoss(oni, onComplete) {
    this._oniRmUI(oni);
    oni.setActive(false);
    const origX = oni.x;
    let shakes = 0;
    const shake = () => {
      if (shakes >= 6) { this._bossSandify(oni, onComplete); return; }
      this.tweens.add({
        targets: oni, x: origX + (shakes % 2 === 0 ? 3 : -3), duration: 80,
        onComplete: () => { shakes++; shake(); },
      });
    };
    shake();
  }

  _bossSandify(oni, onComplete) {
    const texW = oni.width, texH = oni.height;
    const sprTop = oni.y - oni.hSz / 2;
    const count  = Phaser.Math.Between(40, 50);
    // ③ 砂パーティクル：上から順に放出、下方向へ拡散
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
        g.fillStyle(0xCCBB99, 1);
        g.fillRect(-sz / 2, -sz / 2, sz, sz);
        g.x = px; g.y = py;
        this.tweens.add({
          targets: g,
          x: g.x + Math.cos(angle) * spd, y: g.y + Math.sin(angle) * spd,
          alpha: 0, duration: 800, onComplete: () => g.destroy(),
        });
      });
    }
    // ② setCrop で頭から砂化（1200ms）
    const tw = { t: 0 };
    this.tweens.add({
      targets: tw, t: 1, duration: 1200,
      onUpdate: () => {
        if (!oni.scene) return;
        oni.setCrop(0, Math.floor(tw.t * texH), texW, Math.ceil((1 - tw.t) * texH));
      },
      onComplete: () => {
        oni.destroy();
        if (onComplete) onComplete();
      },
    });
  }

  /* ── Boss death → ザコ一掃 → シナリオフロー */
  _bossDeathSequence(boss) {
    this._stopBossTimers();
    this.waveDone = true;
    this._deathFxBoss(boss, () => {
      const survivors = this.onis.getChildren().filter(o => o.active);
      const onAllDone = () => {
        this._healOnWaveClear();
        this._saveGame();
        this._ov('WAVE CLEAR!', '#ffff44', `WAVE ${this.wave} 撃退成功！`);
        this.time.delayedCall(1800, () => { this._ovHide(); this._bossScenarioFlow(); });
      };
      if (survivors.length === 0) { onAllDone(); return; }
      let pending = survivors.length;
      survivors.forEach((sv, i) => {
        this.time.delayedCall(i * 50, () => {
          this.defeated++; this.totalExp += sv.exp;
          this._deathFxSmall(sv, () => { if (--pending === 0) onAllDone(); });
        });
      });
    });
  }

  _oniDmg(oni, rawDmg, atkAttr = 'none', dot = false) {
    if (!oni.active) return;
    const mult = attrMult(atkAttr, oni.attr || 'none');
    const dmg = Math.max(1, Math.round(rawDmg * mult));
    // 空無童子：不死・ダメージ表示のみ・10%反射
    if (oni.isSoranaki) {
      this._dmgNum(oni.x, oni.y - oni.hSz / 2, dmg, '#ffffff');
      const ref = Math.max(1, Math.round(dmg * 0.1));
      this._dmgNum(this._kbSX, this._kbSY - 30, ref, '#ff4444');
      this._kbDmg(ref);
      return;
    }
    oni.hp -= dmg;
    const r = Phaser.Math.Clamp(oni.hp / oni.maxHp, 0, 1);
    oni.hpFill.setDisplaySize(oni.bw * r, oni.barH);
    // 色：DoT→黄 / 属性クリティカル（有利属性）→赤 / 通常→白
    const isCrit = !dot && mult >= 1.0 && atkAttr !== 'none' && (oni.attr || 'none') !== 'none';
    const col = dot ? '#ffff00' : isCrit ? '#ff3300' : '#ffffff';
    this._dmgNum(oni.x, oni.y - oni.hSz/2, dmg, col);
    if (oni.setTint) { oni.setTint(0xff4444); this.time.delayedCall(100, () => { if (oni?.active) oni.clearTint?.(); }); }
    if (oni.hp <= 0) {
      this.defeated++; this.totalExp += oni.exp;
      if (oni.isBoss) {
        if (!this.waveDone) this._bossDeathSequence(oni);
      } else {
        if (oni.isOgre) this._stopBossTimers();
        this._deathFxSmall(oni, null);
      }
    }
  }

  _dmgNum(x, y, dmg, col) {
    const t = this.add.text(x, y - 10, String(dmg), { fontSize:'18px', color: col || '#ffffff', stroke:'#000', strokeThickness:3, fontFamily:'Arial', fontStyle:'bold' }).setOrigin(0.5).setDepth(11);
    this.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 800, ease:'Power1', onComplete: () => t.destroy() });
  }

  _kbDmg(dmg) {
    if (this.dead) return;
    this.kbHP = Math.max(0, this.kbHP - dmg);
    const r = this.kbHP / this.kbHPMax;
    this.kbHpBar.setDisplaySize(54 * r, 9).setFillStyle(r > 0.5 ? 0x22dd55 : r > 0.25 ? 0xddcc22 : 0xdd2222);
    if (this.kbSpr?.setTint) this.kbSpr.setTint(0xff3333);
    this.time.delayedCall(130, () => { if (this.kbSpr?.active) this.kbSpr.clearTint?.(); });
    if (this.kbHP <= 0) this._gameOver();
  }

  _healOnWaveClear() {
    const heal = Math.floor(this.kbHPMax * 0.1);
    this.kbHP = Math.min(this.kbHPMax, this.kbHP + heal);
    const r = this.kbHP / this.kbHPMax;
    this.kbHpBar.setDisplaySize(54 * r, 9).setFillStyle(r > 0.5 ? 0x22dd55 : r > 0.25 ? 0xddcc22 : 0xdd2222);
  }

  /* ── Wave ───────────────────────────────── */
  _waveClear() {
    this.waveDone = true;
    this._healOnWaveClear();
    this._saveGame();
    this._ov('WAVE CLEAR!', '#ffff44', `WAVE ${this.wave} 撃退成功！`);
    this.time.delayedCall(1800, () => { this._ovHide(); this._resOpen(); });
  }

  _waveClearBoss() {
    this.waveDone = true;
    this._healOnWaveClear();
    this._saveGame();
    this._ov('WAVE CLEAR!', '#ffff44', `WAVE ${this.wave} 撃退成功！`);
    this.time.delayedCall(1800, () => { this._ovHide(); this._bossScenarioFlow(); });
  }

  _bossScenarioFlow() {
    if (!SCENARIO) { this._resOpen(); return; }
    const chap = SCENARIO.chapters[this.chapter - 1];
    if (!chap) { this._resOpen(); return; }

    // 表示するダイアログを順に積む。kuchisakeが空なら省略
    const steps = [];
    if (chap.kuchisake && chap.kuchisake.length > 0) steps.push(chap.kuchisake);
    if (chap.monologue  && chap.monologue.length  > 0) steps.push(chap.monologue);
    if (chap.narration  && chap.narration.length  > 0) steps.push(chap.narration);

    if (steps.length === 0) { this._resOpen(); return; }

    const runNext = (i) => {
      if (i >= steps.length) { this._resOpen(); return; }
      this._dlgShow(steps[i], () => runNext(i + 1));
    };
    runNext(0);
  }

  _nextWave() {
    this._stopBossTimers();
    const prevChapter = this.chapter;
    this.wave++;
    this.chapter = Math.ceil(this.wave / 10);
    this.spawned = this.defeated = this.spawnTimer = 0;
    this.waveDone = this.bossSpawned = false;
    this._gridUp();
    // 章をまたいだとき → 背景オーバーレイ更新 + 通常戦闘BGMに戻す
    if (this.chapter !== prevChapter) this._bgChapterUp();
    if (this.bgmOn && this.bgmCurrent && this.chapter !== prevChapter) {
      const prev = this.bgmCurrent;
      this.bgmCurrent = null;
      this.tweens.add({ targets: prev, volume: 0, duration: 800, onComplete: () => {
        prev.stop();
        this.bgmCurrent = this.sound.add('bgm_battle', { loop: true, volume: 0 });
        this.bgmCurrent.play();
        this.tweens.add({ targets: this.bgmCurrent, volume: this.bgmVol, duration: 1000 });
      }});
    }
  }

  _gameOver() { this._stopBossTimers(); this.dead = true; deleteSave(); this._ov('GAME OVER', '#ff4444', 'タップしてリスタート'); }

  _ov(title, color, sub) {
    this.ovBg.setAlpha(0.55);
    this.ovTitle.setText(title).setStyle({ color, fontSize:'46px', fontFamily:'serif', fontStyle:'bold', stroke:'#000', strokeThickness:8 }).setAlpha(1);
    this.ovSub.setText(sub).setAlpha(1);
  }
  _ovHide() { this.ovBg.setAlpha(0); this.ovTitle.setAlpha(0); this.ovSub.setAlpha(0); }

  /* ── Save ───────────────────────────────── */
  _saveGame() {
    saveGame({
      wave:          this.wave + 1,
      kbHP:          this.kbHP,
      kbHPMax:       this.kbHPMax,
      slashDmg:      this.slashDmg,
      totalExp:      this.totalExp,
      unlockedSlots: this.unlockedSlots,
      bagCharms:     this.bagCharms.map(c => ({ ...c })),
      slotCharmIds:  this.slotCharms.map(c => c ? c.id : null),
      charmTimers:   [...this.charmTimers],
      selectedUltId: this.selectedUltId,
    });
  }

  /* ── UI refresh ─────────────────────────── */
  _hdrUp() {
    this.hpTxt.setText(`HP: ${this.kbHP}/${this.kbHPMax}`);
    this.expTxt.setText(`EXP: ${this.totalExp}`);
    this.waveTxt.setText(`WAVE ${this.wave}`);
    const wic = ((this.wave - 1) % 10) + 1;
    const remaining = Math.max(0, ONI_WAVE - this.spawned) + this.onis.countActive(true);
    this.eneCountTxt.setText(wic === 10 ? 'BOSS WAVE' : `${remaining}/${ONI_WAVE}`);
  }

  _gridUp() {
    for (let i = 0; i < 9; i++) {
      const locked = i >= this.unlockedSlots;
      const c = this.slotCharms[i];
      const bg = this.cBg[i], gfx = this.cGfx[i], bdr = this.cBdr[i], txt = this.cTxt[i];
      if (locked) {
        bg.setFillStyle(0x050505);
        gfx.clear();
        bdr.setStrokeStyle(1, 0x1a1a1a);
        txt.setText('施錠').setStyle({ color:'#2a2a2a', fontSize:'10px', align:'center', stroke:'#000', strokeThickness:0 });
        this.cSub[i].setText('');
      } else if (!c) {
        bg.setFillStyle(0x050810);
        gfx.clear();
        bdr.setStrokeStyle(1, 0x334433);
        txt.setText('＋\n空き').setStyle({ color:'#447744', fontSize:'12px', align:'center', stroke:'#000', strokeThickness:2 });
        this.cSub[i].setText('');
      } else {
        const an = ATTR_NAMES[c.attr] || '－';
        const r = Math.min(1, this.charmTimers[i] / c.chargeMs);
        const ready = r >= 1;
        const attributeColor = ready ? 0xffffff : (ATTR_FILL[c.attr] || ATTR_FILL.none);
        const col = i % 3, row = Math.floor(i / 3);
        const cellX = GRID_X0 + col * CELL_W;
        const cellY = GRID_TOP + row * CELL_H;
        const cellWidth = CELL_W, cellHeight = CELL_H;
        bg.setFillStyle(0x050810);
        gfx.clear();
        const fillHeight = cellHeight * r;
        const fillY = cellY + cellHeight - fillHeight;
        gfx.fillStyle(attributeColor, 0.6);
        gfx.fillRect(cellX, fillY, cellWidth, fillHeight);
        bdr.setStrokeStyle(2, ready ? 0x44ffaa : (r > 0.05 ? attributeColor : 0x334433));
        const pct = Math.floor(r * 100);
        txt.setText(`[${an}]${c.name}\n${ready ? '【発動！】' : `${pct}%`}`)
          .setStyle({ color:'#ffffff', fontSize:'11px', align:'center', stroke:'#000', strokeThickness:3 });
        this.cSub[i].setText(c.name.length > 6 ? c.name.slice(0, 6) : c.name);
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
    const cellX = GRID_X0 + col * CELL_W;
    const cellY = GRID_TOP + row * CELL_H;
    const chargeRatio = r;
    const cellWidth = CELL_W, cellHeight = CELL_H;
    const gfx = this.cGfx[idx];
    gfx.clear();
    const fillHeight = cellHeight * chargeRatio;
    const fillY = cellY + cellHeight - fillHeight;
    gfx.fillStyle(attributeColor, 0.6);
    gfx.fillRect(cellX, fillY, cellWidth, fillHeight);
    this.cBdr[idx].setStrokeStyle(2, ready ? 0x44ffaa : (r > 0.05 ? attributeColor : 0x334433));
    const pct = Math.floor(r * 100);
    this.cTxt[idx].setText(`[${an}]${c.name}\n${ready ? '【発動！】' : `${pct}%`}`)
      .setStyle({ color:'#ffffff', fontSize:'11px', align:'center', stroke:'#000', strokeThickness:3 });
    this.cSub[idx].setText(c.name.length > 6 ? c.name.slice(0, 6) : c.name);
  }

  /* ── Dialog box ─────────────────────────── */
  _dlgBuild() {
    // 戦闘エリア下部 120px のオーバーレイ
    const boxH = 120;
    const boxCY = BATTLE_H - boxH / 2;   // y=270
    this._dlgBg = this.add.rectangle(W / 2, boxCY, W, boxH, 0x000000)
      .setAlpha(0).setDepth(20);
    // 上端ライン
    this._dlgLine = this.add.rectangle(W / 2, BATTLE_H - boxH, W, 2, 0x445544)
      .setAlpha(0).setDepth(20);
    // 話者名
    this._dlgSpeakerTxt = this.add.text(14, BATTLE_H - boxH + 10, '', {
      fontSize: '14px', color: '#ffdd88',
      fontFamily: 'serif', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 2
    }).setAlpha(0).setDepth(21);
    // 台詞本文
    this._dlgBodyTxt = this.add.text(14, BATTLE_H - boxH + 30, '', {
      fontSize: '15px', color: '#ffffff',
      fontFamily: 'serif',
      wordWrap: { width: W - 28, useAdvancedWrap: true },
      stroke: '#000', strokeThickness: 2
    }).setAlpha(0).setDepth(21);
    // ▼ インジケーター
    this._dlgIndTxt = this.add.text(W - 12, BATTLE_H - 10, '▼', {
      fontSize: '13px', color: '#aaaaaa', fontFamily: 'Arial'
    }).setOrigin(1, 1).setAlpha(0).setDepth(21);
    // インジケーターの点滅ツイーン（初期は停止）
    this._dlgIndTween = this.tweens.add({
      targets: this._dlgIndTxt,
      alpha: { from: 0.25, to: 1.0 },
      yoyo: true, repeat: -1, duration: 550, paused: true
    });
  }

  /* ── Remove confirm dialog ──────────────── */
  _rmBuild() {
    const cy = UI_Y0 + 180;
    this._rmBg    = this.add.rectangle(W/2, UI_Y0 + UI_H/2, W, UI_H, 0x000011).setAlpha(0).setDepth(22);
    this._rmTtl   = this.add.text(W/2, cy - 50, '', { fontSize:'15px', color:'#ffdd88', fontFamily:'serif', fontStyle:'bold' }).setOrigin(0.5).setAlpha(0).setDepth(23);
    this._rmSub   = this.add.text(W/2, cy - 22, '※袋には戻りません', { fontSize:'12px', color:'#aa6655', fontFamily:'Arial' }).setOrigin(0.5).setAlpha(0).setDepth(23);
    this._rmYesBg = this.add.rectangle(W/2 - 72, cy + 28, 126, 46, 0x330000).setStrokeStyle(2, 0xcc3333).setAlpha(0).setDepth(22);
    this._rmYesTx = this.add.text(W/2 - 72, cy + 28, '外す', { fontSize:'15px', color:'#ff6644', fontFamily:'serif', fontStyle:'bold' }).setOrigin(0.5).setAlpha(0).setDepth(23);
    this._rmNoBg  = this.add.rectangle(W/2 + 72, cy + 28, 126, 46, 0x001133).setStrokeStyle(2, 0x3355aa).setAlpha(0).setDepth(22);
    this._rmNoTx  = this.add.text(W/2 + 72, cy + 28, 'キャンセル', { fontSize:'14px', color:'#8899cc', fontFamily:'Arial' }).setOrigin(0.5).setAlpha(0).setDepth(23);
    this._rmVis = false; this._rmIdx = -1;
  }

  _rmOpen(idx) {
    const c = this.slotCharms[idx];
    if (!c) return;
    this._rmIdx = idx; this._rmVis = true;
    this._rmTtl.setText(`「${c.name}」を外しますか？`);
    [this._rmBg, this._rmTtl, this._rmSub, this._rmYesBg, this._rmYesTx, this._rmNoBg, this._rmNoTx]
      .forEach((o, j) => o.setAlpha(j === 0 ? 0.95 : 1));
  }

  _rmClose() {
    this._rmVis = false; this._rmIdx = -1;
    [this._rmBg, this._rmTtl, this._rmSub, this._rmYesBg, this._rmYesTx, this._rmNoBg, this._rmNoTx]
      .forEach(o => o.setAlpha(0));
  }

  _rmTap(x, y) {
    const cy = UI_Y0 + 180;
    if (Math.abs(x - (W/2 - 72)) < 68 && Math.abs(y - (cy + 28)) < 28) {
      // 外す
      this.slotCharms[this._rmIdx] = null;
      this.charmTimers[this._rmIdx] = 0;
      this._gridUp(); this._rmClose();
    } else if (Math.abs(x - (W/2 + 72)) < 68 && Math.abs(y - (cy + 28)) < 28) {
      this._rmClose(); // キャンセル
    }
  }

  _dlgShow(lines, onComplete) {
    this._dlgLines = lines;
    this._dlgIdx = 0;
    this._dlgOnComplete = onComplete || null;
    this.dialogActive = true;
    this._dlgBg.setAlpha(0.92);
    this._dlgLine.setAlpha(1);
    this._dlgIndTween.resume();
    this._dlgRender();
  }

  _dlgRender() {
    const line = this._dlgLines[this._dlgIdx];
    if (line.speaker) {
      this._dlgSpeakerTxt.setText(line.speaker).setAlpha(1);
      this._dlgBodyTxt.setY(BATTLE_H - 88).setAlpha(1);
    } else {
      this._dlgSpeakerTxt.setAlpha(0);
      this._dlgBodyTxt.setY(BATTLE_H - 100).setAlpha(1);
    }
    this._dlgBodyTxt.setText(line.text);
  }

  _dlgNext() {
    this._dlgIdx++;
    if (this._dlgIdx >= this._dlgLines.length) {
      this._dlgHide();
    } else {
      this._dlgRender();
    }
  }

  _dlgHide() {
    this.dialogActive = false;
    this._dlgBg.setAlpha(0);
    this._dlgLine.setAlpha(0);
    this._dlgSpeakerTxt.setAlpha(0);
    this._dlgBodyTxt.setAlpha(0);
    this._dlgIndTxt.setAlpha(0);
    this._dlgIndTween.pause();
    if (this._dlgOnComplete) {
      const cb = this._dlgOnComplete;
      this._dlgOnComplete = null;
      cb();
    }
  }

  /* ── Debug ──────────────────────────────── */
  _debugBuild() {
    if (!DEBUG) return;
    // WAVE SKIP ボタン（左上 4-80, 3-24）
    this.add.rectangle(42, 13, 76, 20, 0x221100, 0.85).setStrokeStyle(1, 0xff6600).setDepth(38);
    this.add.text(42, 13, 'WAVE SKIP', { fontSize:'9px', color:'#ff8833', fontFamily:'monospace' }).setOrigin(0.5).setDepth(39);
    // JUMP ボタン（左上 4-80, 27-48）
    this.add.rectangle(42, 37, 76, 20, 0x001122, 0.85).setStrokeStyle(1, 0x3388ff).setDepth(38);
    this.add.text(42, 37, 'JUMP', { fontSize:'9px', color:'#3399ff', fontFamily:'monospace' }).setOrigin(0.5).setDepth(39);

    // ジャンプ選択UI（初期非表示）
    this._dbgJumpObjs = [];
    this._dbgJumpObjs.push(
      this.add.rectangle(W/2, BATTLE_H/2, W, BATTLE_H, 0x000000, 0.85).setDepth(60).setVisible(false)
    );
    for (let ch = 1; ch <= 5; ch++) {
      const by = 56 + ch * 44;
      this._dbgJumpObjs.push(
        this.add.rectangle(W/2, by, 210, 32, 0x112233).setStrokeStyle(1, 0x3388ff).setDepth(61).setVisible(false),
        this.add.text(W/2, by, `${ch}章  WAVE ${(ch - 1) * 10 + 1}`, { fontSize:'14px', color:'#aaddff', fontFamily:'monospace' }).setOrigin(0.5).setDepth(62).setVisible(false)
      );
    }
    this._dbgJumpObjs.push(
      this.add.rectangle(W/2, 308, 120, 28, 0x221111).setStrokeStyle(1, 0x884422).setDepth(61).setVisible(false),
      this.add.text(W/2, 308, '閉じる', { fontSize:'12px', color:'#cc6644', fontFamily:'monospace' }).setOrigin(0.5).setDepth(62).setVisible(false)
    );
    this._dbgJumpVisible = false;
  }

  _dbgJumpToggle() {
    if (!this._dbgJumpObjs) return;
    this._dbgJumpVisible = !this._dbgJumpVisible;
    this._dbgJumpObjs.forEach(o => o.setVisible(this._dbgJumpVisible));
  }

  _dbgJumpUiHide() {
    this._dbgJumpVisible = false;
    this._dbgJumpObjs?.forEach(o => o.setVisible(false));
  }

  _dbgWaveSkip() {
    if (this.waveDone || this.dead) return;
    this._stopBossTimers();
    if (this._sorShakeTimer)  { this._sorShakeTimer.remove(false);  this._sorShakeTimer  = null; }
    if (this._sorGlitchTimer) { this._sorGlitchTimer.remove(false); this._sorGlitchTimer = null; }
    for (const oni of [...this.onis.getChildren()]) { if (oni.active) { this._oniRmUI(oni); oni.destroy(); } }
    this.soranaki = null;
    const wic = ((this.wave - 1) % 10) + 1;
    if (wic === 10) this._waveClearBoss();
    else            this._waveClear();
  }

  _dbgJump(ch) {
    this._stopBossTimers();
    if (this._sorShakeTimer)  { this._sorShakeTimer.remove(false);  this._sorShakeTimer  = null; }
    if (this._sorGlitchTimer) { this._sorGlitchTimer.remove(false); this._sorGlitchTimer = null; }
    for (const oni of [...this.onis.getChildren()]) { if (oni.active) { this._oniRmUI(oni); oni.destroy(); } }
    this.wave    = (ch - 1) * 10 + 1;
    this.chapter = ch;
    this.spawned = this.defeated = this.spawnTimer = 0;
    this.waveDone = this.bossSpawned = false;
    this.soranaki = null; this._sorPeaceMs = 0; this._sorClearDone = false;
    // BGM を通常戦闘に戻す
    if (this.bgmOn && this.bgmCurrent) {
      this.bgmCurrent.stop();
      this.bgmCurrent = this.sound.add('bgm_battle', { loop: true, volume: this.bgmVol });
      this.bgmCurrent.play();
    }
    this._bgChapterUp();
    this._hdrUp(); this._gridUp();
    this._dbgJumpUiHide();
  }

  /* ── Pause ──────────────────────────────── */
  _pauseBuild() {
    // 戦闘エリアのみ暗転
    this._pauseOv = this.add.rectangle(W/2, BATTLE_H/2, W, BATTLE_H, 0x000000, 0.7).setDepth(35).setVisible(false);
    // 4項目を戦闘エリア中央に配置（50px間隔、計150px、中心 BATTLE_H/2=165）
    const baseY = BATTLE_H / 2 - 75;
    const labels = ['再開', '音楽 ●ON', '効果音 ●ON', 'タイトルへ'];
    this._pauseItems = labels.map((lbl, i) =>
      this.add.text(W/2, baseY + i * 50, lbl, {
        fontSize:'24px', color:'#ffffff', fontFamily:'serif',
        stroke:'#000', strokeThickness:3,
      }).setOrigin(0.5).setDepth(36).setVisible(false)
    );
    // 確認ダイアログも戦闘エリア内に配置
    const confBaseY = BATTLE_H / 2 - 50;
    const confLabels = ['セーブして戻る', '戻る', 'キャンセル'];
    this._pauseConfItems = confLabels.map((lbl, i) =>
      this.add.text(W/2, confBaseY + i * 55, lbl, {
        fontSize:'22px', color:'#ffffff', fontFamily:'serif',
        stroke:'#000', strokeThickness:3,
      }).setOrigin(0.5).setDepth(36).setVisible(false)
    );
    this._pauseConfVis = false;
  }

  _pauseOpen() {
    this.paused = true;
    this.tweens.pauseAll();
    this._pauseOv.setVisible(true);
    this._pauseItems[1].setText(this.bgmVol > 0 ? '音楽 ●ON' : '音楽 ○OFF')
      .setStyle({ color: this.bgmVol > 0 ? '#ffffff' : '#888888', fontSize:'24px', fontFamily:'serif', stroke:'#000', strokeThickness:3 });
    this._pauseItems[2].setText(this.seVol > 0 ? '効果音 ●ON' : '効果音 ○OFF')
      .setStyle({ color: this.seVol > 0 ? '#ffffff' : '#888888', fontSize:'24px', fontFamily:'serif', stroke:'#000', strokeThickness:3 });
    for (const t of this._pauseItems) t.setVisible(true);
    this._pauseConfVis = false;
    for (const t of this._pauseConfItems) t.setVisible(false);
  }

  _pauseClose() {
    this.paused = false;
    this.tweens.resumeAll();
    this._pauseOv.setVisible(false);
    for (const t of this._pauseItems) t.setVisible(false);
    for (const t of this._pauseConfItems) t.setVisible(false);
    this._pauseConfVis = false;
  }

  _pauseTap(x, y) {
    const confBaseY = BATTLE_H / 2 - 50;
    if (this._pauseConfVis) {
      for (let i = 0; i < 3; i++) {
        if (Math.abs(y - (confBaseY + i * 55)) < 24) {
          if (i === 0) {
            this._stopBossTimers();
            this._saveGame();
            this.scene.start('TitleScene');
          } else if (i === 1) {
            this.scene.start('TitleScene');
          } else {
            this._pauseConfVis = false;
            for (const t of this._pauseConfItems) t.setVisible(false);
            for (const t of this._pauseItems) t.setVisible(true);
          }
          return;
        }
      }
      return;
    }
    const baseY = BATTLE_H / 2 - 75;
    for (let i = 0; i < 4; i++) {
      if (Math.abs(y - (baseY + i * 50)) < 22) {
        if (i === 0) { this._pauseClose(); }
        else if (i === 1) {
          const opts = loadOpts();
          if (this.bgmVol > 0) {
            this.bgmVol = 0;
            for (const snd of this.sound.getAll()) { if (snd.loop) snd.setVolume(0); }
            saveOpts({ ...opts, bgmVol: 0 });
          } else {
            this.bgmVol = 0.7;
            for (const snd of this.sound.getAll()) { if (snd.loop) snd.setVolume(0.7); }
            saveOpts({ ...opts, bgmVol: 0.7 });
          }
          this._pauseItems[1].setText(this.bgmVol > 0 ? '音楽 ●ON' : '音楽 ○OFF')
            .setStyle({ color: this.bgmVol > 0 ? '#ffffff' : '#888888', fontSize:'24px', fontFamily:'serif', stroke:'#000', strokeThickness:3 });
        }
        else if (i === 2) {
          const opts = loadOpts();
          if (this.seVol > 0) {
            this.seVol = 0;
            saveOpts({ ...opts, seVol: 0 });
          } else {
            this.seVol = 0.8;
            saveOpts({ ...opts, seVol: 0.8 });
          }
          this._pauseItems[2].setText(this.seVol > 0 ? '効果音 ●ON' : '効果音 ○OFF')
            .setStyle({ color: this.seVol > 0 ? '#ffffff' : '#888888', fontSize:'24px', fontFamily:'serif', stroke:'#000', strokeThickness:3 });
        }
        else if (i === 3) {
          this._pauseConfVis = true;
          for (const t of this._pauseItems) t.setVisible(false);
          for (const t of this._pauseConfItems) t.setVisible(true);
        }
        return;
      }
    }
  }

  /* ── Long press / Tooltip ───────────────── */
  _lpStart(p) {
    if (this._lpActive) return;
    // 大技ボタン長押し → 選択メニュー
    if (Math.abs(p.x - SB_X) < 62 && Math.abs(p.y - SB_Y) < 24) {
      if (this._ultLpTimer) { this._ultLpTimer.remove(false); this._ultLpTimer = null; }
      this._ultLpTimer = this.time.delayedCall(500, () => {
        this._ultLpTimer = null;
        this._ultMenuOpen();
      });
      return;
    }
    if (this._lpTimer) { this._lpTimer.remove(false); this._lpTimer = null; }
    const { x, y } = p;
    if (y < GRID_TOP || y >= GRID_BOT) return;
    const col = Math.floor((x - GRID_X0) / CELL_W);
    const row = Math.floor((y - GRID_TOP) / CELL_H);
    if (col < 0 || col >= 3 || row < 0 || row >= 3) return;
    const idx = row * 3 + col;
    if (idx >= this.unlockedSlots || !this.slotCharms[idx]) return;
    this._lpTimer = this.time.delayedCall(500, () => {
      this._lpActive = true;
      this._tooltipShow(idx);
    });
  }

  _lpEnd(p) {
    // 大技ボタン短押し → 発動
    if (this._ultLpTimer) {
      this._ultLpTimer.remove(false); this._ultLpTimer = null;
      if (this.gaugeReady && !this.paused) this._ultFire();
      return;
    }
    if (this._lpTimer) { this._lpTimer.remove(false); this._lpTimer = null; }
  }

  _removeCharmViaTooltip() {
    if (this._lpIdx < 0) return;
    this.slotCharms[this._lpIdx] = null;
    this.charmTimers[this._lpIdx] = 0;
    this._gridUp();
    this._tooltipHide();
    this._lpActive = false;
  }

  _tooltipBuild() {
    this._tipBg  = this.add.graphics().setDepth(25).setAlpha(0);
    this._tipTxt = this.add.text(0, 0, '', {
      fontSize:'12px', color:'#ffffff', fontFamily:'serif',
      lineSpacing:4, stroke:'#000', strokeThickness:2,
    }).setDepth(26).setAlpha(0);
    this._tipRemoveBg  = this.add.graphics().setDepth(26).setAlpha(0);
    this._tipRemoveTxt = this.add.text(0, 0, '外す', {
      fontSize:'13px', color:'#ffffff', fontFamily:'serif', fontStyle:'bold',
      stroke:'#000', strokeThickness:2,
    }).setOrigin(0.5).setDepth(27).setAlpha(0);

    this._tipOverlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(24).setVisible(false);
    this._tipOverlay.setInteractive();
    this._tipOverlay.input.enabled = false;
    this._tipOverlay.on('pointerdown', () => { this._tooltipHide(); this._lpActive = false; });

    this._tipRemoveHit = this.add.rectangle(0, 0, 70, 28, 0xffffff, 0).setDepth(27).setVisible(false);
    this._tipRemoveHit.setInteractive();
    this._tipRemoveHit.input.enabled = false;
    this._tipRemoveHit.on('pointerdown', (pointer, lx, ly, event) => {
      event.stopPropagation();
      this._removeCharmViaTooltip();
    });

    this._lpIdx = -1;
  }

  _tooltipShow(idx) {
    const c = this.slotCharms[idx];
    if (!c) return;
    const col = idx % 3, row = Math.floor(idx / 3);
    const cellCX  = GRID_X0 + col * CELL_W + CELL_W / 2;
    const cellTop = GRID_TOP + row * CELL_H;

    const tgtMap = { single:'単体', fan3:'扇3体', pierceAll:'貫通', areaAll:'全体' };
    const stMap  = { burn:'燃焼', stun:'スタン', root:'拘束', slow:'鈍足', freeze:'凍結', knockback:'吹き飛ばし' };
    const lines  = [
      c.name,
      `属性：${ATTR_NAMES[c.attr] || '－'}  DMG：${c.damage}`,
      `対象：${tgtMap[c.target] || c.target}`,
    ];
    if (c.status) lines.push(`状態異常：${stMap[c.status] || c.status}（${c.statusDuration / 1000}s）`);
    lines.push(`チャージ：${(c.chargeMs / 1000).toFixed(1)}s`);

    this._tipTxt.setText(lines.join('\n')).setAlpha(1);
    const pad = 12;
    const tw  = this._tipTxt.width  + pad * 2;
    const th  = this._tipTxt.height + pad * 2;
    const tipCY = Math.max(th / 2 + 5, cellTop - 10 - th / 2);
    const tipCX = Phaser.Math.Clamp(cellCX, tw / 2 + 5, W - tw / 2 - 5);
    this._tipBg.clear();
    this._tipBg.fillStyle(0x000000, 0.85);
    this._tipBg.fillRoundedRect(tipCX - tw / 2, tipCY - th / 2, tw, th, 8);
    this._tipBg.setAlpha(1);
    this._tipTxt.setPosition(tipCX - tw / 2 + pad, tipCY - th / 2 + pad).setAlpha(1);

    // 外すボタン（ツールチップ下部）
    const btnW = 70, btnH = 28;
    const btnX = tipCX;
    const btnY = tipCY + th / 2 + 8 + btnH / 2;
    this._tipRemoveBg.clear();
    this._tipRemoveBg.fillStyle(0xAA0000, 1);
    this._tipRemoveBg.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 6);
    this._tipRemoveBg.setAlpha(1);
    this._tipRemoveTxt.setPosition(btnX, btnY).setAlpha(1);
    this._tipOverlay.setVisible(true); this._tipOverlay.input.enabled = true;
    this._tipRemoveHit.setPosition(btnX, btnY).setVisible(true); this._tipRemoveHit.input.enabled = true;
    this._lpIdx = idx;
  }

  _tooltipHide() {
    this._tipBg.setAlpha(0);
    this._tipTxt.setAlpha(0);
    this._tipRemoveBg.setAlpha(0);
    this._tipRemoveTxt.setAlpha(0);
    this._tipOverlay.setVisible(false); this._tipOverlay.input.enabled = false;
    this._tipRemoveHit.setVisible(false); this._tipRemoveHit.input.enabled = false;
    this._lpIdx = -1;
  }
}
