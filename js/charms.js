'use strict';

/* ── Attributes ─────────────────────────────── */
// 相克: 火→地→風→水→火
const ATTR_COLORS = { none:0x888888, fire:0xff4422, water:0x4499ff, earth:0x88bb33, wind:0x99ffaa };
// ゲージ充填色（鮮やか）
const ATTR_FILL  = { none:0x2299ff, fire:0xff5533, water:0x22aaff, earth:0x99dd33, wind:0x55ffcc };
const ATTR_NAMES  = { none:'－', fire:'火', water:'水', earth:'地', wind:'風' };
const ATTR_BEATS  = { fire:'earth', earth:'wind', wind:'water', water:'fire' };
// 有利=等倍(1.0)、中立=0.75、不利=0.5
function attrMult(atk, def) {
  if (!def || def === 'none') return 1.0;
  if (!atk || atk === 'none') return 0.75;
  if (ATTR_BEATS[atk] === def) return 1.0;   // 有利
  if (ATTR_BEATS[def] === atk) return 0.5;   // 不利
  return 0.75;                                // 中立
}

/* ── Charms ─────────────────────────────────── */
const CHARM_DEFS = [
  { id:'water',   name:'水符・羽弾', desc:'最も近い敵に水弾を放つ',           dmg:35, chargeMs:2500, attr:'water' },
  { id:'pierce',  name:'水符・凍',   desc:'先頭の敵を狙うビームを放つ',       dmg:60, chargeMs:4000, attr:'wind'  },
  { id:'scatter', name:'火符・延焼', desc:'扇状に拡散弾5発を放つ',            dmg:28, chargeMs:2800, attr:'fire'  },
  { id:'rapid',   name:'地符・礫弾', desc:'素早く5連射（威力低め）',          dmg:12, chargeMs:900,  attr:'earth' },
  { id:'burst',   name:'火符・砲弾', desc:'近接範囲の全敵を爆炎で焼く',       dmg:45, chargeMs:3500, attr:'fire'  },
  { id:'burn',    name:'火符・傷焰', desc:'敵を燃やし継続ダメージを与える',    dmg:15, chargeMs:2000, attr:'fire'  },
  { id:'rock',    name:'地符・磐',   desc:'全敵に岩を落としスタンを与える',    dmg:40, chargeMs:5000, attr:'earth' },
  { id:'root',    name:'地符・根付', desc:'敵を縛り重複するほど威力が増す',    dmg:10, chargeMs:2200, attr:'earth' },
  { id:'slash',   name:'風符・鎌鼬', desc:'扇形に風の刃を放つ',               dmg:50, chargeMs:3200, attr:'wind'  },
  { id:'blow',    name:'風符・旋圧', desc:'全敵を大きく押し戻す',              dmg:20, chargeMs:3800, attr:'wind'  },
  { id:'chain',   name:'風符・迅弾', desc:'敵から敵へと連鎖する衝撃波',        dmg:30, chargeMs:3000, attr:'wind'  },
  { id:'mist',    name:'水符・銀霧', desc:'霧のエリアを展開し継続ダメージ',    dmg:25, chargeMs:4500, attr:'water' },
];
