// 余烬尖塔 · 数据：卡牌 / 敌人 / 遭遇 / 遗物 / 事件
// 卡牌数值放在 v（基础）与 u（升级）里；文本中 {d*} 视为伤害、{b*} 视为格挡，会按状态实时修正

const ICONS = {
  sword: '<path d="M44 6 L58 6 L58 20 L26 52 L30 56 L26 60 L20 54 L12 62 L6 56 L14 48 L8 42 L12 38 L16 42 Z" fill="currentColor"/>',
  swords: '<path d="M8 6 L18 6 L44 32 L48 28 L52 32 L46 38 L54 46 L48 52 L40 44 L34 50 L30 46 L34 42 L8 16 Z M56 6 L46 6 L32 20 L38 26 L56 8 Z M20 40 L24 44 L16 52 L20 56 L14 60 L6 52 L10 46 L14 50 Z" fill="currentColor"/>',
  shield: '<path d="M32 4 L56 12 C56 36 48 52 32 60 C16 52 8 36 8 12 Z" fill="currentColor"/><path d="M32 12 L48 17 C48 34 42 46 32 52 Z" fill="#0004"/>',
  flame: '<path d="M32 4 C36 18 50 24 50 40 C50 52 42 60 32 60 C22 60 14 52 14 40 C14 30 20 26 22 18 C26 26 28 28 30 28 C30 18 30 12 32 4 Z" fill="currentColor"/><path d="M32 30 C34 38 42 40 42 48 C42 54 37 58 32 58 C27 58 22 54 22 48 C22 44 26 42 27 38 C29 42 31 40 32 30 Z" fill="#fff6"/>',
  burst: '<path d="M32 2 L38 22 L58 14 L44 30 L62 38 L42 40 L48 60 L32 46 L16 60 L22 40 L2 38 L20 30 L6 14 L26 22 Z" fill="currentColor"/>',
  up: '<path d="M32 4 L56 30 L42 30 L42 60 L22 60 L22 30 L8 30 Z" fill="currentColor"/>',
  drop: '<path d="M32 4 C40 20 52 30 52 42 C52 54 42 62 32 62 C22 62 12 54 12 42 C12 30 24 20 32 4 Z" fill="currentColor"/>',
  hammer: '<path d="M10 10 L40 10 L46 16 L46 28 L40 34 L34 34 L34 60 L24 60 L24 34 L10 34 Z" fill="currentColor"/>',
  eye: '<path d="M2 32 C14 14 50 14 62 32 C50 50 14 50 2 32 Z" fill="currentColor"/><circle cx="32" cy="32" r="9" fill="#000a"/>',
  heart: '<path d="M32 58 C10 42 4 30 4 20 C4 10 12 4 20 4 C26 4 30 8 32 12 C34 8 38 4 44 4 C52 4 60 10 60 20 C60 30 54 42 32 58 Z" fill="currentColor"/>',
  wave: '<path d="M2 40 C12 20 22 20 32 36 C42 52 52 48 62 28 L62 60 L2 60 Z" fill="currentColor"/>',
  anvil: '<path d="M4 16 L52 16 C52 24 58 26 62 26 L62 30 L44 30 L40 40 L48 48 L48 56 L16 56 L16 48 L24 40 L20 30 L12 30 C8 30 4 24 4 16 Z" fill="currentColor"/>',
  skull: '<path d="M32 4 C48 4 58 14 58 28 C58 38 52 42 50 44 L50 56 L14 56 L14 44 C12 42 6 38 6 28 C6 14 16 4 32 4 Z" fill="currentColor"/><circle cx="22" cy="30" r="7" fill="#000b"/><circle cx="42" cy="30" r="7" fill="#000b"/>',
  question: '<path d="M20 22 C20 10 44 8 44 22 C44 32 34 32 34 42 L28 42 C28 28 38 28 38 22 C38 14 26 14 26 22 Z M27 48 L35 48 L35 56 L27 56 Z" fill="currentColor"/>',
};
const icon = (k, color) => `<svg viewBox="0 0 64 64" style="color:${color || 'currentColor'}">${ICONS[k] || ICONS.question}</svg>`;

