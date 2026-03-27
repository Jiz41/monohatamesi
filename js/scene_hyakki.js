'use strict';

/* ── HyakkiScene 敵定数 ────────────────────── */
const HK_GRUNT = { baseHP: 160, baseDmg: 167 };
const HK_NAMED = { baseHP: 480, baseDmg: 251 };
const HK_OGRE  = { baseHP: 800, baseDmg: 334 };
const HK_BG_COLORS  = [0x8B0000, 0x4A0000, 0x4A2000, 0x2A0040, 0x1A0010];
const HK_BOSS_NAMES = ['温羅', '茨木童子', '酒呑童子', '大嶽丸'];

class HyakkiScene extends Phaser.Scene {
  constructor() { super({ key: 'HyakkiScene' }); }

  preload() {}

  create() {
    /* ── 初期ステータス ─────────────────────── */
    this.wave          = 1;
    this.kbHP          = 500;
    this.kbHPMax       = 500;
    this.slashDmg      = 10;
    this.totalExp      = 0;
    this.unlockedSlots = 3;
    this.slotCharms    = new Array(9).fill(null);
    this.charmTimers   = new Array(9).fill(0);
    this.bagCharms     = [];
    this.selectedUltId = 'kaguya';
    this.playerDmgMult = 1.0;
    this.waveDone      = false;
    this.upgradeCounts = { hp: 0, slash: 0, cast: 0, slot: 0 };

    this.dialogActive        = false;
    this._dlgLines           = [];
    this._dlgIdx             = 0;
    this._dlgOnComplete      = null;
    this._waveTimer          = null;
    this._spawnTimer         = null;
    this._enemies            = [];
    this._restActive         = false;
    this._upgVis             = false;
    this._cpVis              = false;
    this._bossWarnFlashTimer = null;
    this._bossWarnShakeTimer = null;

    /* ── 背景オーバーレイ ─────────────────────── */
    this.bgOverlay = this.add.graphics().setDepth(0);
    this._bgUp();

    /* ── ヘッダー（WAVE / HP） ───────────────── */
    this._hdrBuild();

    /* ── ボスHPバー（初期非表示） ────────────── */
    this._bossHpBarBg = this.add.rectangle(W / 2, 32, W - 40, 12, 0x220000)
      .setAlpha(0).setDepth(6);
    this._bossHpBar   = this.add.rectangle(20, 32, W - 40, 12, 0xff3333)
      .setAlpha(0).setOrigin(0, 0.5).setDepth(7);
    this._bossNameTxt = this.add.text(W / 2, 48, '', {
      fontSize: '13px', color: '#ff88ff', fontFamily: 'serif',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setAlpha(0).setDepth(7);

    /* ── 強化UI ──────────────────────────────── */
    this._upgBuild();

    /* ── 呪符選択UI ──────────────────────────── */
    this._cpBuild();

    /* ── ダイアログUI ─────────────────────────── */
    this._dlgBuild();

    /* ── タップ入力 ──────────────────────────── */
    this.input.on('pointerdown', (ptr) => {
      const { x, y } = ptr;
      if (this.dialogActive) { this._dlgNext(); return; }
      if (this._cpVis)       { this._cpTap(x, y);  return; }
      if (this._upgVis)      { this._upgTap(x, y); return; }
      if (y < BATTLE_H)      { this._doSlash(); return; }
    });

    /* ── shutdown フック ─────────────────────── */
    this.events.on('shutdown', () => this.shutdown());

    /* ── 冒頭セリフ → 戦闘開始 ──────────────── */
    const openingLines = [
      { speaker: 'キビツ', text: '夢を見ていたのか……' },
      { speaker: 'キビツ', text: '甘ったれたものだ……' },
      { speaker: 'キビツ', text: '咎が終わるはずもなかろう。' },
      { speaker: 'キビツ', text: 'さあ、殺し合おう。' },
    ];
    this._dlgShow(openingLines, () => this._battleStart());
  }

  /* ── スケール式 ──────────────────────────── */
  _getScale(wave) {
    return 1 + Math.sqrt(wave) * 0.3;
  }

  /* ── 漢数字変換 ─────────────────────────── */
  _toKanji(n) {
    const units = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const tens  = ['', '十', '二十', '三十', '四十', '五十',
                   '六十', '七十', '八十', '九十'];
    if (n < 10)  return units[n];
    if (n < 100) return tens[Math.floor(n / 10)] + units[n % 10];
    return String(n);
  }

  /* ── ヘッダーUI ──────────────────────────── */
  _hdrBuild() {
    this._hpTxt = this.add.text(14, 12, '', {
      fontSize: '14px', color: '#88ffaa', fontFamily: 'Arial',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0, 0).setDepth(5);
    this._waveTxt = this.add.text(W / 2, 12, '', {
      fontSize: '18px', color: '#ffcc88', fontFamily: 'serif', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(5);
    this._hdrUp();
    this._waveUiUp();
  }

  _hdrUp() {
    this._hpTxt.setText(`HP: ${this.kbHP}/${this.kbHPMax}`);
  }

  _waveUiUp() {
    this._waveTxt.setText(`第${this._toKanji(this.wave)}波`);
  }

  /* ── 背景色更新 ─────────────────────────── */
  _bgUp() {
    const idx = Math.floor(((this.wave - 1) % 250) / 50);
    this.bgOverlay.clear();
    this.bgOverlay.fillStyle(HK_BG_COLORS[idx], 1);
    this.bgOverlay.fillRect(0, 0, W, H);
  }

  /* ── 戦闘ループ開始 ─────────────────────── */
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
        if (!this._restActive && this._enemies.length < 8) this._spawnEnemy();
      },
    });
  }

  /* ── 敵スポーン ─────────────────────────── */
  _spawnEnemy() {
    const sc  = this._getScale(this.wave);
    let base;
    if      (this.wave >= 80) base = HK_OGRE;
    else if (this.wave >= 20) base = (Math.random() < 0.3) ? HK_NAMED : HK_GRUNT;
    else                      base = HK_GRUNT;

    const hp  = Math.round(base.baseHP  * sc);
    const dmg = Math.round(base.baseDmg * sc);
    const spd = 30 + this.wave * 0.5;
    const sy  = Phaser.Math.Between(40, BATTLE_H - 20);
    const col = base === HK_OGRE  ? 0xff8833
              : base === HK_NAMED ? 0xcc88ff
              :                     0xff4444;

    const rect  = this.add.rectangle(W + 20, sy, 28, 28, col).setDepth(3);
    const hpBar = this.add.rectangle(W + 20, sy - 20, 28, 4, 0x22dd55)
      .setOrigin(0, 0.5).setDepth(4);
    this._enemies.push({ rect, hpBar, hp, maxHp: hp, dmg, spd, isBoss: false });
  }

  /* ── 斬撃（バトルエリアタップ → 最左敵） ──── */
  _doSlash() {
    if (!this._enemies.length) return;
    const t = this._enemies.reduce((a, b) => a.rect.x < b.rect.x ? a : b);
    t.hp -= this.slashDmg;
    const r = Math.max(0, t.hp / t.maxHp);
    t.hpBar.setDisplaySize(28 * r, 4)
           .setFillStyle(r > 0.5 ? 0x22dd55 : r > 0.25 ? 0xffcc00 : 0xff3333);
    if (t.isBoss) {
      this._bossHpBar.setDisplaySize((W - 40) * r, 12);
    }
    if (t.hp <= 0) {
      const idx = this._enemies.indexOf(t);
      if (idx !== -1) {
        const wasBoss = t.isBoss;
        t.rect.destroy(); t.hpBar.destroy();
        this._enemies.splice(idx, 1);
        if (wasBoss) this._bossDefeated();
      }
    }
  }

  /* ── 10WAVE休憩 ──────────────────────────── */
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

  /* ── 50WAVEボス ──────────────────────────── */
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

    this.tweens.add({ targets: overlay, alpha: 0.88, duration: 500,
      onComplete: () => {
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
      },
    });
  }

