// 余烬尖塔 · 游戏逻辑：跑图、战斗回合、手牌交互、奖励 / 商店 / 篝火 / 事件
const $ = s => document.querySelector(s);
const rnd = Math.random;
const pick = a => a[Math.floor(rnd() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const wait = ms => new Promise(r => setTimeout(r, ms));
let uidSeq = 1;
const mk = (id, up = false) => ({ uid: uidSeq++, id, up });
const TYPE_NAME = { attack: '攻击', skill: '技能', power: '能力', curse: '诅咒' };
const NODE = {
  fight: { glyph: '战', name: '敌人' }, elite: { glyph: '精', name: '精英' }, rest: { glyph: '火', name: '篝火' },
  shop: { glyph: '商', name: '商人' }, event: { glyph: '？', name: '未知' }, treasure: { glyph: '宝', name: '宝箱' }, boss: { glyph: '王', name: '首领' },
};

const G = { player: null, map: null, pos: null, visited: new Set(), floor: 0, busy: false };
let C = null; // 当前战斗

// ======================= 卡牌工具 =======================
const defOf = c => CARDS[c.id];
const valsOf = c => ({ ...defOf(c).v, ...(c.up ? defOf(c).u : {}) });
const costOf = c => { const d = defOf(c); return c.up && d.u.cost !== undefined ? d.u.cost : d.cost; };
const has = r => G.player.relics.includes(r);
const relicImg = r => `<img class="relic-img" src="assets/relics/${r}.png" alt="${RELICS[r].name}" onerror="this.replaceWith('${RELICS[r].glyph}')">`;

function calcDmg(src, tgt, base, raw = false) {
  let d = base + (raw ? 0 : (src.status.str || 0));
  if (src.status.weak) d *= 0.75;
  if (tgt && tgt.status.vuln) d *= 1.5;
  return Math.max(0, Math.floor(d));
}

function cardText(c) {
  const d = defOf(c), v = valsOf(c), base = d.v;
  const inCombat = C && !C.over;
  return d.text.replace(/\{(\w)\}/g, (_, k) => {
    let val = v[k];
    if (k === 'd' && inCombat) val = calcDmg(G.player, null, val);
    const better = val > (base[k] ?? val) || (c.up && v[k] !== base[k]);
    const worse = val < base[k];
    return `<b class="${better && !worse ? 'up' : ''}">${val}</b>`;
  });
}

function cardEl(c) {
  const d = defOf(c), cost = costOf(c);
  const el = document.createElement('div');
  el.className = `card ${d.type}${c.up ? ' upgraded' : ''}`;
  const artColor = { attack: '#ff9a5a', skill: '#a9c4da', power: '#e3c56a', curse: '#777' }[d.type];
  el.innerHTML = `
    ${cost >= 0 ? `<div class="cost${c.up && d.u.cost !== undefined ? ' cheaper' : ''}">${cost}</div>` : ''}
    <div class="name">${d.name}${c.up ? '+' : ''}</div>
    <div class="art">${icon(d.art, artColor)}<img src="assets/cards/${c.id}.png" alt="" onerror="this.remove()"></div>
    <div class="type">${TYPE_NAME[d.type]}</div>
    <div class="desc"><span>${cardText(c)}${d.ex ? '<br><em>消耗</em>' : ''}${d.type === 'power' ? '' : ''}</span></div>`;
  return el;
}
const updateCardEl = (el, c) => { el.querySelector('.desc span').innerHTML = cardText(c) + (defOf(c).ex ? '<br><em>消耗</em>' : ''); };

// ======================= HUD / 浮字 / 提示 =======================
function hud() {
  const P = G.player;
  $('#hud-hp').textContent = `${P.hp}/${P.maxHp}`;
  $('#hud-gold').textContent = P.gold;
  $('#hud-floor').textContent = G.floor;
  $('#hud-deck').textContent = P.deck.length;
  $('#hud-relics').innerHTML = P.relics.map(r => `<span class="relic" data-relic="${r}" data-tip="${RELICS[r].name}\n${RELICS[r].tip}">${relicImg(r)}</span>`).join('');
}
function relicFlash(r) {
  const el = document.querySelector(`.relic[data-relic="${r}"]`);
  if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
}
function toast(t) {
  const el = $('#toast'); el.textContent = t; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
function floater(u, text, kind = '') {
  if (!u.actor) return;
  const s = Scene.screenOf(u.actor);
  const el = document.createElement('div');
  el.className = `floater ${kind}`; el.textContent = text;
  el.style.left = `${s.x + (rnd() - 0.5) * 50}px`;
  el.style.top = `${(s.y + s.top) / 2 + (kind === 'status' ? -40 : 0)}px`;
  $('#floaters').appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

// ======================= 头顶信息板 =======================
function makePlate(u) {
  const el = document.createElement('div');
  el.className = 'plate';
  el.innerHTML = `
    <div class="hitbox"></div>
    ${u.isEnemy ? '<div class="intent"></div>' : ''}
    <div class="bar"><div class="lag"></div><div class="fill"></div><div class="txt"></div></div>
    <div class="pname">${u.name}</div>
    <div class="statuses"></div>`;
  const hb = el.querySelector('.hitbox');
  if (u.isEnemy) {
    hb.addEventListener('pointerenter', () => { if (armed || drag) setHover(u); });
    hb.addEventListener('pointerleave', () => { if (hover === u) setHover(null); });
    hb.addEventListener('click', () => { if (armed && u.hp > 0) { const c = armed.card; disarm(); playCard(c, u); } });
  }
  $('#plates').appendChild(el);
  u.plate = el;
  refreshPlate(u);
}

function statusHtml(u) {
  return Object.entries(u.status).filter(([, v]) => v > 0).map(([k, v]) => {
    const s = STATUS_INFO[k];
    return `<span class="status ${s.kind}" data-tip="${s.name} ${v}\n${s.tip.replace('N', v)}">${s.name[0]}${v}</span>`;
  }).join('');
}

function intentInfo(e) {
  const it = e.intent; if (!it) return { html: '', tip: '' };
  const parts = [], tips = [];
  if (it.atk != null) {
    const d = calcDmg(e, G.player, it.atk);
    parts.push(icon(it.hits > 1 ? 'swords' : 'sword', '#ff6a5a') + `<span>${d}${it.hits > 1 ? '×' + it.hits : ''}</span>`);
    tips.push(`攻击 ${d}${it.hits > 1 ? ' × ' + it.hits : ''}`);
  }
  if (it.block) { parts.push(icon('shield', '#8fb3cf')); tips.push(`获得 ${it.block} 格挡`); }
  if (it.self) { parts.push(icon('up', '#ffd27a')); tips.push('强化自身：' + Object.entries(it.self).map(([k, v]) => `${STATUS_INFO[k].name} ${v}`).join('、')); }
  if (it.foe) {
    const burn = it.foe.burn;
    parts.push(icon(burn ? 'flame' : 'skull', burn ? '#ff7a2f' : '#b9a6ff'));
    tips.push('对你施加：' + Object.entries(it.foe).map(([k, v]) => `${STATUS_INFO[k].name} ${v}`).join('、'));
  }
  return { html: parts.join(''), tip: `${it.name}\n${tips.join('\n')}` };
}

function refreshPlate(u) {
  const el = u.plate; if (!el) return;
  const k = Math.max(0, u.hp / u.maxHp);
  el.querySelector('.fill').style.transform = `scaleX(${k})`;
  el.querySelector('.lag').style.transform = `scaleX(${k})`;
  el.querySelector('.txt').textContent = `${u.hp}/${u.maxHp}`;
  const bar = el.querySelector('.bar');
  bar.classList.toggle('blocked', u.block > 0);
  let badge = bar.querySelector('.block-badge');
  if (u.block > 0) { if (!badge) { badge = document.createElement('div'); badge.className = 'block-badge'; bar.appendChild(badge); } badge.textContent = u.block; }
  else if (badge) badge.remove();
  el.querySelector('.statuses').innerHTML = statusHtml(u);
  if (u.isEnemy) {
    const it = el.querySelector('.intent'), info = intentInfo(u);
    it.innerHTML = C && C.phase === 'player' && u.hp > 0 ? info.html : '';
    it.dataset.tip = info.tip;
  }
}

function trackPlates() {
  const units = C ? [G.player, ...C.enemies] : [];
  for (const u of units) {
    if (!u.plate || !u.actor) continue;
    const s = Scene.screenOf(u.actor);
    u.plate.style.left = `${s.x}px`;
    u.plate.style.top = `${s.y + 8}px`;
    u.plate.style.setProperty('--h', `${Math.max(60, s.y - s.top)}px`);
  }
  requestAnimationFrame(trackPlates);
}

function refresh() {
  hud();
  if (!C) return;
  [G.player, ...C.enemies].forEach(refreshPlate);
  $('#energy-val').textContent = C.energy;
  $('#energy-max').textContent = C.maxEnergy;
  $('#energy').classList.toggle('empty', C.energy === 0);
  $('#draw-count').textContent = C.draw.length;
  $('#discard-count').textContent = C.discard.length;
  const anyPlayable = C.hand.some(canPlay);
  $('#btn-end').disabled = C.phase !== 'player' || G.busy;
  $('#btn-end').classList.toggle('pulse', C.phase === 'player' && !anyPlayable);
  C.hand.forEach(c => {
    const el = handEls.get(c.uid); if (!el) return;
    updateCardEl(el, c);
    el.classList.toggle('unplayable', !canPlay(c));
  });
}

// ======================= 战斗 API（卡牌脚本调用） =======================
function damage(u, dmg, power = 1, { pierce = false, kind = '' } = {}) {
  let rest = dmg;
  if (!pierce) {
    const b = Math.min(u.block, rest); u.block -= b; rest -= b;
    if (b > 0 && rest === 0) floater(u, '格挡', 'block');
  }
  u.hp = Math.max(0, u.hp - rest);
  if (rest > 0 || pierce) floater(u, `${rest}`, kind);
  Scene.hit(u.actor, kind === 'burn' ? 0xff5a10 : 0xffffff, power);
  Scene.burst(Scene.center(u.actor), kind === 'burn' ? 0xff6a1a : u.isEnemy ? 0xffc080 : 0xff4030, rest > 15 ? 30 : 16, 4 + power * 2);
  refreshPlate(u);
  if (u.hp <= 0 && u.isEnemy && !u.dead) {
    u.dead = true;
    Scene.burst(Scene.center(u.actor), 0xff7a2f, 40, 7, 0.5);
    Scene.remove(u.actor);
    u.plate.style.transition = 'opacity .5s'; u.plate.style.opacity = '0';
    setTimeout(() => u.plate && u.plate.remove(), 600);
  }
}

Object.assign(G, {
  refresh,
  async attack(t, base, hits = 1, fx = 'slash', raw = false) {
    const P = G.player; if (!t || t.hp <= 0) return;
    const ranged = fx === 'fire' || fx === 'explode';
    await Scene.lunge(P.actor, 1, ranged ? 0.5 : 1.6);
    for (let i = 0; i < hits; i++) {
      if (t.hp <= 0) break;
      const dmg = calcDmg(P, t, base, raw);
      if (ranged) await Scene.projectile(Scene.center(P.actor, 0.7), Scene.center(t.actor), fx === 'explode' ? 0xffd060 : 0xff6a1a, 280);
      else Scene.slash(Scene.center(t.actor, 0.55), fx === 'heavy' ? 0xffb070 : 0xffe8c8);
      damage(t, dmg, fx === 'heavy' || fx === 'explode' ? 1.8 : 1);
      if (i < hits - 1) await wait(170);
    }
    await wait(120);
  },
  async attackAll(base) {
    const P = G.player;
    await Scene.lunge(P.actor, 1, 1.2);
    Scene.ring(P.actor.group.position.clone().setX(P.actor.group.position.x + 2), 0xff7a2f, 3);
    for (const e of alive()) { Scene.slash(Scene.center(e.actor, 0.5), 0xffa060); damage(e, calcDmg(P, e, base), 1.2); }
    await wait(250);
  },
  async gainBlock(n) {
    const u = G.player; u.block += n;
    floater(u, `+${n}`, 'block'); Scene.pulse(u.actor, 0x3a7ab4); refresh();
    await wait(150);
  },
  async apply(u, key, n) {
    if (n <= 0 || !u || u.hp <= 0) return;
    if (key === 'burn' && u.isEnemy && has('bellows')) { n += 1; relicFlash('bellows'); }
    u.status[key] = (u.status[key] || 0) + n;
    if (key === 'ritual') u.ritualFresh = true;
    const info = STATUS_INFO[key];
    floater(u, `${info.name} +${n}`, 'status');
    Scene.pulse(u.actor, info.kind === 'burn' ? 0xff4a00 : info.kind === 'buff' ? 0xb08020 : 0x5a3aa0);
    if (key === 'burn') Scene.burst(Scene.center(u.actor, 0.3), 0xff6a1a, 10, 3, 0.3);
    refresh();
    await wait(140);
  },
  async applyAll(key, n) { for (const e of alive()) await G.apply(e, key, n); },
  async draw(n) {
    for (let i = 0; i < n; i++) {
      if (!C.draw.length) {
        if (!C.discard.length) break;
        C.draw = shuffle(C.discard); C.discard = [];
      }
      if (C.hand.length >= 10) break;
      C.hand.push(C.draw.pop());
      renderHand();
      await wait(90);
    }
    refresh();
  },
  async loseHp(n) {
    const P = G.player; P.hp = Math.max(0, P.hp - n);
    floater(P, `${n}`, ''); Scene.hit(P.actor, 0xff2010, 0.6); refresh(); await wait(150);
  },
  gainEnergy(n) { C.energy += n; refresh(); },
  totalBurn: () => alive().reduce((s, e) => s + (e.status.burn || 0), 0),
  heal(n) { const P = G.player; P.hp = Math.min(P.maxHp, P.hp + n); if (P.actor && C) floater(P, `+${n}`, 'heal'); hud(); },
  addCard(id) { G.player.deck.push(mk(id)); hud(); },
  gainRandomRelic() {
    const pool = RELIC_POOL.filter(r => !has(r));
    if (!pool.length) { G.player.gold += 50; return '遗物已经收集齐了，改为获得 50 金。'; }
    const r = pick(pool); addRelic(r);
    return `获得遗物「${RELICS[r].name}」：${RELICS[r].tip}`;
  },
  upgradeRandom(n) {
    const pool = shuffle(G.player.deck.filter(c => !c.up && defOf(c).type !== 'curse')).slice(0, n);
    pool.forEach(c => { c.up = true; });
    hud();
    return pool.length ? `升级了：${pool.map(c => defOf(c).name + '+').join('、')}` : '没有可以升级的牌了。';
  },
  removeCardFlow() { return pickFromDeck('移除一张牌', () => true).then(c => { if (!c) return '你决定什么也不移除。'; G.player.deck = G.player.deck.filter(x => x !== c); hud(); return `「${defOf(c).name}」化为了灰烬。`; }); },
});

function addRelic(r) {
  G.player.relics.push(r);
  if (r === 'ashUrn') { G.player.maxHp += 10; G.player.hp += 10; }
  hud(); relicFlash(r);
}
const alive = () => C ? C.enemies.filter(e => e.hp > 0) : [];

// ======================= 战斗流程 =======================
async function startCombat(kind) {
  const P = G.player;
  const pool = kind === 'fight' ? (G.floor <= 2 ? ENCOUNTERS.easy : ENCOUNTERS.normal) : ENCOUNTERS[kind];
  const ids = pick(pool);
  $('#screen').innerHTML = ''; $('#screen').className = '';
  Scene.setMode('combat'); Music.play(kind === 'boss' ? 'boss' : 'combat');
  P.block = 0; P.status = {};
  C = { kind, enemies: [], draw: shuffle(P.deck.map(c => ({ ...c }))), hand: [], discard: [], exhaust: [], energy: 0, maxEnergy: 3, turn: 0, phase: 'start', over: false };
  const xs = { 1: [3.4], 2: [1.9, 5], 3: [0.9, 3.4, 5.9] }[ids.length];
  const scale = 1 + Math.max(0, G.floor - 1) * 0.04;
  C.enemies = ids.map((id, i) => {
    const d = ENEMIES[id];
    const hp = Math.round((d.hp[0] + Math.floor(rnd() * (d.hp[1] - d.hp[0] + 1))) * (d.boss ? 1 : scale));
    const e = { id, def: d, name: d.name, hp, maxHp: hp, block: 0, status: {}, history: [], isEnemy: true };
    e.actor = Scene.spawn(d.model, xs[i], d.boss ? -1 : (i % 2 ? -0.9 : 0.2));
    makePlate(e);
    return e;
  });
  if (!P.plate) makePlate(P);
  $('#plates').hidden = false;
  $('#combat-ui').hidden = false;
  refresh();
  await wait(650);
  toast(kind === 'boss' ? '灰烬之王' : kind === 'elite' ? '精英来袭' : '战斗开始');
  if (has('whetstone')) { relicFlash('whetstone'); await G.apply(P, 'str', 1); }
  if (has('tinderbox')) { relicFlash('tinderbox'); await G.applyAll('burn', 2); }
  rollIntents();
  await wait(500);
  startPlayerTurn();
}

function rollIntents() { alive().forEach(e => { e.intent = e.def.ai(e, rnd); }); refresh(); }

async function startPlayerTurn() {
  const P = G.player;
  G.busy = true;
  C.turn++; C.phase = 'player';
  P.block = 0;
  C.energy = C.maxEnergy;
  if (has('hourglass') && C.turn % 3 === 0) { C.energy++; relicFlash('hourglass'); }
  refresh();
  if (C.turn > 1) toast('你的回合');
  if (C.turn === 1 && has('anvil')) { relicFlash('anvil'); await G.gainBlock(8); }
  if (P.status.burn) { await burnTick(P); if (checkEnd()) return; }
  if (P.status.pyre) await G.applyAll('burn', P.status.pyre);
  await G.draw(5 + (C.turn === 1 && has('boneDice') ? 2 : 0));
  if (C.turn === 1 && has('boneDice')) relicFlash('boneDice');
  G.busy = false;
  refresh();
}

async function burnTick(u) {
  const n = u.status.burn;
  Scene.burst(Scene.center(u.actor, 0.3), 0xff5a10, 24, 3.5, 0.4);
  damage(u, n, 0.8, { pierce: true, kind: 'burn' });
  u.status.burn = n - 1;
  refresh();
  await wait(320);
  if (u.isEnemy && G.player.status.kindle) await G.gainBlock(G.player.status.kindle);
}

function tickDebuffs(u) { ['vuln', 'weak'].forEach(k => { if (u.status[k] > 0) u.status[k]--; }); }

async function endTurn() {
  if (!C || G.busy || C.phase !== 'player') return;
  disarm();
  G.busy = true; C.phase = 'enemy';
  // 弃掉手牌
  C.hand.forEach(c => flyAway(c, 'discard'));
  C.discard.push(...C.hand); C.hand = [];
  tickDebuffs(G.player);
  refresh();
  await wait(350);
  for (const e of C.enemies) {
    if (e.hp <= 0) continue;
    e.block = 0; refreshPlate(e);
    if (e.status.burn) { await burnTick(e); if (checkEnd()) return; if (e.hp <= 0) continue; }
    await enemyAct(e);
    if (checkEnd()) return;
    if (e.status.ritual) { if (e.ritualFresh) e.ritualFresh = false; else await G.apply(e, 'str', e.status.ritual); }
    tickDebuffs(e); refreshPlate(e);
    await wait(220);
  }
  if (checkEnd()) return;
  rollIntents();
  startPlayerTurn();
}

async function enemyAct(e) {
  const it = e.intent, P = G.player;
  e.history.push(it.id);
  floater(e, it.name, 'status');
  await wait(250);
  if (it.block) { e.block += it.block; floater(e, `+${it.block}`, 'block'); Scene.pulse(e.actor, 0x3a7ab4); refreshPlate(e); await wait(200); }
  if (it.self) for (const [k, v] of Object.entries(it.self)) await G.apply(e, k, v);
  if (it.atk != null) {
    await Scene.lunge(e.actor, -1, e.def.boss ? 1.2 : 1.8);
    const hits = it.hits || 1;
    for (let i = 0; i < hits; i++) {
      Scene.slash(Scene.center(P.actor, 0.55), 0xff8070);
      damage(P, calcDmg(e, P, it.atk), e.def.boss || e.def.elite ? 1.6 : 1);
      if (P.hp <= 0) return;
      if (i < hits - 1) await wait(190);
    }
    await wait(150);
  }
  if (it.foe) for (const [k, v] of Object.entries(it.foe)) await G.apply(P, k, v);
  refresh();
  await wait(200);
}

function checkEnd() {
  if (!C || C.over) return true;
  if (G.player.hp <= 0) { C.over = true; defeat(); return true; }
  if (!alive().length) { C.over = true; victory(); return true; }
  return false;
}

function canPlay(c) {
  const cost = costOf(c);
  return C && C.phase === 'player' && !G.busy && cost >= 0 && C.energy >= cost && !C.over;
}

async function playCard(c, target) {
  const d = defOf(c);
  if (!canPlay(c)) { complain(c); return; }
  if (d.target === 'enemy' && (!target || target.hp <= 0)) return;
  G.busy = true;
  C.energy -= costOf(c);
  C.hand = C.hand.filter(x => x !== c);
  flyAway(c, 'play');
  setHover(null);
  renderHand(); refresh();
  await d.play(G, valsOf(c), target);
  if (d.type === 'attack' && G.player.status.forge) await G.gainBlock(G.player.status.forge);
  if (d.type !== 'power') (d.ex ? C.exhaust : C.discard).push(c);
  G.busy = false;
  refresh();
  checkEnd();
}

function complain(c) {
  if (!C || C.phase !== 'player') return;
  const cost = costOf(c);
  floater(G.player, cost < 0 ? '无法打出' : '能量不足', 'status');
  const el = $('#energy'); el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.2)' }, { transform: 'scale(1)' }], { duration: 250 });
}

async function endCombatCleanup() {
  $('#combat-ui').hidden = true;
  $('#plates').hidden = true;
  handEls.forEach(el => el.remove()); handEls.clear();
  C.enemies.forEach(e => e.plate && e.plate.remove());
  Scene.clearEnemies(G.player.actor);
  const P = G.player; P.block = 0; P.status = {};
  refreshPlate(P);
}

async function victory() {
  G.busy = true;
  await wait(900);
  const kind = C.kind;
  await endCombatCleanup();
  if (has('emberHeart')) { G.heal(6); relicFlash('emberHeart'); }
  C = null;
  if (kind === 'boss') return endScreen(true);
  rewards(kind);
}

async function defeat() {
  G.busy = true;
  Scene.shake(0.5);
  await wait(400);
  Scene.remove(G.player.actor);
  await wait(1100);
  await endCombatCleanup();
  G.player.actor = null;
  if (G.player.plate) { G.player.plate.remove(); G.player.plate = null; }
  C = null;
  endScreen(false);
}

// ======================= 手牌 =======================
const handEls = new Map();
let drag = null, armed = null, hover = null;
const cardSize = () => matchMedia('(max-width: 700px)').matches ? { W: 112, H: 164 } : { W: 150, H: 212 };

function renderHand() {
  const hand = $('#hand');
  const uids = new Set(C.hand.map(c => c.uid));
  handEls.forEach((el, uid) => { if (!uids.has(uid) && !el.classList.contains('leaving')) { el.remove(); handEls.delete(uid); } });
  C.hand.forEach(c => {
    if (handEls.has(c.uid)) return;
    const el = cardEl(c);
    // 从抽牌堆飞入
    el.style.transform = `translate(${-innerWidth / 2 + 40}px, -80px) scale(.25) rotate(-30deg)`;
    el.style.opacity = '0';
    bindCard(el, c);
    hand.appendChild(el);
    handEls.set(c.uid, el);
  });
  requestAnimationFrame(() => requestAnimationFrame(layoutHand));
}

function handPose(i, n) {
  const { W, H } = cardSize();
  const span = Math.min(innerWidth - 300, 920);
  const spacing = Math.min(W * 0.82, span / Math.max(n, 1));
  const off = i - (n - 1) / 2;
  const x = off * spacing - W / 2;
  const y = -H - 6 + off * off * 2.4;
  const rot = Math.max(-18, Math.min(18, off * 3.5));
  return {
    base: `translate(${x}px, ${y}px) rotate(${rot}deg)`,
    focus: `translate(${x}px, ${-H - 26}px) rotate(0deg) scale(1.14)`,
    x, y,
  };
}

function layoutHand() {
  if (!C) return;
  const n = C.hand.length;
  C.hand.forEach((c, i) => {
    const el = handEls.get(c.uid); if (!el) return;
    const p = handPose(i, n);
    el.dataset.base = p.base; el.dataset.focus = p.focus;
    el.style.zIndex = i + 1;
    el.style.opacity = '1';
    if (drag && drag.card === c) return;
    el.style.transform = (el.matches(':hover') || (armed && armed.card === c)) ? p.focus : p.base;
  });
}

function flyAway(c, where) {
  const el = handEls.get(c.uid); if (!el) return;
  el.classList.add('leaving'); el.classList.remove('dragging', 'armed', 'focus');
  handEls.delete(c.uid);
  const { W } = cardSize();
  if (where === 'play') {
    el.classList.add('playing');
    el.style.transform = `translate(${-W / 2}px, ${-innerHeight * 0.62}px) scale(.85)`;
  } else {
    el.style.transition = 'transform .4s ease-in, opacity .4s';
    el.style.transform = `translate(${innerWidth / 2 - 90}px, -60px) scale(.25) rotate(40deg)`;
    el.style.opacity = '0';
  }
  setTimeout(() => el.remove(), 420);
}

function bindCard(el, c) {
  el.addEventListener('pointerenter', () => { if (!drag && !armed) el.style.transform = el.dataset.focus || el.style.transform; });
  el.addEventListener('pointerleave', () => { if (!drag && !(armed && armed.card === c)) el.style.transform = el.dataset.base || el.style.transform; });
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !C) return;
    e.stopPropagation();
    if (armed) { const same = armed.card === c; disarm(); if (same) return; }
    drag = { card: c, el, sx: e.clientX, sy: e.clientY, moved: false };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', e => {
    if (!drag || drag.card !== c) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 12) return;
      if (!canPlay(c)) { complain(c); drag = null; return; }
      drag.moved = true; el.classList.add('dragging');
    }
    const { W, H } = cardSize();
    if (defOf(c).target === 'enemy') {
      el.style.transform = `translate(${-W / 2}px, ${-H - 40}px) scale(1.1)`;
      drawAim(innerWidth / 2, innerHeight - H - 40, e.clientX, e.clientY);
      setHover(enemyAt(e.clientX, e.clientY));
    } else {
      el.style.transform = `translate(${e.clientX - innerWidth / 2 - W / 2}px, ${e.clientY - innerHeight - H / 2}px) scale(1.05)`;
      el.classList.toggle('armed', e.clientY < innerHeight - H - 30);
    }
  });
  const finish = e => {
    if (!drag || drag.card !== c) return;
    const d = drag; drag = null;
    el.classList.remove('dragging', 'armed');
    hideAim();
    if (!d.moved) { if (e.type === 'pointerup') clickCard(c); return; }
    const { H } = cardSize();
    if (defOf(c).target === 'enemy') {
      const t = enemyAt(e.clientX, e.clientY);
      setHover(null);
      if (t) return playCard(c, t);
    } else if (e.clientY < innerHeight - H - 30 && e.type === 'pointerup') return playCard(c);
    layoutHand();
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);
}

