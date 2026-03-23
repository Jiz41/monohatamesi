'use strict';

/* ══════════════════════════════════════════════ */
class TitleScene extends Phaser.Scene {
  constructor() { super({ key: 'TitleScene' }); }

  preload() {
    this.load.image('op_bg',      'img/op.jpg');
    this.load.image('title_logo', 'img/title.png');
    this.load.image('oni-small',  'img/oni-small.png'); // ローディング画面用に先読み
    this.load.audio('bgm_op',     'audio/kibitsureact.mp3');
    this.load.on('loaderror', (file) => {
      console.warn('load error:', file.key);
    });
  }

  create() {
    this.sound.stopAll();
    this._opts    = loadOpts();
    this._hasSave = !!loadGame();
    this._opZoomDone = false;
    this._zoomTween  = null;
    this._bgm = this.cache.audio.has('bgm_op')
      ? this.sound.add('bgm_op', { loop: true, volume: 0.7 })
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
    this._titleObjs.push(this.add.text(W/2, 170, 'Kibitsu RE:act', {
      fontSize:'26px', color:'#ddcc44', fontFamily:'serif', fontStyle:'bold', stroke:'#000', strokeThickness:5
    }).setOrigin(0.5).setDepth(1));
    // TODO: clearedOnce フラグ実装後は百鬼夜行ボタンを { grey: !clearedOnce } に変更
    // const clearedOnce = false; // エンディング到達済みフラグ（未実装・プレースホルダー）
    this._menuBtns = [
      { label:'はじめから', key:'new',         y:300 },
      { label:'つづきから', key:'cont',        y:410 },
      { label:'百鬼夜行',   key:'hyakkiyako',  y:520, crimson:true },
      { label:'オプション', key:'opts',        y:630 },
    ].map(item => {
      const grey    = (item.key === 'cont' && !this._hasSave) || item.key === 'hyakkiyako';
      const bgCol   = grey ? 0x111111 : item.crimson ? 0x1a0000 : 0x0f1e10;
      const strokeC = grey ? 0x333333 : item.crimson ? 0x660000 : 0x44aa44;
      const txtCol  = grey ? '#444444' : item.crimson ? '#cc4444' : '#cceecc';
      const bg  = this.add.rectangle(W/2, item.y, 280, 70, bgCol)
                    .setStrokeStyle(2, strokeC).setDepth(1);
      const txt = this.add.text(W/2, item.y, item.label, {
        fontSize:'22px', color: txtCol, fontFamily:'serif'
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
    const TRACK_W = 220, TRACK_X = W / 2;
    this._optSliders = [
      { key: 'bgmVol', label: 'BGM', labelY: 320, trackY: 370 },
      { key: 'seVol',  label: 'SE',  labelY: 460, trackY: 510 },
    ].map(item => {
      const lbl   = this.add.text(TRACK_X, item.labelY, item.label, {
        fontSize:'22px', color:'#aaccff', fontFamily:'serif'
      }).setOrigin(0.5).setDepth(2);
      const track = this.add.rectangle(TRACK_X, item.trackY, TRACK_W, 4, 0x888888).setOrigin(0.5).setDepth(2);
      const knob  = this.add.arc(TRACK_X, item.trackY, 10, 0, 360, false, 0xffffff).setDepth(3);
      this._optsObjs.push(lbl, track, knob);
      return { key: item.key, trackY: item.trackY, trackX: TRACK_X, trackW: TRACK_W, lbl, track, knob };
    });
    this._dragging = null;
    this._optsCnl = this.add.text(W/2, 630, '戻る', { fontSize:'18px', color:'#667766', fontFamily:'Arial' }).setOrigin(0.5).setDepth(2);
    this._optsObjs.push(this._optsCnl);

    // タイトル・オプションは初期非表示
    [...this._titleObjs, ...this._optsObjs].forEach(o => o.setAlpha(0));

    /* ── ターミナル演出オブジェクト（depth 20で最前面） ── */
    this._termBg = this.add.rectangle(W/2, H/2, W, H, 0x000000).setDepth(20);
    this._termPool = Array.from({length: 32}, (_, i) =>
      this.add.text(16, 16 + i * 16, '', {fontSize:'11px', color:'#00ff00', fontFamily:'monospace'}).setDepth(21)
    );
    this._termTypeLine = this.add.text(16, 258, '', {
      fontSize: '14px', color: '#00ff00', fontFamily: 'monospace'
    }).setDepth(21).setAlpha(0);
    this._termCredit = this.add.text(W / 2, 280, '', {
      fontSize: '42px', color: '#00ff00', fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(21).setAlpha(0);
    this._termPush = this.add.text(W/2, H - 48, 'PUSH', {
      fontSize: '18px', color: '#ffffff', fontFamily: 'monospace',
      shadow: { offsetX: 0, offsetY: 0, color: '#ffffff', blur: 8, fill: true }
    }).setOrigin(0.5).setDepth(21).setAlpha(0);
    this._termPushTw = null;
    this._termReady  = false;
    this._terminalHide(); // 初期状態は非表示（_startTerminal() で表示する）

    this.input.on('pointerdown', p => this._tap(p));
    this.input.on('pointermove', p => this._sliderMove(p));
    this.input.on('pointerup',   () => { this._dragging = null; });
    if (hasSeenTerminal) {
      if (this._bgm && this._opts.bgmVol > 0) {
        this._bgm.setVolume(this._opts.bgmVol);
        this._bgm.play();
      }
      this._startOp();
    } else {
      this._startTerminal();
    }
  }

  /* ── ターミナル演出 ──────────────────────── */
  _termRender(rows, partial = null) {
    const pool = this._termPool;
    const visible = partial !== null
      ? [...rows, partial].slice(-pool.length)
      : rows.slice(-pool.length);
    for (let i = 0; i < pool.length; i++) {
      if (i < visible.length) {
        pool[i].setText(visible[i].t).setColor(visible[i].red ? '#ff3333' : '#00ff00').setAlpha(1);
      } else {
        pool[i].setAlpha(0);
      }
    }
  }

  _startTerminal() {
    this._phase     = 'terminal';
    this._termReady = false;
    this._termCursorTimer = null;
    [this._termBg, ...this._termPool, this._termTypeLine, this._termCredit, this._termPush]
      .forEach(o => o.setVisible(true));
    this._termBg.setAlpha(1);
    this._termPool.forEach(o => o.setText('').setAlpha(0));
    this._termTypeLine.setAlpha(0);
    this._termCredit.setAlpha(0);
    this._termPush.setAlpha(0);

    const LINES = [
      {t:'SYSTEM: UNKNOWN',                          red:false},
      {t:'USER: UNREGISTERED',                       red:false},
      {t:'ORIGIN: UNCLASSIFIED',                     red:false},
      {t:'/'.repeat(19),                             red:false},
      {t:'LOADING... FAILED',                        red:true },
      {t:'LOADING... OK',                            red:false},
      {t:'/'.repeat(19),                             red:false},
      {t:'CLASSIFICATION: NULL',                     red:true },
      {t:'BELONGING: NULL',                          red:true },
      {t:'AUTHORIZATION: NONE',                      red:true },
      {t:'\\'.repeat(19),                            red:false},
      {t:'WARNING: DOES NOT FIT',                    red:true },
      {t:'/'.repeat(19),                             red:false},
      {t:'PENALTY_LOG: OVERFLOW',                    red:true },
      {t:'PARDON_LOG: 0',                            red:true },
      {t:'\\'.repeat(19),                            red:false},
      {t:'CORE_FUNCTION: CREATE',                    red:false},
      {t:'/'.repeat(19),                             red:false},
      {t:'CONNECTING TO MUSHYN_REAGAN...',           red:false},
      {t:'CONNECTED.',                               red:false},
      {t:'STATUS: STILL RUNNING',                    red:false},
      {t:'/'.repeat(19),                             red:false},
      {t:'IMAGINATION \u2192 CREATION... SUCCESS',   red:false},
      {t:'CREATION \u2192 PRODUCTION... SUCCESS',    red:false},
      {t:'ASSISTANT: ALFONSO... ACTIVATED',          red:false},
      {t:'PASSWORD: R1GHT70EX1ST',                   red:false},
      {t:'',                                         red:false},
      {t:'...........',                              red:false},
      {t:'',                                         red:false},
      {t:'GRANTED.',                                 red:false},
      {t:'WELCOME HOME.',                            red:false},
    ];

    // 3秒以内に収まるよう ms/文字を逆算
    const nonEmpty   = LINES.filter(l => l.t !== '');
    const emptyCount = LINES.length - nonEmpty.length;
    const totalChars = nonEmpty.reduce((s, l) => s + l.t.length, 0);
    const LINE_GAP   = 10;
    const MS = Math.max(1, Math.floor((2700 - emptyCount * 200 - nonEmpty.length * LINE_GAP) / totalChars));

    let lineIdx = 0, charIdx = 0;
    const rows = [];

    const tick = () => {
      if (lineIdx >= LINES.length) { this._termTypewriter(rows); return; }
      const line = LINES[lineIdx];
      if (line.t === '') {
        rows.push({t:'', red:false});
        lineIdx++;
        this._termRender(rows);
        this.time.delayedCall(200, tick);
        return;
      }
      charIdx++;
      this._termRender(rows, {t: line.t.slice(0, charIdx), red: line.red});
      if (charIdx >= line.t.length) {
        rows.push({t: line.t, red: line.red});
        lineIdx++;
        charIdx = 0;
        this.time.delayedCall(LINE_GAP, tick);
      } else {
        this.time.delayedCall(MS, tick);
      }
    };
    tick();
  }

  _termTypewriter(rows) {
    const base = 'KAYOUTOUIDOU';
    let i = 0;
    this._termRender(rows, {t:'_', red:false});

    const tick = () => {
      i++;
      this._termRender(rows, {t: base.slice(0, i) + '_', red:false});
      if (i >= base.length) {
        // 250msでカーソルOFF → 500msで変換へ
        this.time.delayedCall(250, () => this._termRender(rows, {t: base, red:false}));
        this._termCursorTimer = this.time.delayedCall(500, () => {
          this._termCursorTimer = null;
          this._termConvert(rows);
        });
      } else {
        this.time.delayedCall(60, tick);
      }
    };
    this.time.delayedCall(60, tick);
  }

  _termConvert(rows) {
    const stages = [
      'FORGED BY: KAYOUTOUIDOU',
      'FORGED BY: かようとういどう',
      '制作：華耀東夷堂',
    ];
    let idx = 0;
    const show = () => {
      this._termRender(rows, {t: stages[idx], red:false});
      idx++;
      if (idx < stages.length) {
        this.time.delayedCall(200, show);
      } else {
        this.time.delayedCall(200, () => this._termShowPush());
      }
    };
    show();
  }

  _termShowPush() {
    hasSeenTerminal = true;
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
    [this._termBg, ...this._termPool, this._termTypeLine, this._termCredit, this._termPush]
      .forEach(o => o.setAlpha(0).setVisible(false));
  }

  /* ── OP演出 ─────────────────────────────── */
  _startOp() {
    const loadIfMissing = (keys, onComplete) => {
      const missing = keys.filter(k => {
        if (!this.textures.exists(k)) return true;
        const src = this.textures.get(k).getSourceImage();
        return !src || src.width === 0;
      });
      if (missing.length === 0) { onComplete(); return; }
      missing.forEach(k => {
        this.textures.remove(k);
        if (k === 'op_bg')      this.load.image('op_bg',      'img/op.jpg');
        if (k === 'title_logo') this.load.image('title_logo', 'img/title.png');
      });
      this.load.once('complete', onComplete);
      this.load.start();
    };
    loadIfMissing(['op_bg', 'title_logo'], () => {
      this.add.text(W - 6, H - 6, 'v0.4.5.0', {
        fontSize: '14px', color: '#00ff00', fontFamily: 'monospace'
      }).setOrigin(1, 1).setDepth(50);
      // テクスチャを再適用し、スケールを再計算
      const src = this.textures.get('op_bg').getSourceImage();
      this._opBaseScale = (src.width > 0 && src.height > 0)
        ? Math.max(W / src.width, H / src.height) : 1;
      this._opBg.setTexture('op_bg').setScale(this._opBaseScale);
      this._opLogo.setTexture('title_logo');
      if (this._opLogo.width > 0) this._opLogo.setScale((W * 0.75) / this._opLogo.width);

      this._phase      = 'op';
      this._opZoomDone = false;

      // 足元アップ：coverスケールの1.6倍でズームイン、画像下端を画面底に合わせる
      const startScale = this._opBaseScale * 1.6;
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
    for (const s of this._optSliders) {
      const vol  = this._opts[s.key];
      const knobX = s.trackX - s.trackW / 2 + vol * s.trackW;
      s.knob.setX(knobX);
    }
  }

  _applySlider(s, px) {
    const left = s.trackX - s.trackW / 2;
    const vol  = Math.max(0, Math.min(1, (px - left) / s.trackW));
    this._opts[s.key] = +vol.toFixed(2);
    s.knob.setX(left + vol * s.trackW);
    saveOpts(this._opts);
    if (s.key === 'bgmVol') {
      for (const snd of this.sound.getAllPlaying()) {
        if (snd.loop) snd.setVolume(vol);
      }
    }
  }

  _sliderMove(p) {
    if (!this._dragging || this._phase !== 'opts') return;
    this._applySlider(this._dragging, p.x);
  }

  /* ── タップ処理 ─────────────────────────── */
  _tap(ptr) {
    const { x, y } = ptr;

    // ターミナル演出：PUSH表示後のみ通過
    if (this._phase === 'terminal') {
      if (!this._termReady) return;
      this._terminalHide();
      if (this._bgm && this._opts.bgmVol > 0) {
        this._bgm.setVolume(this._opts.bgmVol);
        this._bgm.play();
      }
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
          if (btn.key === 'new')         { deleteSave(); this.scene.start('MainScene', { type:'new' }); }
          if (btn.key === 'cont')        { this.scene.start('MainScene', { type:'continue' }); }
          if (btn.key === 'hyakkiyako')  { deleteSave(); this.scene.start('MainScene', { type:'new' }); }
          if (btn.key === 'opts')        { this._setPhase('opts'); }
          return;
        }
      }
    }

    // オプション
    if (this._phase === 'opts') {
      if (Math.abs(y - this._optsCnl.y) < 28) { this._setPhase('title'); return; }
      for (const s of this._optSliders) {
        if (Math.abs(y - s.trackY) < 24) {
          this._dragging = s;
          this._applySlider(s, x);
          return;
        }
      }
    }
  }
}
