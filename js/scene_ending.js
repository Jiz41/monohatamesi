'use strict';

/* ── エンドロール定数 ────────────────────────── */
const BGM_ENDING_MS    = 127000; // warabeuta.mp3（2分7秒）
const IMG_ANIM_MS      = 2000;   // 各画像演出の所要時間（slide 800 + hold 600 + fade 600）
const IMG_TOTAL_PAUSE  = IMG_ANIM_MS * 4; // 4演出分の一時停止合計

/* ══════════════════════════════════════════════ */
class EndingScene extends Phaser.Scene {
  constructor() { super({ key: 'EndingScene' }); }

  preload() {
    this.load.audio('bgm_warabeuta', 'audio/warabeuta.mp3');
    // メインシーンからキャッシュ済みのためスキップされるが安全のため記載
    ['kibitsu', 'oni-small', 'oni-mid', 'oni-large', 'oni-ura',
     'oni-ibaraki', 'oni-shuten', 'oni-otake'
    ].forEach(k => this.load.image(k, `img/${k}.png`));
  }

  create() {
    this._skipped     = false;
    this._imgLock     = false;
    this._imgTriggers = [];
    this._curImgObjs  = null;

    // 黒背景
    this.add.rectangle(W/2, H/2, W, H, 0x000000).setDepth(0);

    // BGM（暗転後から・ループなし）
    const bgmVol = loadOpts().bgmVol;
    this._bgm = null;
    if (bgmVol > 0 && this.cache.audio.has('bgm_warabeuta')) {
      this._bgm = this.sound.add('bgm_warabeuta', { volume: bgmVol, loop: false });
      this._bgm.play();
      this._bgm.on('complete', () => this._finish());
    } else {
      // BGMなし時はタイマーで代替
      this.time.delayedCall(BGM_ENDING_MS, () => this._finish());
    }

    // スクロールコンテナ（テキストは depth 5 ／ 画像演出は depth 4 で奥）
    this._ctr = this.add.container(0, H).setDepth(5);
    let cy = 80;
    const F = '"Yuji Syuku", serif';

    const addRole = (t) => {
      this._ctr.add(this.add.text(W/2, cy, t, {
        fontSize: '16px', fontFamily: F, color: '#ffffff', align: 'center',
      }).setOrigin(0.5, 0));
      cy += 24;
    };
    const addName = (t) => {
      this._ctr.add(this.add.text(W/2, cy, t, {
        fontSize: '20px', fontFamily: F, color: '#ffffff', align: 'center',
      }).setOrigin(0.5, 0));
      cy += 30;
    };
    const addSong = (t) => {
      this._ctr.add(this.add.text(W/2, cy, t, {
        fontSize: '13px', fontFamily: F, color: '#ffffff', align: 'center',
      }).setOrigin(0.5, 0));
      cy += 23;
    };
    const addItem = (t) => {
      this._ctr.add(this.add.text(W/2, cy, t, {
        fontSize: '16px', fontFamily: F, color: '#ffffff', align: 'center',
      }).setOrigin(0.5, 0));
      cy += 26;
    };
    const addSub = (t) => {
      this._ctr.add(this.add.text(W/2, cy, t, {
        fontSize: '14px', fontFamily: F, color: '#ffffff', align: 'center',
      }).setOrigin(0.5, 0));
      cy += 22;
    };
    const gap     = (h) => { cy += h; };
    const imgMark = (spec) => {
      this._imgTriggers.push({ trigY: cy, spec, done: false });
    };

    /* ── クレジット本体 ───────────────────────── */
    addRole('企画'); addName('Mushyn Reagan');                gap(60);
    addRole('指揮'); addName('Mushyn Reagan');                gap(60);
    addRole('脚本');
    addName('Alfonso Rémy Beaumont'); gap(14); addName('Mushyn Reagan');
    gap(60);
    addRole('意匠'); addName('Mushyn Reagan');                gap(140);

    imgMark({ type: 'slide_single', key: 'kibitsu', dir: 'left' });
    gap(140);

    addRole('楽曲構成・作詞'); addName('Mushyn Reagan');
    addRole('楽曲制作');       addName('Suno AI');
    gap(14);
    addSong('咎満つ、地の獄より。');
    addSong('門前祓候');
    addSong('大禍刻');
    addSong('艮真言');
    addSong('めぐりうた');
    gap(60);

    addRole('効果音');
    addName('OtoLogic'); addName('効果音ラボ'); addName('maruya328');
    gap(60);

    addRole('書体'); addName('怨霊／暗黒工房');
    gap(140);

    imgMark({ type: 'slide_row', keys: ['oni-small', 'oni-mid', 'oni-large', 'oni-ura'],
              heights: [0.20, 0.26, 0.30, 0.42] });
    gap(140);

    addRole('指示立案'); addName('Alfonso Rémy Beaumont'); gap(60);
    addRole('制作進行'); addName('Alfonso Rémy Beaumont'); gap(140);

    imgMark({ type: 'slide_dual', keys: ['oni-ibaraki', 'oni-shuten'] });
    gap(140);

    addRole('実装・仕込');
    addName('Mushyn Reagan'); gap(14); addName('偽咲澤爻徒');
    gap(60);
    addRole('管理');       addName('偽咲澤爻徒');  gap(60);
    addRole('制作・発行'); addName('華耀東夷堂');   gap(140);

    imgMark({ type: 'fade_center', key: 'oni-otake' });
    gap(140);

    addRole('原案着想'); addName('芥川龍之介「桃太郎」'); gap(120);

    // 薫陶物セクション
    addItem('【薫陶物】'); gap(30);
    addItem('― ゲーム ―');
    addItem('DARK SOULS'); addItem('真・女神転生'); addItem('Vampire Survivors');
    gap(40);
    addItem('― 小説 ―');
    addItem('魔界都市ブルース');     addSub('菊地秀行');   gap(24);
    addItem('ドグラ・マグラ');       addSub('夢野久作');   gap(24);
    addItem('ラーマーヤナ');         addSub('ヴァールミーキ');
    gap(40);
    addItem('― 漫画 ―');
    addItem('グラップラー刃牙');     addSub('板垣恵介');   gap(24);
    addItem('ジョジョの奇妙な冒険'); addSub('荒木飛呂彦'); gap(24);
    addItem('HELLSING');             addSub('平野耕太');
    gap(40);
    addItem('― 音楽 ―');
    addItem('COCK ROACH'); addItem('Gustav Mahler'); addItem('Cab Calloway');
    gap(60);

    this._ctr.add(this.add.text(W/2, cy,
      '最後まで遊んでくれてありがとうございました。', {
        fontSize: '16px', fontFamily: F, color: '#ffffff',
        align: 'center', wordWrap: { width: W - 80 },
      }).setOrigin(0.5, 0));
    cy += 30;

    gap(Math.round(H * 0.70)); // 末尾余白（最後の行が画面上端を抜けるまで）

    /* ── スクロール速度：BGMぴったりで流れ切るよう逆算 ── */
    this._contentH    = cy;
    this._scrollSpeed = (H + cy) / (BGM_ENDING_MS - IMG_TOTAL_PAUSE); // px/ms
    this._scrollY     = H;

    /* ── SKIPボタン（depth 20 ／常時最前面） ── */
    this.add.rectangle(44, 24, 68, 30, 0x000000, 0.7)
      .setStrokeStyle(1, 0x444444).setDepth(20);
    this.add.text(44, 24, 'SKIP', {
      fontSize: '13px', fontFamily: 'Arial', color: '#888888',
    }).setOrigin(0.5).setDepth(20);

    // SKIPボタン領域のみ受付（それ以外のタップは無効）
    this.input.on('pointerdown', p => {
      if (p.x < 78 && p.y < 39) this._skip();
    });
  }