function clickCard(c) {
  if (!canPlay(c)) return complain(c);
  if (defOf(c).target !== 'enemy') return playCard(c);
  const foes = alive();
  if (foes.length === 1) return playCard(c, foes[0]);
  armed = { card: c, el: handEls.get(c.uid) };
  armed.el.classList.add('armed');
  armed.el.style.transform = armed.el.dataset.focus;
  $('#target-hint').hidden = false;
  alive().forEach(e => e.plate.classList.add('targetable'));
}

function disarm() {
  if (!armed) return;
  armed.el.classList.remove('armed');
  if (armed.el.dataset.base) armed.el.style.transform = armed.el.dataset.base;
  armed = null; hideAim(); setHover(null);
  $('#target-hint').hidden = true;
  if (C) C.enemies.forEach(e => e.plate && e.plate.classList.remove('targetable'));
}

function enemyAt(x, y) {
  return alive().find(e => {
    const r = e.plate.querySelector('.hitbox').getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom + 40;
  }) || null;
}

function setHover(u) {
  if (hover === u) return;
  if (hover) { Scene.setTargeted(hover.actor, false); hover.plate && hover.plate.classList.remove('targeted'); }
  hover = u;
  if (u) { Scene.setTargeted(u.actor, true); u.plate.classList.add('targeted'); }
}

