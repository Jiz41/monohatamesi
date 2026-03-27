'use strict';

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

    this.dialogActive  = false;
    this._dlgLines     = [];
    this._dlgIdx       = 0;
    this._dlgOnComplete = null;

    /* ── 背景（漆黒） ────────────────────────── */
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000).setDepth(0);

    /* ── ダイアログUI構築 ─────────────────────── */
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

  /* ── 戦闘ループ開始（骨格のみ） ─────────────── */
  _battleStart() {
    // TODO: 1-B 以降で実装
  }

  update(_t, _dt) {}

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
    this.tweens.killAll();
  }
}
