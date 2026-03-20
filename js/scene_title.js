'use strict';

/* ══════════════════════════════════════════════ */
class TitleScene extends Phaser.Scene {
  constructor() { super({ key: 'TitleScene' }); }

  preload() {
    this.load.image('op_bg',      'op.jpg');
    this.load.image('title_logo', 'title.png');
    this.load.audio('title_bgm',  'kibitsureact.mp3');
    this.load.on('loaderror', (file) => {
      console.warn('load error:', file.key);
    });
  }

  create() {
    this._opts    = loadOpts();
    this._hasSave = !!loadGame();
    this._opZoomDone = false;
    this._zoomTween  = null;
    this._bgm = this.cache.audio.has('title_bgm')
      ? this.sound.add('title_bgm', { loop: true, volume: 0.7 })
      : null;

    /* ── OP背景（op.jpg） ── */
    this._opBg = this.add.image(W / 2, H / 2, 'op_bg').setDepth(0).setAlpha(0);
    // 縦横比を維持して画面全体をcoverするスケールを計算
    {
      const src = this.textures.get('op_bg').getSourceImage();
      this._opBaseScale = (src.width > 0 && src.height > 0)
        ? Math.max(W / src.width, H / src.height)
        : 1;
    }
    this._opBg.setScale(this._opBaseScale);

    /* ── 黒帯（ワイプ対象・グローなし） ── */
    this._opLogoBg = this.add.rectangle(W / 2, H * 0.35, W, H * 0.28, 0x000000, 0.55)
      .setDepth(1).setAlpha(0);

    /* ── ロゴ画像（ワイプ対象・グローあり） ── */
    this._opLogo = this.add.image(W / 2, H * 0.35, 'title_logo')
      .setDepth(2).setAlpha(0);
    if (this._opLogo.width > 0) {
      this._opLogo.setScale((W * 0.75) / this._opLogo.width);
    }

    /* ── 制作クレジット ── */
    this._opCreditTxt = this.add.text(W / 2, H * 0.88, '制作：華耀東夷堂', {
      fontSize: '13px', color: '#998877', fontFamily: 'serif'
    }).setOrigin(0.5).setDepth(2).setAlpha(0);

    /* ── 画面押下セヨ ── */
    this._opTapLbl = this.add.text(W / 2, H * 0.68, '画面押下セヨ', {
      fontSize: '28px', color: '#88ffcc', fontFamily: 'serif',
      shadow: { offsetX: 0, offsetY: 0, color: '#ffffff', blur: 10, fill: true }
    }).setOrigin(0.5).setDepth(2).setAlpha(0);
    this._blinkTw = null;

    /* ── タイトルメニュー ── */
    this._titleObjs = [];
    this._titleObjs.push(this.add.rectangle(W/2, H/2, W, H, 0x060c08).setDepth(0));
    this._titleObjs.push(this.add.text(W/2, 170, '吉備津彦  鬼退治', {
      fontSize:'26px', color:'#ddcc44', fontFamily:'serif', fontStyle:'bold', stroke:'#000', strokeThickness:5
    }).setOrigin(0.5).setDepth(1));
    this._menuBtns = [
      { label:'はじめから', key:'new',  y:360 },
      { label:'つづきから', key:'cont', y:470 },
      { label:'オプション', key:'opts', y:580 },
    ].map(item => {
      const grey = item.key === 'cont' && !this._hasSave;
      const bg  = this.add.rectangle(W/2, item.y, 280, 70, grey ? 0x111111 : 0x0f1e10)
                    .setStrokeStyle(2, grey ? 0x333333 : 0x44aa44).setDepth(1);
      const txt = this.add.text(W/2, item.y, item.label, {
        fontSize:'22px', color: grey ? '#444444' : '#cceecc', fontFamily:'serif'
      }).setOrigin(0.5).setDepth(2);
      this._titleObjs.push(bg, txt);
      return { bg, txt, key: item.key, grey, y: item.y };
    });

    /* ── オプション ── */
    this._optsObjs = [];
    this._optsObjs.push(this.add.rectangle(W/2, H/2, W, H, 0x060c08).setDepth(0));
    this._optsObjs.push(this.add.text(W/2, 210, 'オプション', {
      fontSize:'26px', color:'#ffdd88', fontFamily:'serif', fontStyle:'bold'
    }).setOrigin(0.5).setDepth(1));
    this._optBtns = [
      { label:'BGM', key:'bgm', y:370 },
      { label:'SE',  key:'se',  y:480 },
    ].map(item => {
      const bg  = this.add.rectangle(W/2, item.y, 280, 70, 0x0a1822).setStrokeStyle(2, 0x336688).setDepth(1);
      const lbl = this.add.text(W/2 - 70, item.y, item.label, { fontSize:'22px', color:'#aaccff', fontFamily:'serif' }).setOrigin(0.5).setDepth(2);
      const val = this.add.text(W/2 + 70, item.y, 'ON', { fontSize:'22px', color:'#44ffaa', fontFamily:'Arial', fontStyle:'bold' }).setOrigin(0.5).setDepth(2);
      this._optsObjs.push(bg, lbl, val);
      return { bg, lbl, val, key: item.key, y: item.y };
    });
    this._optsCnl = this.add.text(W/2, 630, '戻る', { fontSize:'18px', color:'#667766', fontFamily:'Arial' }).setOrigin(0.5).setDepth(2);
    this._optsObjs.push(this._optsCnl);

    // タイトル・オプションは初期非表示
    [...this._titleObjs, ...this._optsObjs].forEach(o => o.setAlpha(0));

    /* ── ターミナル演出オブジェクト（depth 20で最前面） ── */
    this._termBg = this.add.rectangle(W/2, H/2, W, H, 0x000000).setDepth(20);
    this._termScroll = this.add.text(16, 16, '', {
      fontSize: '12px', color: '#00ff00', fontFamily: 'monospace',
      lineSpacing: 4, wordWrap: { width: W - 32 }
    }).setDepth(21);
    this._termTypeLine = this.add.text(16, 258, '', {
      fontSize: '14px', color: '#00ff00', fontFamily: 'monospace'
    }).setDepth(21).setAlpha(0);
    this._termCredit = this.add.text(W / 2, 280, '', {
      fontSize: '42px', color: '#00ff00', fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(21).setAlpha(0);
    this._termPush = this.add.text(W/2, H - 48, 'PUSH', {
      fontSize: '18px', color: '#ff9900', fontFamily: 'monospace',
      shadow: { offsetX: 0, offsetY: 0, color: '#ff9900', blur: 8, fill: true }
    }).setOrigin(0.5).setDepth(21).setAlpha(0);
    this._termPushTw = null;
    this._termReady  = false;

    this.input.on('pointerdown', p => this._tap(p));
    this._startTerminal();
  }

  /* ── ターミナル演出 ──────────────────────── */
  _startTerminal() {
    this._phase     = 'terminal';
    this._termReady = false;
    this._termCursorTimer = null;
    [this._termBg, this._termScroll, this._termTypeLine, this._termCredit, this._termPush]
      .forEach(o => o.setVisible(true));
    this._termScroll.setText('').setAlpha(1);
    this._termTypeLine.setAlpha(0);
    this._termCredit.setAlpha(0);
    this._termPush.setAlpha(0);

    const LINES = [
      'SYSTEM: UNKNOWN',
      'USER: UNREGISTERED',
      'ORIGIN: UNCLASSIFIED',
      '/'.repeat(19),
      'LOADING... FAILED',
      'LOADING... FAILED',
      'LOADING... OK',
      '/'.repeat(19),
      'CLASSIFICATION: NULL',
      'BELONGING: NULL',
      'AUTHORIZATION: NONE',
      '\\'.repeat(19),
      'WARNING: DOES NOT FIT',
      'WARNING: DOES NOT FIT',
      'WARNING: DOES NOT FIT',
      '/'.repeat(19),
      'PENALTY_LOG: OVERFLOW',
      'PARDON_LOG: 0',
      '\\'.repeat(19),
      'CORE_FUNCTION: CREATE',
      'CORE_FUNCTION: CREATE',
      'CORE_FUNCTION: CREATE',
      '/'.repeat(19),
      'CONNECTING TO MUSHYN_REAGAN...',
      'CONNECTED.',
      'STATUS: STILL RUNNING',
    ];

    // 全文字数をもとに ms/文字を逆算して3秒以内に収める
    const totalChars = LINES.reduce((s, l) => s + l.length, 0);
    const MS = Math.max(1, Math.floor(2700 / totalChars)); // 行間余白分を除いた2700ms
    const LINE_GAP = Math.max(10, Math.floor(300 / LINES.length));

    const MAX_ROWS = 30;
    let lineIdx = 0, charIdx = 0;
    const rows = [];

    const tick = () => {
      if (lineIdx >= LINES.length) { this._termTypewriter(rows, MAX_ROWS); return; }
      const line = LINES[lineIdx];
      charIdx++;
      this._termScroll.setText([...rows, line.slice(0, charIdx)].slice(-MAX_ROWS).join('\n'));
      if (charIdx >= line.length) {
        rows.push(line);
        lineIdx++;
        charIdx = 0;
        this.time.delayedCall(LINE_GAP, tick);
      } else {
        this.time.delayedCall(MS, tick);
      }
    };
    tick();
  }

  _termTypewriter(rows, maxRows) {
    const base = 'KAYOUTOUIDOU';
    let i = 0;
    this._termScroll.setText([...rows, '_'].slice(-maxRows).join('\n'));

    const tick = () => {
      i++;
      this._termScroll.setText([...rows, base.slice(0, i) + '_'].slice(-maxRows).join('\n'));
      if (i >= base.length) {
        // カーソル点滅してから変換へ
        let vis = true, cnt = 0;
        this._termCursorTimer = this.time.addEvent({
          delay: 200, repeat: 5,
          callback: () => {
            vis = !vis; cnt++;
            this._termScroll.setText([...rows, vis ? base + '_' : base].slice(-maxRows).join('\n'));
            if (cnt >= 5) { this._termCursorTimer = null; this._termConvert(rows, maxRows); }
          }
        });
      } else {
        this.time.delayedCall(150, tick);
      }
    };
    this.time.delayedCall(150, tick);
  }

  _termConvert(rows, maxRows) {
    const stages = [
      'PRODUCER: KAYOUTOUIDOU',
      'PRODUCER: かようとういどう',
      'PRODUCER: 華耀東夷堂',
    ];
    let idx = 0;
    const show = () => {
      this._termScroll.setText([...rows, stages[idx]].slice(-maxRows).join('\n'));
      idx++;
      if (idx < stages.length) {
        this.time.delayedCall(500, show);
      } else {
        this.time.delayedCall(500, () => this._termShowPush());
      }
    };
    show();
  }

  _termShowPush() {
    this._termReady = true;
    let vis = true;
    this._termPush.setAlpha(1);
    this._termPushTw = this.time.addEvent({
      delay: 500, repeat: -1,
      callback: () => { vis = !vis; this._termPush.setAlpha(vis ? 1 : 0); }
    });
  }

  _terminalHide() {
    if (this._termPushTw) { this._termPushTw.destroy(); this._termPushTw = null; }
    if (this._termCursorTimer) { this._termCursorTimer.remove(false); this._termCursorTimer = null; }
    [this._termBg, this._termScroll, this._termTypeLine, this._termCredit, this._termPush]
      .forEach(o => o.setAlpha(0).setVisible(false));
  }

  /* ── OP演出 ─────────────────────────────── */
  _startOp() {
    this._phase      = 'op';
    this._opZoomDone = false;

    // 足元アップ：coverスケールの1.6倍でズームイン、画像下端を画面底に合わせる
    const zoomFactor = 1.6;
    const startScale = this._opBaseScale * zoomFactor;
    // 画像の自然サイズ × startScale = 表示高さ。下端をHに合わせるにはyを上方向にシフト
    const startY = H - (this._opBg.height * startScale) / 2;

    this._opBg.setScale(startScale).setY(startY).setAlpha(1);
    this._opLogoBg.clearMask().setAlpha(0);
    this._opLogo.clearMask().setCrop().setAlpha(0);
    this._opCreditTxt.setAlpha(0);
    this._opTapLbl.setAlpha(0);
    this._blinkStop();

    // ズームアウトトゥイーン（3〜4秒）：coverスケールまで戻して全景表示
    this._zoomTween = this.tweens.add({
      targets:  this._opBg,
      y:        H / 2,
      scale:    this._opBaseScale,
      duration: 4000,
      ease:     'Sine.easeInOut',
      onComplete: () => { this._zoomTween = null; this._opZoomComplete(); }
    });
  }

  // タップによるズームスキップ
  _opSkipZoom() {
    if (this._zoomTween) { this._zoomTween.stop(); this._zoomTween = null; }
    this._opBg.setY(H / 2).setScale(this._opBaseScale);
    this._opZoomComplete();
  }

  // ズームアウト完了 → ロゴ＋黒帯を上から下へワイプ表示
  _opZoomComplete() {
    this._opZoomDone = true;

    this._opLogoBg.setAlpha(1);
    this._opLogo.setAlpha(1);

    const totalH   = Math.max(H * 0.28, this._opLogo.displayHeight);
    const topY     = H * 0.35 - totalH / 2;
    const logoTexW = this._opLogo.width;
    const logoTexH = this._opLogo.height;

    // 黒帯: GeometryMask でワイプ（不透明なので問題なし）
    const maskGfx = this.make.graphics({ add: false });
    const mask    = maskGfx.createGeometryMask();
    this._opLogoBg.setMask(mask);

    // ロゴ: setCrop でワイプ（透明PNG に GeometryMask を使うとRTT背景グレーが出るため不可）
    this._opLogo.setCrop(0, 0, logoTexW, 0);

    this.tweens.addCounter({
      from: 0, to: totalH,
      duration: 3000,
      ease: 'Sine.easeIn',
      onUpdate: (tween) => {
        const h = tween.getValue();
        // 黒帯マスク更新
        maskGfx.clear();
        maskGfx.fillStyle(0xffffff);
        maskGfx.fillRect(0, topY, W, h);
        // ロゴcrop更新（表示高→テクスチャ高に変換）
        const cropH = Math.min(logoTexH, (h / this._opLogo.displayHeight) * logoTexH);
        this._opLogo.setCrop(0, 0, logoTexW, cropH);
      },
      onComplete: () => {
        this._opLogoBg.clearMask();
        maskGfx.destroy();
        this._opLogo.setCrop();
        this._opLogoComplete();
      }
    });
  }

  // ロゴイン完了 → クレジット・画面押下セヨ点滅表示
  _opLogoComplete() {
    this._opCreditTxt.setAlpha(1);
    this._opTapLbl.setAlpha(1);
    this._blinkStop();
    this._blinkTw = this.tweens.add({
      targets:  this._opTapLbl,
      alpha:    { from: 1, to: 0.1 },
      yoyo:     true,
      repeat:   -1,
      duration: 900,
      ease:     'Sine.easeInOut'
    });
    this._phase = 'tap';
  }

  _blinkStop() {
    if (!this._blinkTw) return;
    this._blinkTw.destroy();
    this._blinkTw = null;
  }

  /* ── フェーズ切替（title / opts） ──────── */
  _setPhase(phase) {
    this._phase = phase;
    // OP関連を隠す
    this._opLogoBg.clearMask().setAlpha(0);
    this._opLogo.clearMask().setCrop().setAlpha(0);
    [this._opBg, this._opCreditTxt, this._opTapLbl].forEach(o => o.setAlpha(0));
    this._blinkStop();
    // title/optsを全非表示にしてから対象だけ表示
    [...this._titleObjs, ...this._optsObjs].forEach(o => o.setAlpha(0));
    if (phase === 'title') {
      this._titleObjs.forEach(o => o.setAlpha(1));
    } else if (phase === 'opts') {
      this._optsObjs.forEach(o => o.setAlpha(1));
      this._refreshOpts();
    }
  }

  _refreshOpts() {
    for (const b of this._optBtns) {
      const on = this._opts[b.key];
      b.val.setText(on ? 'ON' : 'OFF').setStyle({ color: on ? '#44ffaa' : '#aa4444', fontSize:'22px', fontFamily:'Arial', fontStyle:'bold' });
    }
  }

  /* ── タップ処理 ─────────────────────────── */
  _tap(ptr) {
    const { x, y } = ptr;

    // ターミナル演出：PUSH表示後のみ通過
    if (this._phase === 'terminal') {
      if (!this._termReady) return;
      this._terminalHide();
      if (this._bgm && this._opts.bgm) this._bgm.play();
      this._startOp();
      return;
    }

    // OP演出中：ズームアニメーション中のみスキップ
    if (this._phase === 'op') {
      if (!this._opZoomDone) this._opSkipZoom();
      // ロゴアニメーション中はスキップしない（自然に終わる）
      return;
    }

    // PLEASE TAP → タイトルメニューへ
    if (this._phase === 'tap') {
      this._setPhase('title');
      return;
    }

    // タイトルメニュー
    if (this._phase === 'title') {
      for (const btn of this._menuBtns) {
        if (Math.abs(y - btn.y) < 38 && Math.abs(x - W/2) < 145) {
          if (btn.grey) return;
          if (btn.key === 'new')  { deleteSave(); this.scene.start('MainScene', { type:'new' }); }
          if (btn.key === 'cont') { this.scene.start('MainScene', { type:'continue' }); }
          if (btn.key === 'opts') { this._setPhase('opts'); }
          return;
        }
      }
    }

    // オプション
    if (this._phase === 'opts') {
      if (Math.abs(y - this._optsCnl.y) < 28) { this._setPhase('title'); return; }
      for (const btn of this._optBtns) {
        if (Math.abs(y - btn.y) < 38) {
          this._opts[btn.key] = !this._opts[btn.key];
          saveOpts(this._opts);
          this._refreshOpts();
          if (btn.key === 'bgm') {
            if (this._bgm) {
              if (this._opts.bgm) { if (!this._bgm.isPlaying) this._bgm.play(); }
              else                { this._bgm.stop(); }
            }
          }
          return;
        }
      }
    }
  }
}