const STATUS_INFO = {
  str:    { name: '力量', kind: 'buff',   tip: '攻击伤害 +N。' },
  vuln:   { name: '破绽', kind: 'debuff', tip: '受到的攻击伤害提高 50%。持续 N 回合。' },
  weak:   { name: '虚弱', kind: 'debuff', tip: '造成的攻击伤害降低 25%。持续 N 回合。' },
  burn:   { name: '灼烧', kind: 'burn',   tip: '回合开始时受到 N 点伤害（无视格挡），然后层数 -1。' },
  ritual: { name: '狂信', kind: 'buff',   tip: '每回合结束时获得 N 点力量。' },
  pyre:   { name: '焚身', kind: 'buff',   tip: '回合开始时，对所有敌人施加 N 层灼烧。' },
  forge:  { name: '熔铸', kind: 'buff',   tip: '每打出一张攻击牌，获得 N 点格挡。' },
  kindle: { name: '薪火', kind: 'buff',   tip: '每当敌人因灼烧受到伤害，你获得 N 点格挡。' },
  plated: { name: '熔甲', kind: 'buff',   tip: '回合结束时获得 N 点格挡。' },
};

// ---------- 卡牌 ----------
const CARDS = {
  strike: {
    name: '斩击', type: 'attack', cost: 1, target: 'enemy', art: 'sword',
    v: { d: 6 }, u: { d: 9 }, text: '造成 {d} 点伤害。',
    play: async (g, v, t) => { await g.attack(t, v.d); },
  },
  defend: {
    name: '格挡', type: 'skill', cost: 1, target: 'self', art: 'shield',
    v: { b: 5 }, u: { b: 8 }, text: '获得 {b} 点格挡。',
    play: async (g, v) => { await g.gainBlock(v.b); },
  },
  ignite: {
    name: '引燃', type: 'attack', cost: 1, target: 'enemy', art: 'flame',
    v: { d: 5, n: 3 }, u: { d: 7, n: 4 }, text: '造成 {d} 点伤害。施加 {n} 层<em>灼烧</em>。',
    play: async (g, v, t) => { await g.attack(t, v.d, 1, 'fire'); await g.apply(t, 'burn', v.n); },
  },
  twinCut: {
    name: '双斩', type: 'attack', cost: 1, target: 'enemy', art: 'swords',
    v: { d: 4 }, u: { d: 6 }, text: '造成 {d} 点伤害两次。',
    play: async (g, v, t) => { await g.attack(t, v.d, 2); },
  },
  ashSweep: {
    name: '灰烬横扫', type: 'attack', cost: 1, target: 'all', art: 'wave',
    v: { d: 8 }, u: { d: 11 }, text: '对所有敌人造成 {d} 点伤害。',
    play: async (g, v) => { await g.attackAll(v.d); },
  },
  sunder: {
    name: '破甲', type: 'attack', cost: 2, target: 'enemy', art: 'hammer',
    v: { d: 8, n: 2 }, u: { d: 10, n: 3 }, text: '造成 {d} 点伤害。施加 {n} 层<em>破绽</em>。',
    play: async (g, v, t) => { await g.attack(t, v.d, 1, 'heavy'); await g.apply(t, 'vuln', v.n); },
  },
  spark: {
    name: '火星', type: 'attack', cost: 0, target: 'enemy', art: 'burst',
    v: { d: 3, n: 1 }, u: { d: 5, n: 1 }, text: '造成 {d} 点伤害。抽 {n} 张牌。',
    play: async (g, v, t) => { await g.attack(t, v.d); await g.draw(v.n); },
  },
  emberBlade: {
    name: '炎刃', type: 'attack', cost: 2, target: 'enemy', art: 'sword',
    v: { d: 12, n: 3 }, u: { d: 15, n: 5 }, text: '造成 {d} 点伤害。施加 {n} 层<em>灼烧</em>。',
    play: async (g, v, t) => { await g.attack(t, v.d, 1, 'fire'); await g.apply(t, 'burn', v.n); },
  },
  detonate: {
    name: '爆燃', type: 'attack', cost: 1, target: 'enemy', art: 'burst',
    v: { m: 2 }, u: { m: 3 }, text: '引爆目标的<em>灼烧</em>：每层造成 <b>{m}</b> 点伤害，然后移除灼烧。',
    play: async (g, v, t) => {
      const n = t.status.burn || 0; t.status.burn = 0; g.refresh();
      await g.attack(t, n * v.m, 1, 'explode', true);
    },
  },
  wildfire: {
    name: '燎原', type: 'skill', cost: 1, target: 'enemy', art: 'flame',
    v: {}, u: { cost: 0 }, text: '使目标的<em>灼烧</em>层数翻倍。', ex: true,
    play: async (g, v, t) => { await g.apply(t, 'burn', t.status.burn || 0); },
  },
  lingering: {
    name: '残火', type: 'attack', cost: 1, target: 'enemy', art: 'swords',
    v: { d: 7 }, u: { d: 9 }, text: '造成 {d} 点伤害。若目标有<em>灼烧</em>，再造成一次。',
    play: async (g, v, t) => { const burning = (t.status.burn || 0) > 0; await g.attack(t, v.d, burning ? 2 : 1, 'fire'); },
  },
  magmaMaul: {
    name: '熔岩巨锤', type: 'attack', cost: 3, target: 'enemy', art: 'hammer',
    v: { d: 26 }, u: { d: 34 }, text: '造成 {d} 点伤害。',
    play: async (g, v, t) => { await g.attack(t, v.d, 1, 'heavy'); },
  },
  bloodOath: {
    name: '血誓斩', type: 'attack', cost: 1, target: 'enemy', art: 'drop',
    v: { d: 14, n: 3 }, u: { d: 18, n: 3 }, text: '失去 {n} 点生命。造成 {d} 点伤害。',
    play: async (g, v, t) => { await g.loseHp(v.n); await g.attack(t, v.d, 1, 'heavy'); },
  },
  ironWall: {
    name: '铁壁', type: 'skill', cost: 2, target: 'self', art: 'shield',
    v: { b: 12 }, u: { b: 16 }, text: '获得 {b} 点格挡。',
    play: async (g, v) => { await g.gainBlock(v.b); },
  },
  warmGuard: {
    name: '余温护身', type: 'skill', cost: 1, target: 'self', art: 'shield',
    v: { b: 7, n: 1 }, u: { b: 9, n: 2 }, text: '获得 {b} 点格挡。抽 {n} 张牌。',
    play: async (g, v) => { await g.gainBlock(v.b); await g.draw(v.n); },
  },
  ashShield: {
    name: '灰烬之盾', type: 'skill', cost: 1, target: 'self', art: 'anvil',
    v: { b: 4 }, u: { b: 7 }, text: '获得 {b} 点格挡，外加等同于所有敌人<em>灼烧</em>总层数的格挡。',
    play: async (g, v) => { await g.gainBlock(v.b + g.totalBurn(), true); },
  },
  bloodBoil: {
    name: '沸血', type: 'skill', cost: 0, target: 'self', art: 'drop',
    v: { n: 3, m: 2 }, u: { n: 2, m: 2 }, text: '失去 {n} 点生命。获得 {m} 点能量。', ex: true,
    play: async (g, v) => { await g.loseHp(v.n); g.gainEnergy(v.m); },
  },
  warcry: {
    name: '战吼', type: 'skill', cost: 1, target: 'self', art: 'eye',
    v: { n: 2 }, u: { n: 3 }, text: '抽 {n} 张牌。',
    play: async (g, v) => { await g.draw(v.n); },
  },
  intimidate: {
    name: '威慑', type: 'skill', cost: 0, target: 'all', art: 'skull',
    v: { n: 1 }, u: { n: 2 }, text: '对所有敌人施加 {n} 层<em>虚弱</em>。', ex: true,
    play: async (g, v) => { await g.applyAll('weak', v.n); },
  },
  smokeScreen: {
    name: '浓烟', type: 'skill', cost: 1, target: 'all', art: 'wave',
    v: { n: 2, b: 4 }, u: { n: 3, b: 6 }, text: '获得 {b} 点格挡。对所有敌人施加 {n} 层<em>灼烧</em>。',
    play: async (g, v) => { await g.gainBlock(v.b); await g.applyAll('burn', v.n); },
  },
  pyre: {
    name: '焚身', type: 'power', cost: 1, target: 'self', art: 'flame',
    v: { n: 2 }, u: { n: 3 }, text: '回合开始时，对所有敌人施加 {n} 层<em>灼烧</em>。',
    play: async (g, v) => { await g.apply(g.player, 'pyre', v.n); },
  },
  forgeHeart: {
    name: '炉心', type: 'power', cost: 2, target: 'self', art: 'up',
    v: { n: 2 }, u: { n: 3 }, text: '获得 {n} 点<em>力量</em>。',
    play: async (g, v) => { await g.apply(g.player, 'str', v.n); },
  },
  forging: {
    name: '熔铸', type: 'power', cost: 1, target: 'self', art: 'anvil',
    v: { n: 2 }, u: { n: 3 }, text: '每打出一张攻击牌，获得 {n} 点格挡。',
    play: async (g, v) => { await g.apply(g.player, 'forge', v.n); },
  },
  kindling: {
    name: '薪火相传', type: 'power', cost: 1, target: 'self', art: 'heart',
    v: { n: 1 }, u: { n: 2 }, text: '每当敌人因<em>灼烧</em>受到伤害，获得 {n} 点格挡。',
    play: async (g, v) => { await g.apply(g.player, 'kindle', v.n); },
  },
  scar: {
    name: '灼痕', type: 'curse', cost: -1, target: 'none', art: 'skull',
    v: {}, u: {}, text: '无法打出。',
  },
};
const STARTER_DECK = ['strike', 'strike', 'strike', 'strike', 'strike', 'defend', 'defend', 'defend', 'defend', 'ignite'];
const REWARD_POOL = Object.keys(CARDS).filter(k => !['strike', 'defend', 'ignite', 'scar'].includes(k));
const RARE = new Set(['magmaMaul', 'pyre', 'forgeHeart', 'kindling', 'wildfire', 'detonate']);

