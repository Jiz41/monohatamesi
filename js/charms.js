'use strict';

/* ── Attributes ─────────────────────────────── */
const ATTR_COLORS = { none:0x888888, fire:0xff4422, water:0x4499ff, earth:0x88bb33, wind:0x99ffaa };
const ATTR_FILL   = { none:0x2299ff, fire:0xff5533, water:0x22aaff, earth:0x99dd33, wind:0x55ffcc };
const ATTR_NAMES  = { none:'－', fire:'火', water:'水', earth:'地', wind:'風' };
const ATTR_BEATS  = { fire:'earth', earth:'wind', wind:'water', water:'fire' };

function attrMult(atk, def) {
  if (!def || def === 'none') return 1.0;
  if (!atk || atk === 'none') return 0.75;
  if (ATTR_BEATS[atk] === def) return 1.0;
  if (ATTR_BEATS[def] === atk) return 0.5;
  return 0.75;
}

/* ── Charm Data ──────────────────────────────── */
const CHARM_DATA = [
  { id:'fire_cannon',  name:'火符・砲弾', damage:80,  target:'single',    status:null,        statusDuration:0,    chargeMs:3000, element:'fire'  },
  { id:'fire_burn',    name:'火符・傷焰', damage:30,  target:'single',    status:'burn',      statusDuration:3000, chargeMs:3500, element:'fire'  },
  { id:'fire_slash',   name:'火符・狐群', damage:25,  target:'fan3',      status:null,        statusDuration:0,    chargeMs:2800, element:'fire'  },
  { id:'earth_rock',   name:'地符・礫弾', damage:60,  target:'single',    status:null,        statusDuration:0,    chargeMs:2500, element:'earth' },
  { id:'earth_quake',  name:'地符・磐座', damage:50,  target:'areaAll',   status:'stun',      statusDuration:2000, chargeMs:5000, element:'earth' },
  { id:'earth_root',   name:'地符・根付', damage:20,  target:'single',    status:'root',      statusDuration:4000, chargeMs:3000, element:'earth' },
  { id:'wind_shot',    name:'風符・迅弾', damage:45,  target:'single',    status:null,        statusDuration:0,    chargeMs:1500, element:'wind'  },
  { id:'wind_blade',   name:'風符・鎌鼬', damage:55,  target:'pierceAll', status:null,        statusDuration:0,    chargeMs:4000, element:'wind'  },
  { id:'wind_vortex',  name:'風符・昇旋', damage:35,  target:'single',    status:'knockback', statusDuration:0,    chargeMs:2800, element:'wind'  },
  { id:'water_drop',   name:'水符・羽弾', damage:40,  target:'single',    status:null,        statusDuration:0,    chargeMs:2500, element:'water' },
  { id:'water_mist',   name:'水符・銀霧', damage:20,  target:'areaAll',   status:'slow',      statusDuration:3000, chargeMs:4000, element:'water' },
  { id:'water_freeze', name:'水符・凍亀', damage:70,  target:'single',    status:'freeze',    statusDuration:2000, chargeMs:4500, element:'water' },
];

/* ── CHARM_DEFS: 旧UI参照との互換レイヤー ────── */
const CHARM_DEFS = CHARM_DATA.map(c => ({
  ...c,
  dmg:  c.damage,
  attr: c.element,
  desc: c.name,
}));

/* ── Travel duration per id (ms) ─────────────── */
const _TRAVEL_MS = {
  fire_cannon:450, fire_burn:400, fire_slash:350,
  earth_rock:450,  earth_quake:500, earth_root:450,
  wind_shot:150,   wind_blade:500,  wind_vortex:400,
  water_drop:400,  water_mist:500,  water_freeze:450,
};
function _travelDuration(id) { return _TRAVEL_MS[id] || 400; }

