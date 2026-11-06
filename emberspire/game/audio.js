// 余烬尖塔 · 背景音乐：把 combat.mp3 / boss.mp3 / map.mp3 放进 assets/audio/ 即可生效
// 文件缺失时静默跳过；浏览器要求用户交互后才能出声，所以首次点击时才真正开始播放
const Music = (() => {
  const TRACKS = { combat: 'assets/audio/combat.mp3', boss: 'assets/audio/boss.mp3', map: 'assets/audio/map.mp3' };
  const VOLUME = 0.45, FADE_MS = 900;
  const els = {};
  let want = null, cur = null, unlocked = false;

  function el(name) {
    if (!els[name]) {
      const a = new Audio(TRACKS[name]);
      a.loop = true; a.volume = 0; a.preload = 'auto';
      a.addEventListener('error', () => { a.dataset.missing = '1'; });
      els[name] = a;
    }
    return els[name];
  }

  function fade(a, to, done) {
    const from = a.volume, t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / FADE_MS);
      a.volume = from + (to - from) * k;
      if (k < 1) setTimeout(step, 30); else if (done) done();
    };
    step();
  }

  function apply() {
    if (!unlocked || want === cur) return;
    if (cur) { const old = el(cur); fade(old, 0, () => old.pause()); }
    cur = want;
    if (!cur) return;
    const a = el(cur);
    if (a.dataset.missing) return;
    a.play().then(() => fade(a, VOLUME)).catch(() => {});
  }

  addEventListener('pointerdown', () => { if (!unlocked) { unlocked = true; apply(); } }, { once: false });

  return { play(name) { want = TRACKS[name] ? name : null; apply(); } };
})();