// ---------- 敌人 ----------
// ai(e, rng) 返回本回合意图。atk: 伤害, hits: 次数, block, self: 自身状态, foe: 施加给玩家的状态
const ENEMIES = {
  cinderling: {
    name: '灰烬软泥', hp: [26, 31], model: 'slime',
    ai(e, rng) {
      const last = e.history.at(-1);
      if (last !== 'spit' && rng() < 0.4) return { id: 'spit', name: '喷溅', atk: 4, foe: { burn: 2 } };
      return { id: 'slam', name: '撞击', atk: 8 };
    },
  },
  bonecrow: {
    name: '骨鸦', hp: [19, 23], model: 'crow',
    ai(e, rng) {
      const last = e.history.at(-1);
      if (e.history.length === 0 || last === 'shriek' || rng() < 0.65) return { id: 'peck', name: '啄击', atk: 2, hits: 3 };
      return { id: 'shriek', name: '尖啸', block: 5, self: { str: 1 } };
    },
  },
  zealot: {
    name: '余烬信徒', hp: [42, 47], model: 'cultist',
    ai(e) {
      if (e.history.length === 0) return { id: 'pray', name: '祷火', self: { ritual: 2 } };
      return { id: 'stab', name: '焚刺', atk: 6 };
    },
  },
  sporecap: {
    name: '灰菇', hp: [24, 28], model: 'mushroom',
    ai(e, rng) {
      const last = e.history.at(-1);
      if (last !== 'spore' && rng() < 0.45) return { id: 'spore', name: '孢子', foe: { weak: 2 } };
      return { id: 'bump', name: '冲撞', atk: 6, block: 3 };
    },
  },
  golem: {
    name: '熔岩傀儡', hp: [76, 80], model: 'golem', elite: true,
    ai(e) {
      const cycle = [
        { id: 'charge', name: '熔核蓄能', block: 12, self: { str: 2 } },
        { id: 'fist', name: '熔拳', atk: 14 },
        { id: 'quake', name: '地裂', atk: 8, foe: { vuln: 2 } },
      ];
      return cycle[e.history.length % 3];
    },
  },
  revenant: {
    name: '灰骑士残影', hp: [62, 66], model: 'revenant', elite: true,
    ai(e, rng) {
      const last = e.history.at(-1);
      if (e.history.length === 0) return { id: 'stance', name: '架势', block: 10, self: { str: 2 } };
      if (last === 'flurry') return rng() < 0.5 ? { id: 'stance', name: '架势', block: 10, self: { str: 2 } } : { id: 'hex', name: '断刃', atk: 9, foe: { weak: 2 } };
      return { id: 'flurry', name: '三连斩', atk: 5, hits: 3 };
    },
  },
  ashKing: {
    name: '灰烬之王', hp: [190, 190], model: 'king', boss: true,
    ai(e) {
      if (!e.enraged && e.hp < e.maxHp / 2) { e.enraged = true; return { id: 'rage', name: '王怒', block: 20, self: { str: 3 } }; }
      const cycle = [
        { id: 'crown', name: '王焰', block: 12, foe: { burn: 4 } },
        { id: 'storm', name: '余烬风暴', atk: 6, hits: 3 },
        { id: 'gather', name: '蓄势', self: { str: 3 }, block: 8 },
        { id: 'doom', name: '陨灭', atk: 24 },
      ];
      return cycle[(e.cycle = (e.cycle ?? -1) + 1) % 4];
    },
  },
};

