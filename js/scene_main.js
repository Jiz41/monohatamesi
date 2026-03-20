'use strict';

/* ══════════════════════════════════════════════ */
class MainScene extends Phaser.Scene {
  constructor() { super({ key: 'MainScene' }); }

  preload() {
    this.load.image('kibitsu',      'kibitsu.png');
    this.load.image('oni-small',    'oni-small.png');
    this.load.image('oni-mid',      'oni-mid.png');
    this.load.image('oni-large',    'oni-large.png');
    this.load.image('oni-ura',      'oni-ura.png');
    this.load.image('oni-ibaraki',  'oni-ibaraki.png');
    this.load.image('oni-shuten',   'oni-shuten.png');
    this.load.image('oni-otake',    'oni-otake.png');
    this.load.image('oni-soranaki', 'oni-soranaki.png');
  }

  create() {
    this.kbHP = this.kbHPMax = 300;
    this.wave = 1;
    this.chapter = 1;
    this.spawned = this.defeated = this.spawnTimer = this.bulTimer = 0;
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
    this.bgmOn     = true;
    this.seOn      = true;

    this._bg();    this._kb();    this._hdr();
    this._grid();  this._slash(); this._bagBuild();
    this._superBtn();
    this._ovBuild();  this._resBuild();
    this._cpBuild();  this._upgBuild();
    this._dlgBuild(); this._rmBuild();
    this._tooltipBuild();
    this._pauseBuild();

    this.onis    = this.add.group();
    this.bullets = this.add.group();
    this.sfx     = this.add.graphics().setDepth(10);

    this.input.on('pointerdown', p => { this._lpStart(p); this._tap(p); });
    this.input.on('pointerup',   p => this._lpEnd(p));
    this._hdrUp(); this._gridUp(); this._bagUp();

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
        if (oni.burnTick >= 500) { oni.burnTick -= 500; this._oniDmg(oni, 8, 'fire'); }
      }
      // root DoT
      if (oni.rootStacks > 0) {
        oni.rootTick += dt;
        if (oni.rootTick >= 500) { oni.rootTick -= 500; this._oniDmg(oni, oni.rootStacks * 5, 'earth'); }
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

    // auto bullet
    this.bulTimer += dt;
    if (this.bulTimer >= BUL_MS) { this.bulTimer -= BUL_MS; this._bullet(); }

    // move bullets + hit
    const ol = this.onis.getChildren();
    for (const b of [...this.bullets.getChildren()]) {
      if (!b.active) continue;
      b.x += b.vx * (dt / 1000); b.y += b.vy * (dt / 1000);
      if (b.x > KB_X + BUL_RNG || b.x > W + 20 || b.x < -20 || b.y < -20 || b.y > BATTLE_H + 20) {
        b.destroy(); continue;
      }
      for (const oni of ol) {
        if (!oni.active) continue;
        if (Phaser.Math.Distance.Between(b.x, b.y, oni.x, oni.y) < 26) {
          b.destroy(); this._oniDmg(oni, b.dmg || BUL_DMG, b.attr || 'none'); break;
        }
      }
    }

    // wave clear
    if (this.spawned >= ONI_WAVE && this.bossSpawned && this.onis.countActive(true) === 0)
      this._waveClear();

    this._hdrUp();
  }

  /* ── BG ─────────────────────────────────── */
  _bg() {
    this.add.rectangle(W/2, BATTLE_H/2, W, BATTLE_H, 0x1a2e20).setDepth(0);
    this.add.rectangle(W/2, BATTLE_H - 16, W, 32, 0x3a2910).setDepth(0);
    this.add.rectangle(W/2, 6, W, 12, 0x223344).setDepth(0);
    this.add.rectangle(W/2, UI_Y0 + UI_H/2, W, UI_H, 0x0c100c).setDepth(0);
    this.add.rectangle(W/2, UI_Y0 + 1, W, 3, 0x44664a).setDepth(0);
    this.add.rectangle(20, BATTLE_H/2, 40, BATTLE_H, 0x6e4e12).setDepth(1);
    this.add.rectangle(20, BATTLE_H/2, 40, BATTLE_H).setStrokeStyle(2, 0xb89a30).setDepth(2);
    this.add.text(20, 20, '門', { fontSize:'12px', color:'#ccaa44', fontFamily:'serif' }).setOrigin(0.5).setDepth(3);
    // PAUSEボタン（戦闘エリア右上）
    const pBtnBg = this.add.graphics().setDepth(20);
    pBtnBg.fillStyle(0x000000, 0.6);
    pBtnBg.fillRoundedRect(355, 0, 30, 30, 4);
    this.add.text(370, 15, '≡', { fontSize:'18px', color:'#ffffff', fontFamily:'serif' }).setOrigin(0.5).setDepth(20);
  }