/* ── Bullet graphics factory ─────────────────── */
function _drawBullet(id, scene) {
  const g = scene.add.graphics().setDepth(5);
  switch (id) {
    case 'fire_cannon':
      g.lineStyle(3, 0xFF8C00, 1);
      g.fillStyle(0xFF4500, 1);
      g.fillCircle(0, 0, 14);
      g.strokeCircle(0, 0, 14);
      break;
    case 'fire_burn':
      g.fillStyle(0xFF6600, 0.5);
      g.fillRect(-18, -3, 14, 6);     // 尾
      g.fillStyle(0xFF6600, 1);
      g.fillCircle(0, 0, 8);
      break;
    case 'fire_slash':
      g.fillStyle(0xFF3300, 1);
      g.fillRect(-10, -3, 20, 6);
      break;
    case 'earth_rock':
      g.lineStyle(3, 0x5C2D00, 1);
      g.fillStyle(0x8B4513, 1);
      g.fillCircle(0, 0, 10);
      g.strokeCircle(0, 0, 10);
      break;
    case 'earth_quake':
      g.fillStyle(0x808080, 0.7);
      g.fillCircle(0, 0, 20);
      break;
    case 'earth_root':
      g.fillStyle(0x228B22, 1);
      g.fillCircle(0, 0, 8);
      break;
    case 'wind_shot':
      g.fillStyle(0xFFFFFF, 1);
      g.fillRect(-15, -2, 30, 4);
      break;
    case 'wind_blade':
      g.lineStyle(4, 0x90EE90, 1);
      g.beginPath();
      g.arc(0, 0, 14, -0.8, 0.8, false);
      g.strokePath();
      break;
    case 'wind_vortex':
      g.fillStyle(0xADFF2F, 1);
      g.fillCircle(0, 0, 8);
      g.lineStyle(2, 0xADFF2F, 0.7);
      g.beginPath();
      g.arc(0, 0, 13, 0, Math.PI * 1.5, false);
      g.strokePath();
      break;
    case 'water_drop':
      g.fillStyle(0x87CEEB, 0.8);
      g.fillCircle(0, 0, 9);
      break;
    case 'water_mist':
      g.fillStyle(0xC0C0C0, 0.5);
      g.fillCircle(0, 0, 18);
      break;
    case 'water_freeze': {
      g.fillStyle(0xADD8E6, 1);
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        pts.push({ x: Math.cos(a) * 10, y: Math.sin(a) * 10 });
      }
      g.fillPoints(pts, true);
      break;
    }
    default:
      g.fillStyle(0xffffff, 1);
      g.fillCircle(0, 0, 8);
  }
  return g;
}

/* ── Hit effect ──────────────────────────────── */
function _hitEffect(tx, ty, charm, scene) {
  const col = ATTR_COLORS[charm.element] || 0xffffff;

  // 共通：円 scale 0→2 + alpha fade
  const base = scene.add.graphics().setDepth(6);
  base.fillStyle(col, 0.7);
  base.fillCircle(0, 0, 12);
  base.x = tx; base.y = ty;
  base.setScale(0);
  scene.tweens.add({
    targets: base, scaleX: 2, scaleY: 2, alpha: 0,
    duration: 300,
    onComplete: () => base.destroy(),
  });

  // earth_quake：衝撃波（r=20→60相当に拡大しフェード）
  if (charm.id === 'earth_quake') {
    const sw = scene.add.graphics().setDepth(6);
    sw.lineStyle(3, 0x808080, 0.8);
    sw.strokeCircle(0, 0, 20);
    sw.x = tx; sw.y = ty;
    scene.tweens.add({
      targets: sw, scaleX: 3, scaleY: 3, alpha: 0,
      duration: 500,
      onComplete: () => sw.destroy(),
    });
  }

  // earth_root：4方向に線を伸ばす
  if (charm.id === 'earth_root') {
    const rg = scene.add.graphics().setDepth(6);
    rg.lineStyle(2, 0x228B22, 1);
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      rg.beginPath(); rg.moveTo(0, 0); rg.lineTo(dx * 30, dy * 30); rg.strokePath();
    }
    rg.x = tx; rg.y = ty;
    rg.setScale(0);
    scene.tweens.add({
      targets: rg, scaleX: 1, scaleY: 1,
      duration: 200,
      onComplete: () => scene.tweens.add({
        targets: rg, alpha: 0, duration: 200, onComplete: () => rg.destroy(),
      }),
    });
  }

  // water_freeze：六角形を4つ放射状に配置してフェード
  if (charm.id === 'water_freeze') {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const hg = scene.add.graphics().setDepth(6);
      hg.fillStyle(0xADD8E6, 0.8);
      const pts = [];
      for (let j = 0; j < 6; j++) {
        const ha = (j / 6) * Math.PI * 2;
        pts.push({ x: Math.cos(ha) * 8, y: Math.sin(ha) * 8 });
      }
      hg.fillPoints(pts, true);
      hg.x = tx + Math.cos(a) * 20;
      hg.y = ty + Math.sin(a) * 20;
      scene.tweens.add({
        targets: hg, alpha: 0,
        duration: 500,
        delay: i * 80,
        onComplete: () => hg.destroy(),
      });
    }
  }
}