const ENCOUNTERS = {
  easy: [['cinderling'], ['bonecrow', 'bonecrow'], ['zealot'], ['sporecap', 'cinderling']],
  normal: [['cinderling', 'bonecrow'], ['zealot', 'sporecap'], ['sporecap', 'sporecap', 'bonecrow'], ['bonecrow', 'bonecrow', 'cinderling'], ['zealot', 'cinderling']],
  elite: [['golem'], ['revenant']],
  boss: [['ashKing']],
};

// ---------- 遗物 ----------
const RELICS = {
  emberHeart: { name: '余烬之心', glyph: '心', tip: '战斗结束时回复 6 点生命。' },
  anvil:      { name: '旧铁砧',   glyph: '砧', tip: '每场战斗第一回合获得 8 点格挡。' },
  tinderbox:  { name: '火绒盒',   glyph: '绒', tip: '战斗开始时，对所有敌人施加 2 层灼烧。' },
  whetstone:  { name: '磨刀石',   glyph: '砺', tip: '战斗开始时获得 1 点力量。' },
  hourglass:  { name: '灰沙漏',   glyph: '漏', tip: '每第 3 回合额外获得 1 点能量。' },
  boneDice:   { name: '骨骰',     glyph: '骰', tip: '战斗开始时额外抽 2 张牌。' },
  bellows:    { name: '风箱',     glyph: '箱', tip: '你施加的灼烧额外 +1 层。' },
  ashUrn:     { name: '骨灰瓮',   glyph: '瓮', tip: '最大生命 +10。' },
};
const RELIC_POOL = Object.keys(RELICS).filter(k => k !== 'emberHeart');