  /* ── Kibitsu ────────────────────────────── */
  _kb() {
    const h = BATTLE_H * 0.22;   // 72.6px
    const kx = 65, ky = 165;     // 門の左柱寄り・戦闘エリア中央
    this.kbSpr = this.add.image(kx, ky, 'kibitsu').setOrigin(0.5, 0.5).setDepth(3);
    const naturalH = this.kbSpr.height || 1;
    this.kbSpr.setDisplaySize(this.kbSpr.width * h / naturalH, h);
    this.kbSpr.setPosition(kx, ky); // setDisplaySize後に位置を再確定
    // 弾発射基点（スプライト右端）を保存
    this._kbSX = kx + this.kbSpr.displayWidth / 2;
    this._kbSY = ky;
    const barY = ky - h / 2 - 8;
    this.add.rectangle(kx - 27, barY, 54, 9, 0x220000).setOrigin(0, 0.5).setDepth(4);
    this.kbHpBar = this.add.rectangle(kx - 27, barY, 54, 9, 0x22dd55).setOrigin(0, 0.5).setDepth(4);
  }

  /* ── Header ─────────────────────────────── */
  _hdr() {
    this.hpTxt   = this.add.text(14, UI_Y0 + 6, '', { fontSize:'13px', color:'#88aaff', fontFamily:'Arial' }).setDepth(5);
    this.waveTxt = this.add.text(W/2, UI_Y0 + 14, 'WAVE 1', { fontSize:'21px', color:'#ddcc44', fontFamily:'serif', fontStyle:'bold' }).setOrigin(0.5).setDepth(5);
    this.expTxt  = this.add.text(W - 14, UI_Y0 + 6, '', { fontSize:'13px', color:'#aaee88', fontFamily:'Arial' }).setOrigin(1, 0).setDepth(5);
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
    this.sBtnBg  = this.add.rectangle(SB_X, SB_Y, 110, 40, 0x330011).setStrokeStyle(2, 0xff3388).setAlpha(0).setDepth(8);
    this.sBtnTxt = this.add.text(SB_X, SB_Y, '★ 大技発動', { fontSize:'14px', color:'#ff88cc', fontFamily:'serif', fontStyle:'bold', stroke:'#000', strokeThickness:3 }).setOrigin(0.5).setAlpha(0).setDepth(9);
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
      const by = b + 100 + i * 80;
      return {
        bg:  this.add.rectangle(W/2, by, W - 40, 64, 0x0f1f0f).setStrokeStyle(2, 0x44aa44).setAlpha(0).setDepth(15),
        txt: this.add.text(W/2, by, lbl, { fontSize:'18px', color:'#cceecc', fontFamily:'serif' }).setOrigin(0.5).setAlpha(0).setDepth(16),
        i
      };
    });
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
    // PAUSEボタン（戦闘エリア右上 355-385, 0-30）
    if (x >= 355 && x <= 385 && y >= 0 && y <= 30) {
      if (!this.paused) this._pauseOpen();
      return;
    }
    if (this.paused && y < BATTLE_H) { this._pauseTap(x, y); return; }
    if (this.dialogActive) { this._dlgNext(); return; }
    if (this.dead) { this.scene.start('MainScene', { type:'new' }); return; }
    if (this._rmVis)  { this._rmTap(x, y);  return; }
    if (this._upgVis) { this._upgTap(x, y); return; }
    if (this._cpVis)  { this._cpTap(x, y);  return; }
    if (this.phase === 'result') { this._resTap(x, y); return; }

    // super button
    if (this.gaugeReady && Math.abs(x - SB_X) < 58 && Math.abs(y - SB_Y) < 22) {
      this._superAtk(); return;
    }

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
    for (const btn of this.resBtns) {
      const by = UI_Y0 + 100 + btn.i * 80;
      if (Math.abs(y - by) < 36) {
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
  }

  _resClose() {
    this.phase = 'battle';
    this.resBg.setAlpha(0); this.resTtl.setAlpha(0); this.resExp.setAlpha(0);
    this.resBagTxt.setAlpha(0);
    for (const b of this.resBtns) { b.bg.setAlpha(0); b.txt.setAlpha(0); }
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
      this.sBtnBg.setAlpha(1); this.sBtnTxt.setAlpha(1);
      this.tweens.add({ targets: [this.sBtnBg, this.sBtnTxt], alpha: { from:1, to:0.35 }, yoyo:true, repeat:-1, duration:450 });
    } else if (pct < 1.0 && this.gaugeReady) {
      this.gaugeReady = false;
      this.tweens.killTweensOf([this.sBtnBg, this.sBtnTxt]);
      this.sBtnBg.setAlpha(0); this.sBtnTxt.setAlpha(0);
    }
  }

  _superAtk() {
    this.gauge = 0; this._gaugeUp();
    for (const oni of this.onis.getChildren().filter(o => o.active)) {
      this._oniDmg(oni, SUPER_DMG);
    }
    this.ovBg.setAlpha(0.28);
    this.time.delayedCall(220, () => this.ovBg.setAlpha(0));
  }

  /* ── Charm auto-fire ────────────────────── */
  _useCharm(idx) {
    const c = this.slotCharms[idx];
    this.charmTimers[idx] = 0; this._cellUp(idx);
    fireCharm(c.id, this);
  }

  _spell(t, dmg, col, attr = 'none') {
    if (!t?.active) return;
    const sx = this._kbSX, sy = this._kbSY;
    const dx = t.x - sx, dy = t.y - sy, len = Math.hypot(dx, dy) || 1;
    const b = this.add.circle(sx, sy, 8, col || 0x44bbff).setDepth(3);
    b.vx = BUL_SPD * dx / len; b.vy = BUL_SPD * dy / len; b.dmg = dmg; b.attr = attr;
    this.bullets.add(b);
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
    const sy = Phaser.Math.Between(40, BATTLE_H - 40);
    this._makeOni(W, sy, named ? 48 : ONI_W, named ? 64 : ONI_H, col, stk, name, named ? '13px' : '20px', named ? '#ddaaff' : '#ffbbbb', hp, spd, dmg, bw, named ? EXP_N : EXP_G, false, imgKey, attr);
  }

  _spawnOgre() {
    // WAVE8-9：大鬼（isBoss=false）+ 小鬼の無限湧き、全滅でWAVEクリア
    const sy = Phaser.Math.Between(40, BATTLE_H - 40);
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
    // 各章末WAVE（10・20・30・40・50）でボス登場台詞を発火
    if (this.wave % 10 === 0 && SCENARIO) {
      const chap = SCENARIO.chapters[this.chapter - 1];
      if (chap && chap.boss_scene) {
        this._dlgShow(chap.boss_scene, null);
      }
    }
    const chapIdx = Math.min(this.chapter - 1, BOSS_NAMES_BY_CHAPTER.length - 1);
    const name = BOSS_NAMES_BY_CHAPTER[chapIdx];
    const BOSS_IMGS = ['oni-ura', 'oni-ibaraki', 'oni-shuten', 'oni-otake', 'oni-soranaki'];
    const bossImg = BOSS_IMGS[chapIdx] || 'oni-ura';
    const attrPool = ['fire', 'water', 'earth', 'wind'];
    const attr = this.wave >= 2 ? attrPool[Phaser.Math.Between(0, 3)] : 'none';
    // 脚が戦闘エリア下端(y=330)に来るようanchor中央を逆算
    const bossRatio = chapIdx === 4 ? 0.85 : 0.75;
    const sy = BATTLE_H - (BATTLE_H * bossRatio) / 2;
    this._makeOni(W, sy, 56, 84, 0x220044, 0xff33ff, `【${name}】`, '13px', '#ff88ff', BOSS_HP, BOSS_SPD, BOSS_DMG, 72, EXP_B, true, bossImg, attr);

    // ボス出現と同時に無限湧き：小鬼1500ms・中鬼4000ms、同時上限8体
    this._bossSpawnTimerKobuki = this.time.addEvent({
      delay: 1500, loop: true,
      callback: () => {
        if (!this.waveDone && this.onis.countActive(true) < 8) this._spawnBossGrunt(false);
      }
    });
    this._bossSpawnTimerNamed = this.time.addEvent({
      delay: 4000, loop: true,
      callback: () => {
        if (!this.waveDone && this.onis.countActive(true) < 8) this._spawnBossGrunt(true);
      }
    });
  }

  _spawnBossGrunt(named) {
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
    const sy = Phaser.Math.Between(40, BATTLE_H - 40);
    this._makeOni(W, sy, named ? 48 : ONI_W, named ? 64 : ONI_H, col, stk, nm, named ? '13px' : '20px', named ? '#ddaaff' : '#ffbbbb', hp, spd, dmg, bw, named ? EXP_N : EXP_G, false, imgKey, attr);
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
  }

  _oniRm(oni) { oni.lbl?.destroy(); oni.hpBg?.destroy(); oni.hpFill?.destroy(); oni.attrLbl?.destroy(); oni.destroy(); }

  _oniDmg(oni, rawDmg, atkAttr = 'none') {
    if (!oni.active) return;
    const mult = attrMult(atkAttr, oni.attr || 'none');
    const dmg = Math.max(1, Math.round(rawDmg * mult));
    oni.hp -= dmg;
    const r = Phaser.Math.Clamp(oni.hp / oni.maxHp, 0, 1);
    oni.hpFill.setDisplaySize(oni.bw * r, oni.barH);
    const col = mult >= 1.0 ? '#ffff44' : mult >= 0.75 ? '#ffffff' : '#888888';
    this._dmgNum(oni.x, oni.y - oni.hSz/2, dmg, col);
    if (oni.setTint) { oni.setTint(0xff4444); this.time.delayedCall(100, () => { if (oni?.active) oni.clearTint?.(); }); }
    if (oni.hp <= 0) {
      this.defeated++; this.totalExp += oni.exp;
      const wasBoss = oni.isBoss;
      const wasOgre = oni.isOgre;
      this._oniRm(oni);
      // 大鬼撃破：スポーンタイマー停止のみ。残小鬼も全滅したらupdateループでWAVEクリア
      if (wasOgre) this._stopBossTimers();
      // ネームドボス撃破：WAVEクリアフロー発火
      if (wasBoss) {
        this._stopBossTimers();
        if (!this.waveDone) this._waveClearBoss();
      }
    }
  }

  _dmgNum(x, y, dmg, col) {
    const t = this.add.text(x, y - 10, String(dmg), { fontSize:'17px', color: col || '#fff', stroke:'#000', strokeThickness:3, fontFamily:'Arial', fontStyle:'bold' }).setOrigin(0.5).setDepth(11);
    this.tweens.add({ targets: t, y: y - 52, alpha: 0, duration: 580, ease:'Power1', onComplete: () => t.destroy() });
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

  _bullet() {
    const list = this.onis.getChildren().filter(o => o.active);
    if (!list.length) return;
    const t = list.reduce((a, b) => a.x < b.x ? a : b);
    if (t.x - KB_X > BUL_RNG) return;
    const sx = this._kbSX, sy = this._kbSY;
    const dx = t.x - sx, dy = t.y - sy, len = Math.hypot(dx, dy) || 1;
    const b = this.add.circle(sx, sy, 8, 0x44bbff).setDepth(3);
    b.vx = BUL_SPD * dx / len; b.vy = BUL_SPD * dy / len; b.dmg = BUL_DMG;
    this.bullets.add(b);
  }

  /* ── Wave ───────────────────────────────── */
  _waveClear() {
    this.waveDone = true;
    this._saveGame();
    this._ov('WAVE CLEAR!', '#ffff44', `WAVE ${this.wave} 撃退成功！`);
    this.time.delayedCall(1800, () => { this._ovHide(); this._resOpen(); });
  }

  _waveClearBoss() {
    this.waveDone = true;
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
    this.wave++;
    this.chapter = Math.ceil(this.wave / 10);
    this.spawned = this.defeated = this.spawnTimer = 0;
    this.waveDone = this.bossSpawned = false;
    this._gridUp();
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
    });
  }

  /* ── UI refresh ─────────────────────────── */
  _hdrUp() {
    this.hpTxt.setText(`HP: ${this.kbHP}/${this.kbHPMax}`);
    this.expTxt.setText(`EXP: ${this.totalExp}`);
    this.waveTxt.setText(`WAVE ${this.wave}`);
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

  /* ── Pause ──────────────────────────────── */
  _pauseBuild() {
    // 戦闘エリアのみ暗転
    this._pauseOv = this.add.rectangle(W/2, BATTLE_H/2, W, BATTLE_H, 0x000000, 0.7).setDepth(35).setVisible(false);
    // 4項目を戦闘エリア中央に配置（50px間隔、計150px、中心 BATTLE_H/2=165）
    const baseY = BATTLE_H / 2 - 75;
    const labels = ['再開', 'BGM：ON', 'SE：ON', 'タイトルへ'];
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
    this._pauseItems[1].setText(`BGM：${this.bgmOn ? 'ON' : 'OFF'}`);
    this._pauseItems[2].setText(`SE：${this.seOn ? 'ON' : 'OFF'}`);
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
            this.scene.physics.pause?.();
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
        else if (i === 1) { this.bgmOn = !this.bgmOn; this._pauseItems[1].setText(`BGM：${this.bgmOn ? 'ON' : 'OFF'}`); }
        else if (i === 2) { this.seOn  = !this.seOn;  this._pauseItems[2].setText(`SE：${this.seOn  ? 'ON' : 'OFF'}`); }
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
    if (this._lpActive) return; // ツールチップ表示中はタイマーをリセットしない
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