  /* ── update：スクロール＆画像演出トリガー ─── */
  update(_t, delta) {
    if (this._skipped || this._imgLock) return;
    this._scrollY -= this._scrollSpeed * delta;
    this._ctr.setY(this._scrollY);

    for (const trig of this._imgTriggers) {
      if (!trig.done && this._scrollY + trig.trigY <= H * 0.5) {
        trig.done    = true;
        this._imgLock = true;
        this._playImgAnim(trig.spec, () => { this._imgLock = false; });
        return;
      }
    }
  }

  /* ── SKIP ──────────────────────────────────── */
  _skip() {
    if (this._skipped) return;
    this._skipped = true;
    if (this._bgm?.isPlaying) {
      this.tweens.add({
        targets: this._bgm, volume: 0, duration: 600,
        onComplete: () => { this._bgm.stop(); this._showUnlock(); },
      });
    } else {
      this._showUnlock();
    }
  }

  /* ── スクロール完了（BGM終了で発火） ────────── */
  _finish() {
    if (this._skipped) return;
    this._skipped = true;
    this._showUnlock();
  }

  /* ── 百鬼夜行モード解放演出へ移行 ─────────── */
  _showUnlock() {
    // 現在アクティブな画像演出を即フェード
    if (this._curImgObjs?.length) {
      this.tweens.add({ targets: this._curImgObjs, alpha: 0, duration: 300 });
      this._curImgObjs = null;
    }
    if (this._ctr) this.tweens.add({ targets: this._ctr, alpha: 0, duration: 400 });
    this.time.delayedCall(600, () => this._renderUnlockMsg());
  }