function drawAim(x1, y1, x2, y2) {
  const svg = $('#aim');
  const cx = x1 + (x2 - x1) * 0.2, cy = Math.min(y1, y2) - 120;
  const ang = Math.atan2(y2 - cy, x2 - cx) * 180 / Math.PI;
  const col = hover ? '#ff7a2f' : '#eadcc2';
  svg.innerHTML = `
    <path d="M${x1},${y1} Q${cx},${cy} ${x2},${y2}" fill="none" stroke="#000a" stroke-width="14" stroke-linecap="round" stroke-dasharray="1 22"/>
    <path d="M${x1},${y1} Q${cx},${cy} ${x2},${y2}" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round" stroke-dasharray="1 22"/>
    <polygon points="0,-14 28,0 0,14 6,0" fill="${col}" stroke="#000" stroke-width="2" transform="translate(${x2},${y2}) rotate(${ang}) translate(-18,0)"/>`;
}
const hideAim = () => { $('#aim').innerHTML = ''; };

addEventListener('pointermove', e => {
  if (!armed) return;
  const { H } = cardSize();
  drawAim(innerWidth / 2, innerHeight - H - 40, e.clientX, e.clientY);
});
addEventListener('pointerdown', e => {
  if (armed && !e.target.closest('.hitbox') && !e.target.closest('#hand')) disarm();
});
addEventListener('contextmenu', e => { if (armed) { e.preventDefault(); disarm(); } });
addEventListener('keydown', e => {
  if (!C || $('#overlay').innerHTML) return;
  if (e.key === 'e' || e.key === 'E') endTurn();
  else if (e.key === 'Escape') disarm();
  else if (/^[1-9]$/.test(e.key)) { const c = C.hand[+e.key - 1]; if (c) { disarm(); clickCard(c); } }
});
addEventListener('resize', () => { if (C) layoutHand(); });