  _bossSpawn() {
    const nameIdx = Phaser.Math.Between(0, HK_BOSS_NAMES.length - 1);
    const name    = HK_BOSS_NAMES[nameIdx];
    const sc      = this._getScale(this.wave);
    const hp      = Math.round(BOSS_HP  * sc);
    const dmg     = Math.round(BOSS_DMG * sc);
    const sy      = Phaser.Math.Between(80, BATTLE_H - 50);

    const rect  = this.add.rectangle(W + 30, sy, 48, 48, 0xff33ff).setDepth(3);
    const hpBar = this.add.rectangle(W + 30, sy - 32, 48, 6, 0xff3333)
      .setOrigin(0, 0.5).setDepth(4);
    this._enemies.push({ rect, hpBar, hp, maxHp: hp, dmg, spd: 20, isBoss: true, name });

    this._bossHpBarBg.setAlpha(1);
    this._bossHpBar.setAlpha(1).setDisplaySize(W - 40, 12);
    this._bossNameTxt.setText(`【${name}】`).setAlpha(1);
  }

  _bossDefeated() {
    this._bossHpBarBg.setAlpha(0);
    this._bossHpBar.setAlpha(0);
    this._bossNameTxt.setAlpha(0);
    // 呪符選択 → 強化 → HP回復 → 戦闘再開
    this._cpOpen(() => {
      this._upgOpen(() => {
        this.kbHP = this.kbHPMax;
        this._hdrUp();
        this._restEnd();
      });
    });
  }