  /* ── 百鬼夜行モード解放テキスト ─────────────── */
  _renderUnlockMsg() {
    const F   = '"Yuji Syuku", serif';
    const midY = H / 2;

    const t1 = this.add.text(W/2, midY - 68, '終わらない永劫の罰、', {
      fontSize: '20px', fontFamily: F, color: '#ffffff', align: 'center',
    }).setOrigin(0.5).setAlpha(0).setDepth(15);

    // 「百鬼夜行モード」のみ血の文字色（0x8b0000）
    const t2 = this.add.text(W/2, midY - 6, '百鬼夜行モード', {
      fontSize: '26px', fontFamily: F, color: '#8b0000', align: 'center',
    }).setOrigin(0.5).setAlpha(0).setDepth(15);

    const t3 = this.add.text(W/2, midY + 56, 'が執行されました。', {
      fontSize: '20px', fontFamily: F, color: '#ffffff', align: 'center',
    }).setOrigin(0.5).setAlpha(0).setDepth(15);

    this.tweens.add({ targets: t1, alpha: 1, duration: 700, delay: 200 });
    this.tweens.add({
      targets: t2, alpha: 1, duration: 700, delay: 1000,
      onComplete: () => {
        // ±2px・80ms以下の高速ループで細かく震わせる
        this._shakeTimer = this.time.addEvent({
          delay: 75, loop: true,
          callback: () => {
            t2.setX(W/2 + Phaser.Math.Between(-2, 2));
            t2.setY((midY - 6) + Phaser.Math.Between(-2, 2));
          },
        });
      },
    });
    this.tweens.add({ targets: t3, alpha: 1, duration: 700, delay: 1800 });

    this.time.delayedCall(5500, () => {
      if (this._shakeTimer) { this._shakeTimer.destroy(); this._shakeTimer = null; }
      this.tweens.add({
        targets: [t1, t2, t3], alpha: 0, duration: 800,
        onComplete: () => this.scene.start('TitleScene'),
      });
    });
  }