// ======================= 地图 =======================
function genMap() {
  const rows = [];
  for (let r = 0; r < 7; r++) {
    const n = r === 0 ? 3 : 2 + Math.floor(rnd() * 3);
    const row = [];
    for (let i = 0; i < n; i++) {
      let type;
      if (r === 0) type = 'fight';
      else if (r === 6) type = 'rest';
      else if (r === 3) type = 'treasure';
      else {
        const roll = rnd();
        type = roll < 0.45 ? 'fight' : roll < 0.67 ? 'event' : roll < 0.8 && r >= 2 ? 'elite' : roll < 0.9 ? 'shop' : r >= 2 ? 'rest' : 'event';
      }
      row.push({ r, i, x: (i + 1) / (n + 1) + (rnd() - 0.5) * 0.08, type, next: [] });
    }
    rows.push(row);
  }
  const boss = { r: 7, i: 0, x: 0.5, type: 'boss', next: [] };
  for (let r = 0; r < 6; r++) {
    const cur = rows[r], nxt = rows[r + 1];
    const nearest = (x, list) => list.reduce((a, b) => Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a);
    cur.forEach(nd => {
      const a = nearest(nd.x, nxt); nd.next.push(a);
      if (rnd() < 0.45) {
        const others = nxt.filter(b => b !== a && Math.abs(b.x - nd.x) < 0.42);
        if (others.length) nd.next.push(nearest(nd.x, others));
      }
    });
    nxt.forEach(b => { if (!cur.some(nd => nd.next.includes(b))) nearest(b.x, cur).next.push(b); });
  }
  rows[6].forEach(nd => nd.next.push(boss));
  return { rows, boss };
}