  /* ── 敵全クリア ─────────────────────────── */
  _clearEnemies() {
    for (const e of this._enemies) { e.rect.destroy(); e.hpBar.destroy(); }
    this._enemies = [];
    this._bossHpBarBg.setAlpha(0);
    this._bossHpBar.setAlpha(0);
    this._bossNameTxt.setAlpha(0);
  }

  /* ── ゲームオーバー ─────────────────────── */
  _gameOver() {
    this._clearEnemies();
    if (this._spawnTimer) { this._spawnTimer.remove(false); this._spawnTimer = null; }
    if (this._waveTimer)  { this._waveTimer.remove(false);  this._waveTimer  = null; }
    this.scene.start('TitleScene');
  }

  /* ── 強化UI ──────────────────────────────── */
  _upgBuild() {
    const b = UI_Y0;
    this._upgBg   = this.add.rectangle(W / 2, b + UI_H / 2, W, UI_H, 0x050308).setAlpha(0).setDepth(17);
    this._upgTtl  = this.add.text(W / 2, b + 18, 'キビツを強化する', {
      fontSize: '17px', color: '#ffcc88', fontFamily: 'serif', fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0).setDepth(18);
    this._upgExpTxt = this.add.text(W / 2, b + 44, '', {
      fontSize: '13px', color: '#aaeeaa', fontFamily: 'Arial',
    }).setOrigin(0.5).setAlpha(0).setDepth(18);
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
    this._upgSkip       = this.add.text(W / 2, b + 430, 'スキップ', { fontSize: '14px', color: '#665566', fontFamily: 'Arial' }).setOrigin(0.5).setAlpha(0).setDepth(19);
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
      const cost      = this._upgCost(b.item.key);
      const costLabel = disabled ? '（上限到達）' : `[${cost} EXP]`;
      b.lbl.setText(`${b.item.label}  ${costLabel}`)
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
    else if (key === 'slot') { this.unlockedSlots = Math.min(9, this.unlockedSlots + 1); }
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
    this._cpTtl = this.add.text(W / 2, b + 18, '呪符を選ぶ（3択）', {
      fontSize: '16px', color: '#88ccff', fontFamily: 'serif', fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0).setDepth(18);
    this._cpBtns = [];
    for (let i = 0; i < 3; i++) {
      const by = b + 70 + i * 110;
      this._cpBtns.push({
        bg:  this.add.rectangle(W / 2, by, W - 36, 96, 0x0a1520).setStrokeStyle(2, 0x3366aa).setAlpha(0).setDepth(18),
        nm:  this.add.text(W / 2, by - 22, '', { fontSize: '16px', color: '#88ccff', fontFamily: 'serif', fontStyle: 'bold' }).setOrigin(0.5).setAlpha(0).setDepth(19),
        ds:  this.add.text(W / 2, by + 8,  '', { fontSize: '12px', color: '#aabbcc', fontFamily: 'Arial', align: 'center' }).setOrigin(0.5).setAlpha(0).setDepth(19),
        charm: null,
      });
    }
    this._cpSkip       = this.add.text(W / 2, b + 420, 'スキップ', { fontSize: '14px', color: '#556655', fontFamily: 'Arial' }).setOrigin(0.5).setAlpha(0).setDepth(19);
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

  /* ── update ─────────────────────────────── */
  update(_t, dt) {
    if (this.dialogActive) return;
    for (let i = this._enemies.length - 1; i >= 0; i--) {
      const e = this._enemies[i];
      e.rect.x -= e.spd * (dt / 1000);
      e.hpBar.x  = e.rect.x;
      e.hpBar.y  = e.rect.y - 22;
      // プレイヤー到達 → ダメージ
      if (e.rect.x < 60) {
        this.kbHP = Math.max(0, this.kbHP - e.dmg);
        this._hdrUp();
        e.rect.destroy(); e.hpBar.destroy();
        this._enemies.splice(i, 1);
        if (this.kbHP <= 0) { this._gameOver(); return; }
      }
    }
  }

  /* ── Dialog ─────────────────────────────── */
  _dlgBuild() {
    const boxH  = 120;
    const boxCY = BATTLE_H - boxH / 2;
    this._dlgBg = this.add.rectangle(W / 2, boxCY, W, boxH, 0x000000)
      .setAlpha(0).setDepth(20);
    this._dlgLine = this.add.rectangle(W / 2, BATTLE_H - boxH, W, 2, 0x445544)
      .setAlpha(0).setDepth(20);
    this._dlgSpeakerTxt = this.add.text(14, BATTLE_H - boxH + 10, '', {
      fontSize: '17px', color: '#ffdd88',
      fontFamily: 'serif', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 2,
    }).setAlpha(0).setDepth(21);
    this._dlgBodyTxt = this.add.text(14, BATTLE_H - boxH + 30, '', {
      fontSize: '18px', color: '#ffffff',
      fontFamily: 'serif',
      stroke: '#000', strokeThickness: 2,
    }).setAlpha(0).setDepth(21);
    this._dlgIndTxt = this.add.text(W - 12, BATTLE_H - 10, '▼', {
      fontSize: '13px', color: '#aaaaaa', fontFamily: 'Arial',
    }).setOrigin(1, 1).setAlpha(0).setDepth(21);
    this._dlgIndTween = this.tweens.add({
      targets: this._dlgIndTxt,
      alpha: { from: 0.25, to: 1.0 },
      yoyo: true, repeat: -1, duration: 550, paused: true,
    });
  }

  _dlgShow(lines, onComplete) {
    this._dlgLines      = lines;
    this._dlgIdx        = 0;
    this._dlgOnComplete = onComplete || null;
    this.dialogActive   = true;
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
      .setStyle({ fontSize: '18px', color: '#ffffff', fontFamily: 'serif',
                  fontStyle: 'normal', align: 'left',
                  stroke: '#000', strokeThickness: 2 })
      .setText(this._kinsokuWrap(line.text, W - 28, '18px serif'))
      .setAlpha(1);
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

  _kinsokuWrap(text, maxPx, fontStr) {
    const KINSOKU = new Set([
      '。','、','，','．','・','：','；','？','！',
      '）','〕','】','』','」','〉','》','…','ー',
      'っ','ッ','ぁ','ァ','ぃ','ィ','ぅ','ゥ','ぇ','ェ','ぉ','ォ',
      'ゃ','ャ','ゅ','ュ','ょ','ョ','ゎ','ヮ',
    ]);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = fontStr;
    const lines = [];
    let cur = '', curW = 0;
    for (const ch of text) {
      if (ch === '\n') { lines.push(cur); cur = ''; curW = 0; continue; }
      const cw = ctx.measureText(ch).width;
      if (curW + cw > maxPx) {
        if (KINSOKU.has(ch)) {
          lines.push(cur + ch); cur = ''; curW = 0;
        } else {
          lines.push(cur); cur = ch; curW = cw;
        }
      } else {
        cur += ch; curW += cw;
      }
    }
    if (cur) lines.push(cur);
    return lines.join('\n');
  }

  /* ── Shutdown ───────────────────────────── */
  shutdown() {
    if (this._bossWarnFlashTimer) { this._bossWarnFlashTimer.remove(false); this._bossWarnFlashTimer = null; }
    if (this._bossWarnShakeTimer) { this._bossWarnShakeTimer.remove(false); this._bossWarnShakeTimer = null; }
    if (this._waveTimer)  { this._waveTimer.remove(false);  this._waveTimer  = null; }
    if (this._spawnTimer) { this._spawnTimer.remove(false); this._spawnTimer = null; }
    for (const e of this._enemies) { e.rect.destroy(); e.hpBar.destroy(); }
    this._enemies = [];
    this.tweens.killAll();
  }
}