  /* ── 画像演出 ────────────────────────────────── */
  _playImgAnim(spec, onDone) {
    const IMG_H  = Math.round(H * 0.46); // 単体・ペア：画面高さの46%
    const IMG_H4 = Math.round(H * 0.33); // 4体横並び：33%
    const OFFS   = [[-4,0],[4,0],[0,-4],[0,4],[-3,-3],[3,-3],[-3,3],[3,3]];

    const makeImg = (key, h) => {
      if (!this.textures.exists(key)) return null;
      const nat = this.textures.get(key).getSourceImage();
      if (!nat?.width) return null;
      const w = Math.round(nat.width * h / nat.height);
      const ol = OFFS.map(([dx, dy]) =>
        this.add.image(0, H/2 + dy, key).setDisplaySize(w, h)
          .setTintFill(0xffffff).setAlpha(0).setDepth(3)
      );
      const img = this.add.image(0, H/2, key).setDisplaySize(w, h).setDepth(4);
      img._ol       = ol;
      img._syncX    = () => OFFS.forEach(([dx], i) => ol[i].setX(img.x + dx));
      img._showOl   = () => OFFS.forEach(([dx, dy], i) => { ol[i].setX(img.x + dx); ol[i].setAlpha(0.8); });
      img._destroyAll = () => { ol.forEach(o => o.destroy()); img.destroy(); };
      return img;
    };

    // ── キビツ：左から中央へスライドイン → フェードアウト ──
    if (spec.type === 'slide_single') {
      const img = makeImg(spec.key, IMG_H);
      if (!img) { this.time.delayedCall(IMG_ANIM_MS, onDone); return; }
      this._curImgObjs = [...img._ol, img];
      const startX = spec.dir === 'left'
        ? -(img.displayWidth / 2 + 20) : W + img.displayWidth / 2 + 20;
      img.setX(startX); img._showOl();
      this.tweens.add({
        targets: img, x: W / 2, duration: 800, ease: 'Sine.easeOut',
        onUpdate: () => img._syncX(),
        onComplete: () => this.time.delayedCall(600, () => {
          this.tweens.add({
            targets: [...img._ol, img], alpha: 0, duration: 600,
            onComplete: () => { img._destroyAll(); this._curImgObjs = null; onDone(); },
          });
        }),
      });

    // ── 小鬼・中鬼・大鬼・温羅：右から中央へスライドイン → フェードアウト ──
    } else if (spec.type === 'slide_row') {
      const imgs = spec.keys.map((k, i) => {
        const h = spec.heights ? Math.round(H * spec.heights[i]) : IMG_H4;
        return makeImg(k, h);
      }).filter(Boolean);
      if (!imgs.length) { this.time.delayedCall(IMG_ANIM_MS, onDone); return; }
      this._curImgObjs = imgs.flatMap(img => [...img._ol, img]);
      const cols = imgs.length;
      const xs   = Array.from({ length: cols }, (_, i) => ((i + 0.5) / cols) * W);
      imgs.forEach(img => { img.setX(W + 200); img._showOl(); }); // 全て右端から出現
      let doneCount = 0;
      imgs.forEach((img, i) => {
        this.tweens.add({
          targets: img, x: xs[i], duration: 800, ease: 'Sine.easeOut',
          onUpdate: () => img._syncX(),
          onComplete: () => {
            if (++doneCount === imgs.length) {
              this.time.delayedCall(600, () => {
                this.tweens.add({
                  targets: imgs.flatMap(img => [...img._ol, img]), alpha: 0, duration: 600,
                  onComplete: () => {
                    imgs.forEach(img => img._destroyAll()); this._curImgObjs = null; onDone();
                  },
                });
              });
            }
          },
        });
      });

    // ── 茨木童子・酒呑童子：左右から同時スライドイン → 中央でフェードアウト ──
    } else if (spec.type === 'slide_dual') {
      const [imgA, imgB] = spec.keys.map(k => makeImg(k, IMG_H));
      if (!imgA || !imgB) { this.time.delayedCall(IMG_ANIM_MS, onDone); return; }
      this._curImgObjs = [...imgA._ol, imgA, ...imgB._ol, imgB];
      imgA.setX(-(imgA.displayWidth / 2 + 20)); imgA._showOl();
      imgB.setX(W + imgB.displayWidth / 2 + 20); imgB._showOl();
      let doneCount = 0;
      const afterSlide = () => {
        if (++doneCount < 2) return;
        this.time.delayedCall(600, () => {
          this.tweens.add({
            targets: [...imgA._ol, imgA, ...imgB._ol, imgB], alpha: 0, duration: 600,
            onComplete: () => {
              imgA._destroyAll(); imgB._destroyAll(); this._curImgObjs = null; onDone();
            },
          });
        });
      };
      this.tweens.add({ targets: imgA, x: W * 0.27, duration: 800, ease: 'Sine.easeOut', onUpdate: () => imgA._syncX(), onComplete: afterSlide });
      this.tweens.add({ targets: imgB, x: W * 0.73, duration: 800, ease: 'Sine.easeOut', onUpdate: () => imgB._syncX(), onComplete: afterSlide });

    // ── 大嶽丸：中央からフェードイン → フェードアウト ──
    } else if (spec.type === 'fade_center') {
      const img = makeImg(spec.key, IMG_H);
      if (!img) { this.time.delayedCall(IMG_ANIM_MS, onDone); return; }
      this._curImgObjs = [...img._ol, img];
      img.setX(W / 2); img._showOl(); img.setAlpha(0);
      this.tweens.add({
        targets: [...img._ol, img], alpha: 1, duration: 800,
        onComplete: () => this.time.delayedCall(600, () => {
          this.tweens.add({
            targets: [...img._ol, img], alpha: 0, duration: 600,
            onComplete: () => { img._destroyAll(); this._curImgObjs = null; onDone(); },
          });
        }),
      });
    }
  }
}