/* ── Status application ──────────────────────── */
function applyStatus(enemy, type, duration, scene) {
  if (!enemy?.active) return;

  // 元のspeedを初回のみ保持
  if (enemy._origSpd == null) enemy._origSpd = enemy.spd;
  const origSpd = enemy._origSpd;

  // 既存タイマーをクリア（重複上書き）
  if (enemy._statusTimer)  { clearTimeout(enemy._statusTimer);   enemy._statusTimer  = null; }
  if (enemy._burnInterval) { clearInterval(enemy._burnInterval); enemy._burnInterval = null; }
  if (enemy._burnEvent)    { enemy._burnEvent.remove(false);     enemy._burnEvent    = null; }

  switch (type) {
    case 'burn': {
      if (!scene) break;
      const ticks = Math.floor(duration / 1000);
      let fired = 0;
      enemy._burnEvent = scene.time.addEvent({
        delay: 1000,
        repeat: ticks - 1,
        callback: () => {
          fired++;
          if (!enemy.active) { if (enemy._burnEvent) { enemy._burnEvent.remove(false); enemy._burnEvent = null; } return; }
          scene._oniDmg(enemy, 15, 'fire');
          if (fired >= ticks) enemy._burnEvent = null;
        },
      });
      break;
    }

    case 'knockback':
      enemy.x += 80;
      break;

    case 'stun':
    case 'root':
    case 'freeze':
      enemy.spd = 0;
      enemy._statusTimer = setTimeout(() => { if (enemy.active) enemy.spd = origSpd; }, duration);
      break;

    case 'slow':
      enemy.spd = origSpd * 0.4;
      enemy._statusTimer = setTimeout(() => { if (enemy.active) enemy.spd = origSpd; }, duration);
      break;
  }
}