function availableNodes() { return G.pos ? G.pos.next : G.map.rows[0]; }

function showMap() {
  Scene.setMode('map'); Music.play('map');
  const scr = $('#screen'); scr.className = '';
  const ROW = 76, H = 8 * ROW + 40;
  const yOf = r => r === 7 ? 50 : H - 30 - r * ROW;
  const avail = new Set(availableNodes());
  const all = [...G.map.rows.flat(), G.map.boss];
  let lines = '';
  all.forEach(nd => nd.next.forEach(b => {
    const walked = G.visited.has(nd) && G.visited.has(b);
    lines += `<line x1="${nd.x * 100}" y1="${yOf(nd.r)}" x2="${b.x * 100}" y2="${yOf(b.r)}" stroke="${walked ? '#ff7a2f' : '#6b5640'}" stroke-width="${walked ? 3 : 2}" stroke-dasharray="${walked ? '' : '2 7'}" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
  }));
  const nodes = all.map((nd, k) => {
    const cls = [nd.type === 'boss' ? 'boss' : '', G.visited.has(nd) ? 'done' : '', G.pos === nd ? 'current' : '', avail.has(nd) ? 'avail' : ''].join(' ');
    return `<button type="button" class="mnode ${cls}" data-k="${k}" style="left:${nd.x * 100}%;top:${yOf(nd.r)}px" ${avail.has(nd) ? '' : 'disabled'} aria-label="${NODE[nd.type].name}" data-tip="${NODE[nd.type].name}">${NODE[nd.type].glyph}</button>`;
  }).join('');
  scr.innerHTML = `
    <div class="panel">
      <h2>第 ${G.floor + 1} 层 · 选择前路</h2>
      <div class="legend">${['fight', 'elite', 'event', 'shop', 'rest', 'treasure'].map(t => `<span><b>${NODE[t].glyph}</b>${NODE[t].name}</span>`).join('')}</div>
      <div class="map-wrap" style="height:${H}px">
        <svg class="paths" viewBox="0 0 100 ${H}" preserveAspectRatio="none">${lines}</svg>
        ${nodes}
      </div>
    </div>`;
  scr.querySelectorAll('.mnode:not([disabled])').forEach(b => b.addEventListener('click', () => enterNode(all[+b.dataset.k])));
  const cur = scr.querySelector('.mnode.avail');
  if (cur) cur.scrollIntoView({ block: 'center' });
}

function enterNode(nd) {
  G.pos = nd; G.visited.add(nd); G.floor++;
  hud();
  ({
    fight: () => startCombat('fight'), elite: () => startCombat('elite'), boss: () => startCombat('boss'),
    rest: restSite, shop: shopScreen, event: eventScreen, treasure: treasureScreen,
  })[nd.type]();
}

// ======================= 面板 =======================
function panel(html, cls = '') {
  const scr = $('#screen'); scr.className = cls;
  scr.innerHTML = `<div class="panel">${html}</div>`;
  scr.scrollTop = 0;
  return scr.firstElementChild;
}

function rollCards(n, eliteBias = false) {
  const out = [];
  while (out.length < n) {
    const rare = rnd() < (eliteBias ? 0.35 : 0.14);
    const pool = REWARD_POOL.filter(k => RARE.has(k) === rare && !out.includes(k));
    out.push(pick(pool.length ? pool : REWARD_POOL.filter(k => !out.includes(k))));
  }
  return out;
}

function rewards(kind) {
  const gold = kind === 'elite' ? 28 + Math.floor(rnd() * 12) : 12 + Math.floor(rnd() * 10);
  const items = [{ k: 'gold', ic: '金', label: `${gold} 金币` }, { k: 'card', ic: '牌', label: '将一张牌加入牌组' }];
  if (kind === 'elite') items.push({ k: 'relic', ic: '宝', label: '一件遗物' });
  const draw = () => {
    const p = panel(`
      <h2>战利品</h2>
      <div class="loot">${items.map((it, i) => `<button type="button" data-i="${i}"><span class="ic">${it.ic}</span><span>${it.label}</span></button>`).join('')}</div>
      <button type="button" class="btn" id="go-on">继续前进</button>`);
    p.querySelectorAll('.loot button').forEach(b => b.addEventListener('click', async () => {
      const it = items[+b.dataset.i];
      if (it.k === 'gold') { G.player.gold += gold; hud(); }
      if (it.k === 'relic') { const msg = G.gainRandomRelic(); floatNote(msg); }
      if (it.k === 'card') { const ok = await chooseCard(rollCards(3, kind === 'elite')); if (!ok) return; }
      items.splice(+b.dataset.i, 1); draw();
    }));
    p.querySelector('#go-on').addEventListener('click', showMap);
  };
  draw();
}

function floatNote(msg) { toast(''); const el = $('#toast'); el.style.fontSize = '28px'; el.textContent = msg; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); setTimeout(() => { el.style.fontSize = ''; }, 1400); }

function overlay(html) {
  const ov = $('#overlay');
  ov.innerHTML = `<div class="panel">${html}</div>`;
  ov.scrollTop = 0;
  return ov.firstElementChild;
}
const closeOverlay = () => { $('#overlay').innerHTML = ''; };

function chooseCard(ids) {
  return new Promise(res => {
    const p = overlay(`<h2>选择一张牌</h2><div class="choice-cards"></div><button type="button" class="btn ghost" id="skip">跳过</button>`);
    const box = p.querySelector('.choice-cards');
    ids.forEach(id => {
      const c = mk(id), el = cardEl(c);
      el.addEventListener('click', () => { G.player.deck.push(c); hud(); closeOverlay(); res(true); });
      box.appendChild(el);
    });
    p.querySelector('#skip').addEventListener('click', () => { closeOverlay(); res(false); });
  });
}

function pickFromDeck(title, filter, cancelLabel = '取消') {
  return new Promise(res => {
    const p = overlay(`<h2>${title}</h2><div class="card-grid"></div><button type="button" class="btn ghost" id="cancel">${cancelLabel}</button>`);
    const grid = p.querySelector('.card-grid');
    const list = G.player.deck.filter(filter);
    if (!list.length) grid.outerHTML = '<p class="sub">没有符合条件的牌。</p>';
    list.forEach(c => {
      const el = cardEl(c);
      el.addEventListener('click', () => { closeOverlay(); res(c); });
      grid.appendChild(el);
    });
    p.querySelector('#cancel').addEventListener('click', () => { closeOverlay(); res(null); });
  });
}

function showPile(title, cards) {
  const p = overlay(`<h2>${title}</h2><div class="card-grid"></div><button type="button" class="btn ghost" id="cancel">关闭</button>`);
  const grid = p.querySelector('.card-grid');
  if (!cards.length) grid.outerHTML = '<p class="sub">空的。</p>';
  cards.forEach(c => grid.appendChild(cardEl(c)));
  p.querySelector('#cancel').addEventListener('click', closeOverlay);
}

function restSite() {
  const P = G.player, heal = Math.round(P.maxHp * 0.3);
  const p = panel(`
    <h2>篝火</h2>
    <p class="sub">火堆噼啪作响。你可以在这里歇口气，或者把剑重新烧红。</p>
    <div class="rest-opts">
      <button type="button" class="rest-opt" id="r-heal"><span class="big">歇息</span><small>回复 ${heal} 点生命<br>（${P.hp} → ${Math.min(P.maxHp, P.hp + heal)}）</small></button>
      <button type="button" class="rest-opt" id="r-smith"><span class="big">锻造</span><small>升级牌组中的一张牌</small></button>
    </div>`);
  p.querySelector('#r-heal').addEventListener('click', () => { G.heal(heal); showMap(); });
  p.querySelector('#r-smith').addEventListener('click', async () => {
    const c = await pickFromDeck('选择要升级的牌', x => !x.up && defOf(x).type !== 'curse');
    if (!c) return;
    c.up = true; hud(); floatNote(`${defOf(c).name}+`); showMap();
  });
}

function shopScreen() {
  const cards = rollCards(5).map(id => ({ c: mk(id), price: (RARE.has(id) ? 110 : 48) + Math.floor(rnd() * 30), sold: false }));
  const relicPool = RELIC_POOL.filter(r => !has(r));
  const relic = relicPool.length ? { r: pick(relicPool), price: 140 + Math.floor(rnd() * 40), sold: false } : null;
  const removal = { price: 75, sold: false };
  const draw = () => {
    const P = G.player;
    const p = panel(`
      <h2>商人</h2>
      <p class="sub">“灰烬换不来命，金子可以。” 你有 <b style="color:var(--gold)">${P.gold}</b> 金。</p>
      <div class="card-grid" id="shop-cards"></div>
      <div class="loot">
        ${relic ? `<button type="button" id="buy-relic" ${relic.sold || P.gold < relic.price ? 'disabled' : ''} style="${relic.sold ? 'opacity:.3' : ''}"><span class="ic">${relicImg(relic.r)}</span><span>${RELICS[relic.r].name} · <b style="color:var(--gold)">${relic.price} 金</b><small>${RELICS[relic.r].tip}</small></span></button>` : ''}
        <button type="button" id="buy-remove" ${removal.sold || P.gold < removal.price ? 'disabled' : ''} style="${removal.sold ? 'opacity:.3' : ''}"><span class="ic">烬</span><span>移除一张牌 · <b style="color:var(--gold)">${removal.price} 金</b><small>让一张牌化为灰烬</small></span></button>
      </div>
      <button type="button" class="btn" id="leave">离开</button>`);
    const grid = p.querySelector('#shop-cards');
    cards.forEach(it => {
      const wrap = document.createElement('div');
      wrap.className = `shop-item${it.sold ? ' sold' : ''}`;
      const el = cardEl(it.c);
      if (P.gold < it.price) el.style.filter = 'brightness(.55)';
      el.addEventListener('click', () => { if (P.gold < it.price || it.sold) return; P.gold -= it.price; it.sold = true; P.deck.push(it.c); hud(); draw(); });
      wrap.appendChild(el);
      wrap.insertAdjacentHTML('beforeend', `<div class="price">${it.price} 金</div>`);
      grid.appendChild(wrap);
    });
    p.querySelector('#buy-relic')?.addEventListener('click', () => { P.gold -= relic.price; relic.sold = true; addRelic(relic.r); draw(); });
    p.querySelector('#buy-remove').addEventListener('click', async () => {
      const c = await pickFromDeck('移除一张牌', () => true);
      if (!c) return;
      P.gold -= removal.price; removal.sold = true; P.deck = P.deck.filter(x => x !== c); hud(); draw();
    });
    p.querySelector('#leave').addEventListener('click', showMap);
  };
  draw();
}

function treasureScreen() {
  const msg = G.gainRandomRelic();
  const got = G.player.relics.at(-1);
  const p = panel(`<div style="width:96px;height:96px">${relicImg(got).replace("relic-img", "relic-img big")}</div><h2>余烬宝箱</h2><p class="sub">${msg}</p><button type="button" class="btn" id="go-on">继续</button>`);
  p.querySelector('#go-on').addEventListener('click', showMap);
}

function eventScreen() {
  const ev = pick(EVENTS);
  const p = panel(`
    <div style="width:90px;height:90px">${icon(ev.art, '#ff7a2f')}</div>
    <h2>${ev.title}</h2>
    <p class="sub">${ev.text}</p>
    <div class="loot">${ev.options.map((o, i) => `<button type="button" data-i="${i}" ${o.need && !o.need(G) ? 'disabled style="opacity:.4"' : ''}><span class="ic">${i + 1}</span><span>${o.label}<small>${o.hint}</small></span></button>`).join('')}</div>`);
  p.querySelectorAll('.loot button:not([disabled])').forEach(b => b.addEventListener('click', async () => {
    const res = await ev.options[+b.dataset.i].run(G);
    hud();
    const q = panel(`<div style="width:90px;height:90px">${icon(ev.art, '#ff7a2f')}</div><h2>${ev.title}</h2><p class="sub">${res}</p><button type="button" class="btn" id="go-on">继续</button>`);
    q.querySelector('#go-on').addEventListener('click', showMap);
  }));
}

function endScreen(win) {
  Scene.setMode('map'); Music.play(null);
  $('#hud').hidden = true;
  const p = panel(win
    ? `<h1>火熄</h1><h2>灰烬之王倒下了</h2><p class="sub">尖塔顶端的火焰慢慢暗下去。你带着 ${G.player.deck.length} 张牌、${G.player.relics.length} 件遗物登顶。</p><button type="button" class="btn" id="again">再爬一次</button>`
    : `<h1>灰飞</h1><h2>倒在第 ${G.floor} 层</h2><p class="sub">你的余烬散入尖塔的风里。下一次，也许能走得更高。</p><button type="button" class="btn" id="again">重新开始</button>`);
  p.querySelector('#again').addEventListener('click', newRun);
}

// ======================= 开局 =======================
function newRun() {
  if (G.player && G.player.actor) Scene.remove(G.player.actor);
  if (G.player && G.player.plate) G.player.plate.remove();
  G.player = {
    name: '余烬骑士', isEnemy: false, hp: 80, maxHp: 80, gold: 99, block: 0, status: {},
    deck: STARTER_DECK.map(id => mk(id)), relics: [],
  };
  G.player.actor = Scene.spawn('knight', -3.6, 0.3);
  G.map = genMap(); G.pos = null; G.visited = new Set(); G.floor = 0; G.busy = false;
  $('#hud').hidden = false;
  addRelic('emberHeart');
  showMap();
}

function title() {
  panel(`
    <h1>余烬尖塔</h1>
    <p class="sub">一名骑士，十张牌，八层石阶。用灼烧点燃敌人，用格挡熬过它们的反扑，在塔顶击倒灰烬之王。</p>
    <button type="button" class="btn" id="start">登塔</button>
    <p class="sub" style="font-size:13px;opacity:.7">拖动卡牌打出 · 攻击牌拖向敌人 · 也可以点击 · 数字键选牌 · E 结束回合</p>`, 'clear');
  $('#start').addEventListener('click', newRun);
}

$('#btn-end').addEventListener('click', endTurn);
$('#btn-deck').addEventListener('click', () => showPile('牌组', G.player.deck));
$('#pile-draw').addEventListener('click', () => C && showPile('抽牌堆（顺序已打乱）', [...C.draw].sort((a, b) => a.id.localeCompare(b.id))));
$('#pile-discard').addEventListener('click', () => C && showPile('弃牌堆', C.discard));

Scene.init($('#gl'));
trackPlates();
title();
