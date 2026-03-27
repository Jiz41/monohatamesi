'use strict';

/* ── Enemy base values ─────────────────────── */
const HK_GRUNT = { baseHP: 160, baseDmg: 167 };
const HK_NAMED = { baseHP: 480, baseDmg: 251 };
const HK_OGRE  = { baseHP: 800, baseDmg: 334 };

/* ── Background color table (50-wave bands) ── */
const HK_BG_COLORS = [0x8B0000, 0x4A0000, 0x4A2000, 0x2A0040, 0x1A0010];

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

    this.dialogActive   = false;
    this._dlgLines      = [];
    this._dlgIdx        = 0;
    this._dlgOnComplete = null;
    this._waveTimer     = null;
    this._spawnTimer    = null;
    this._enemies       = [];

    /* ── 背景オーバーレイ ─────────────────────── */
    this.bgOverlay = this.add.graphics().setDepth(0);
    this._bgUp();

    /* ── WAVE表示 ─────────────────────────────── */
    this._waveTxt = this.add.text(W / 2, 12, '', {
      fontSize: '18px', color: '#ffcc88',
      fontFamily: 'serif', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(5);
    this._waveUiUp();

    /* ── ダイアログUI ─────────────────────────── */
    this._dlgBuild();

    /* ── タップ入力 ──────────────────────────── */
    this.input.on('pointerdown', () => {
      if (this.dialogActive) { this._dlgNext(); return; }
    });

    /* ── shutdown フック ─────────────────────── */
    this.events.on('shutdown', () => this.shutdown());

    /* ── 冒頭セリフ → 戦闘ループ開始 ──────────── */
    const openingLines = [
      { speaker: 'キビツ', text: '夢を見ていたのか……' },
      { speaker: 'キビツ', text: '甘ったれたものだ……' },
      { speaker: 'キビツ', text: '咎が終わるはずもなかろう。' },
      { speaker: 'キビツ', text: 'さあ、殺し合おう。' },
    ];
    this._dlgShow(openingLines, () => this._battleStart());
  }

  /* ── 敵スケール式 ────────────────────────── */
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

  /* ── 戦闘ループ開始 ─────────────────────── */
  _battleStart() {
    // 30秒ごとにWAVE進行
    this._waveTimer = this.time.addEvent({
      delay: 30000, loop: true,
      callback: () => {
        this.wave++;
        this._bgUp();
        this._waveUiUp();
      },
    });

    // 1500msごとにスポーン（同時8体上限）
    this._spawnTimer = this.time.addEvent({
      delay: 1500, loop: true,
      callback: () => {
        if (this._enemies.length < 8) this._spawnEnemy();
      },
    });
  }

  /* ── 敵スポーン ─────────────────────────── */
  _spawnEnemy() {
    const sc = this._getScale(this.wave);
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
    const hpBar = this.add.rectangle(W + 20, sy - 20, 28, 4, 0x22dd55).setDepth(4);
    this._enemies.push({ rect, hpBar, hp, maxHp: hp, dmg, spd });
  }

  /* ── 背景色更新 ─────────────────────────── */
  _bgUp() {
    const idx = Math.floor(((this.wave - 1) % 250) / 50);
    this.bgOverlay.clear();
    this.bgOverlay.fillStyle(HK_BG_COLORS[idx], 1);
    this.bgOverlay.fillRect(0, 0, W, H);
  }

  /* ── WAVE UI更新 ─────────────────────────── */
  _waveUiUp() {
    this._waveTxt.setText(`第${this._toKanji(this.wave)}波`);
  }

  update(_t, dt) {
    if (this.dialogActive) return;
    for (let i = this._enemies.length - 1; i >= 0; i--) {
      const e = this._enemies[i];
      e.rect.x -= e.spd * (dt / 1000);
      e.hpBar.x  = e.rect.x;
      e.hpBar.y  = e.rect.y - 20;
      if (e.rect.x < -30) {
        e.rect.destroy();
        e.hpBar.destroy();
        this._enemies.splice(i, 1);
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
    if (this._waveTimer)  { this._waveTimer.remove(false);  this._waveTimer  = null; }
    if (this._spawnTimer) { this._spawnTimer.remove(false); this._spawnTimer = null; }
    for (const e of this._enemies) {
      if (e.rect)  e.rect.destroy();
      if (e.hpBar) e.hpBar.destroy();
    }
    this._enemies = [];
    this.tweens.killAll();
  }
}