// ---------- 事件 ----------
const EVENTS = [
  {
    title: '灰烬祭坛', art: 'flame',
    text: '一座落满余灰的祭坛仍在发热。台面上的凹槽像是在等一滴血。',
    options: [
      { label: '献血', hint: '失去 8 点生命，获得一件遗物', run: g => { g.player.hp = Math.max(1, g.player.hp - 8); return g.gainRandomRelic(); } },
      { label: '离开', hint: '什么也不做', run: () => '你转身离开，背后的余火慢慢熄灭。' },
    ],
  },
  {
    title: '流浪铁匠', art: 'anvil',
    text: '一个背着风箱的铁匠靠在楼梯口。“给点钱，我能让你的招式更利。”',
    options: [
      { label: '付 35 金', hint: '随机升级 2 张牌', need: g => g.player.gold >= 35, run: g => { g.player.gold -= 35; return g.upgradeRandom(2); } },
      { label: '离开', hint: '什么也不做', run: () => '铁匠耸耸肩，继续敲他的铁。' },
    ],
  },
  {
    title: '冷却的炉膛', art: 'skull',
    text: '炉膛深处埋着一袋金币，炉灰却烫得像活物。',
    options: [
      { label: '伸手去拿', hint: '获得 60 金，牌组加入一张「灼痕」', run: g => { g.player.gold += 60; g.addCard('scar'); return '金币到手，手背上留下一道洗不掉的灼痕。'; } },
      { label: '用炉灰净身', hint: '移除牌组中的一张牌', run: g => g.removeCardFlow() },
    ],
  },
  {
    title: '余烬泉', art: 'heart',
    text: '岩缝里涌出温热的泉水，闻起来像炭和铁。',
    options: [
      { label: '饮用', hint: '回复 20 点生命', run: g => { g.heal(20); return '暖意流遍全身。'; } },
      { label: '淬炼', hint: '最大生命 +5', run: g => { g.player.maxHp += 5; g.player.hp += 5; return '泉水在皮肤上凝成一层薄壳。'; } },
    ],
  },
];