/* ── Charm fire ──────────────────────────────── */
function fireCharm(id, scene) {
  const charm = CHARM_DATA.find(c => c.id === id);
  if (!charm) return;

  const sx = scene._kbSX, sy = scene._kbSY;
  const tDur = _travelDuration(id);

  /* water_mist：ゆっくり右へ流れる霧 ─────────── */
  if (id === 'water_mist') {
    const g = scene.add.graphics().setDepth(5);
    g.fillStyle(0xC0C0C0, 0.4);
    g.fillCircle(0, 0, 30);
    g.x = sx; g.y = sy;
    let mistActive = true;
    scene.tweens.add({
      targets: g,
      x: W / 2,
      scaleX: 50 / 30, scaleY: 50 / 30,
      duration: 2500,
      onComplete: () => { mistActive = false; g.destroy(); },
    });
    const mistEvt = scene.time.addEvent({
      delay: 200,
      loop: true,
      callback: () => {
        if (!mistActive) { mistEvt.remove(false); return; }
        for (const oni of scene.onis.getChildren().filter(o => o.active)) {
          if (Phaser.Math.Distance.Between(g.x, g.y, oni.x, oni.y) < 50) {
            scene._oniDmg(oni, charm.damage, charm.element);
          }
        }
      },
    });
    return;
  }

  /* areaAll ─────────────────────────────────── */
  if (charm.target === 'areaAll') {
    const g = _drawBullet(id, scene);
    g.x = sx; g.y = sy;
    const tx = W / 2, ty = BATTLE_H / 2;
    scene.tweens.add({
      targets: g, x: tx, y: ty,
      duration: tDur,
      onComplete: () => {
        g.destroy();
        for (const oni of scene.onis.getChildren().filter(o => o.active)) {
          scene._oniDmg(oni, charm.damage, charm.element);
          if (charm.status) applyStatus(oni, charm.status, charm.statusDuration, scene);
        }
        _hitEffect(tx, ty, charm, scene);
      },
    });
    return;
  }

  const activeOnis = scene.onis.getChildren().filter(o => o.active);
  if (!activeOnis.length) return;
  const front = activeOnis.reduce((a, b) => a.x < b.x ? a : b);

  /* fan3 ────────────────────────────────────── */
  if (charm.target === 'fan3') {
    const dx = front.x - sx, dy = front.y - sy;
    const baseAng = Math.atan2(dy, dx);
    const dist    = Math.hypot(dx, dy);

    [-0.3, 0, 0.3].forEach((off, i) => {
      const ang = baseAng + off;
      const g   = _drawBullet(id, scene);
      g.x = sx; g.y = sy;
      g.setAngle(ang * (180 / Math.PI));
      const tx = sx + Math.cos(ang) * dist;
      const ty = sy + Math.sin(ang) * dist;

      scene.tweens.add({
        targets: g, x: tx, y: ty,
        duration: tDur,
        onComplete: () => {
          g.destroy();
          if (i !== 1) return; // 中央弾のみダメージ判定
          let hits = 0;
          for (const oni of scene.onis.getChildren().filter(o => o.active)) {
            if (hits >= 3) break;
            const oniAng = Math.atan2(oni.y - sy, oni.x - sx);
            let diff = Math.abs(oniAng - baseAng);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;
            if (diff < 0.4) {
              scene._oniDmg(oni, charm.damage, charm.element);
              if (charm.status) applyStatus(oni, charm.status, charm.statusDuration, scene);
              hits++;
            }
          }
          _hitEffect(tx, ty, charm, scene);
        },
      });
    });
    return;
  }

  /* pierceAll ───────────────────────────────── */
  if (charm.target === 'pierceAll') {
    const dx  = front.x - sx, dy = front.y - sy;
    const ang = Math.atan2(dy, dx);
    const g   = _drawBullet(id, scene);
    g.x = sx; g.y = sy;
    g.setAngle(ang * (180 / Math.PI));

    scene.tweens.add({
      targets: g, x: front.x, y: front.y,
      duration: tDur,
      onComplete: () => {
        g.destroy();
        for (const oni of scene.onis.getChildren().filter(o => o.active)) {
          const oniAng = Math.atan2(oni.y - sy, oni.x - sx);
          let diff = Math.abs(oniAng - ang);
          if (diff > Math.PI) diff = 2 * Math.PI - diff;
          if (diff < 0.3) {
            scene._oniDmg(oni, charm.damage, charm.element);
            if (charm.status) applyStatus(oni, charm.status, charm.statusDuration, scene);
          }
        }
        _hitEffect(front.x, front.y, charm, scene);
      },
    });
    return;
  }

  /* single ──────────────────────────────────── */
  const g = _drawBullet(id, scene);
  g.x = sx; g.y = sy;

  scene.tweens.add({
    targets: g, x: front.x, y: front.y,
    duration: tDur,
    onComplete: () => {
      g.destroy();
      if (front.active) {
        scene._oniDmg(front, charm.damage, charm.element);
        if (charm.status) applyStatus(front, charm.status, charm.statusDuration, scene);
      }
      _hitEffect(front.x, front.y, charm, scene);
    },
  });
}
