// 余烬尖塔 · three.js 场景：战场、角色模型、粒子与打击反馈
const Scene = (() => {
  const T = THREE;
  let renderer, scene, camera, clock;
  const actors = new Set();
  const tweens = [];
  const sparks = [];
  let shakeAmt = 0;
  let mode = 'title';
  const camBase = new T.Vector3(0.6, 5.4, 11);
  const camLook = new T.Vector3(0.6, -0.9, -0.5);
  const flames = [];

  // ---------- 工具 ----------
  const mat = (color, o = {}) => new T.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1, flatShading: true, ...o });
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new T.CanvasTexture(c);
  })();
  const glowSprite = (color, size, opacity = 1) => {
    const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color, blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity }));
    s.scale.setScalar(size);
    return s;
  };
  const atPos = (o, x, y, z) => { o.position.set(x, y, z); return o; };
  // 补间按真实时间推进；rAF 被节流（后台标签页）时由定时器兜底，保证回合流程不会卡住
  const tween = (dur, fn, ease = t => t) => new Promise(res => tweens.push({ start: performance.now(), dur, fn, ease, res }));
  function stepTweens() {
    const now = performance.now();
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      const k = Math.min(1, (now - tw.start) / tw.dur); tw.fn(tw.ease(k));
      if (k >= 1) { tweens.splice(i, 1); tw.res(); }
    }
  }
  setInterval(() => { if (document.hidden || tweens.length) stepTweens(); }, 50);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  function stoneTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = '#2a2420'; x.fillRect(0, 0, 512, 512);
    // 石板拼缝
    for (let r = 0; r < 8; r++) for (let q = 0; q < 8; q++) {
      const off = (r % 2) * 32;
      const l = 30 + Math.random() * 14;
      x.fillStyle = `hsl(25, 10%, ${l * 0.6}%)`;
      x.fillRect(q * 64 + off + 2, r * 64 + 2, 60, 60);
    }
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,220,190'},${Math.random() * 0.08})`;
      x.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 6, 2 + Math.random() * 6);
    }
    // 熔岩裂缝
    x.strokeStyle = 'rgba(255,110,30,.55)'; x.lineWidth = 1.5;
    for (let i = 0; i < 14; i++) {
      x.beginPath(); let px = Math.random() * 512, py = Math.random() * 512; x.moveTo(px, py);
      for (let k = 0; k < 6; k++) { px += (Math.random() - .5) * 60; py += (Math.random() - .5) * 60; x.lineTo(px, py); }
      x.stroke();
    }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(3, 3);
    return t;
  }

  // ---------- 环境 ----------
  function buildWorld() {
    scene.fog = new T.FogExp2(0x0d0908, 0.055);
    scene.background = new T.Color(0x0d0908);
    scene.add(new T.HemisphereLight(0x5a6a88, 0x1a0e08, 0.55));
    const moon = new T.DirectionalLight(0x9fb4d8, 0.55); moon.position.set(-4, 10, 6);
    moon.castShadow = true; moon.shadow.mapSize.set(1024, 1024);
    Object.assign(moon.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
    scene.add(moon);

    // 圆形石台
    const floor = new T.Mesh(new T.CylinderGeometry(9, 9.6, 0.6, 48), new T.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.95, emissive: 0x220800, emissiveIntensity: 0.4 }));
    floor.position.y = -0.3; floor.receiveShadow = true; scene.add(floor);
    // 外圈台阶
    const rim = new T.Mesh(new T.TorusGeometry(9.2, 0.25, 6, 48), mat(0x3a302a));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.02; scene.add(rim);
    // 熔岩深渊
    const lava = new T.Mesh(new T.PlaneGeometry(80, 80), new T.MeshBasicMaterial({ color: 0x3a0f02 }));
    lava.rotation.x = -Math.PI / 2; lava.position.y = -3; scene.add(lava);
    const lavaGlow = new T.PointLight(0xff4a10, 1.2, 30); lavaGlow.position.set(0, -2, 0); scene.add(lavaGlow);

    // 断柱
    const pillarMat = mat(0x3b332d);
    [[-7, -4, 4.2], [-3.5, -7, 6.5], [2.5, -7.5, 3.1], [6.8, -4.5, 5.6], [8, 1, 2.2], [-8.2, 0.5, 2.8]].forEach(([x, z, h]) => {
      const p = new T.Mesh(new T.CylinderGeometry(0.55, 0.65, h, 8), pillarMat);
      p.position.set(x, h / 2, z); p.castShadow = true; p.receiveShadow = true;
      p.rotation.z = (Math.random() - .5) * 0.08; scene.add(p);
      const cap = new T.Mesh(new T.BoxGeometry(1.5, 0.35, 1.5), pillarMat);
      cap.position.set(x, h, z); cap.rotation.y = Math.random(); scene.add(cap);
    });

    // 远处的尖塔剪影
    const spireMat = new T.MeshBasicMaterial({ color: 0x050303, fog: false });
    const spire = new T.Group();
    const tower = new T.Mesh(new T.CylinderGeometry(1.2, 3.5, 40, 7), spireMat); tower.position.y = 14; spire.add(tower);
    const tip = new T.Mesh(new T.ConeGeometry(1.4, 10, 7), spireMat); tip.position.y = 39; spire.add(tip);
    for (let i = 0; i < 6; i++) {
      const w = glowSprite(0xff7a2f, 0.9, 0.9); w.material.fog = false;
      w.position.set((Math.random() - .5) * 2, 4 + i * 5.5, 2.6 - i * 0.25); spire.add(w);
    }
    spire.position.set(4, -8, -45); scene.add(spire);
    // 天空中的余烬云：大面积暗红光晕
    const sky = glowSprite(0x7a1c06, 90, 0.35); sky.material.fog = false; sky.position.set(4, 18, -60); scene.add(sky);

    // 火盆
    [[-5.2, -1.6], [6.2, -1.8]].forEach(([x, z]) => {
      const g = new T.Group();
      const leg = new T.Mesh(new T.CylinderGeometry(0.08, 0.2, 1.4, 6), mat(0x1c1714, { metalness: 0.6 }));
      leg.position.y = 0.7; g.add(leg);
      const bowl = new T.Mesh(new T.CylinderGeometry(0.55, 0.25, 0.35, 8, 1, true), mat(0x2a221d, { metalness: 0.6, side: T.DoubleSide }));
      bowl.position.y = 1.5; g.add(bowl);
      const coal = new T.Mesh(new T.SphereGeometry(0.42, 8, 4), new T.MeshBasicMaterial({ color: 0xff5a14 }));
      coal.scale.y = 0.35; coal.position.y = 1.6; g.add(coal);
      const fl = glowSprite(0xff8a3a, 1.8); fl.position.y = 2; g.add(fl);
      const light = new T.PointLight(0xff7a2f, 2.2, 11, 1.6); light.position.y = 2.1; g.add(light);
      g.position.set(x, 0, z); scene.add(g);
      flames.push({ fl, light, seed: Math.random() * 10 });
    });

    // 漂浮余烬
    const N = 420, pos = new Float32Array(N * 3), spd = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - .5) * 26; pos[i * 3 + 1] = Math.random() * 10 - 1; pos[i * 3 + 2] = (Math.random() - .5) * 20 - 2;
      spd[i] = 0.3 + Math.random() * 0.8;
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const pts = new T.Points(geo, new T.PointsMaterial({ map: glowTex, color: 0xff8a3a, size: 0.14, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    pts.userData.spd = spd; scene.add(pts);
    flames.push({ embers: pts });
  }

  // ---------- 角色模型 ----------
  function part(group, geo, m, x = 0, y = 0, z = 0) {
    const mesh = new T.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; group.add(mesh); return mesh;
  }
  const MODELS = {
    knight() {
      const g = new T.Group(), body = new T.Group(); g.add(body);
      const armor = mat(0x5d5650, { metalness: 0.7, roughness: 0.45 });
      const dark = mat(0x221c18, { metalness: 0.4 });
      const cloth = mat(0x7a2414, { side: T.DoubleSide });
      part(body, new T.CylinderGeometry(0.16, 0.18, 0.8, 6), dark, -0.2, 0.4);
      part(body, new T.CylinderGeometry(0.16, 0.18, 0.8, 6), dark, 0.2, 0.4);
      part(body, new T.CylinderGeometry(0.42, 0.36, 0.95, 8), armor, 0, 1.25);
      part(body, new T.SphereGeometry(0.26, 8, 6), armor, -0.5, 1.6).scale.set(1, .8, 1);
      part(body, new T.SphereGeometry(0.26, 8, 6), armor, 0.5, 1.6).scale.set(1, .8, 1);
      const helm = part(body, new T.CylinderGeometry(0.27, 0.3, 0.5, 8), armor, 0, 2.0);
      part(body, new T.ConeGeometry(0.3, 0.35, 8), armor, 0, 2.42);
      const visor = part(body, new T.BoxGeometry(0.42, 0.06, 0.1), new T.MeshBasicMaterial({ color: 0xff8a2a }), 0, 2.05, 0.26);
      visor.castShadow = false;
      const plume = part(body, new T.ConeGeometry(0.07, 0.6, 5), cloth, 0, 2.7, -0.05); plume.rotation.x = -0.5;
      const cape = part(body, new T.PlaneGeometry(0.9, 1.5, 1, 4), cloth, 0, 1.0, -0.4); cape.rotation.x = 0.12;
      // 盾
      const shield = part(body, new T.CylinderGeometry(0.5, 0.5, 0.08, 6), mat(0x3a2a20, { metalness: 0.5 }), -0.15, 1.2, 0.48);
      shield.rotation.x = Math.PI / 2;
      part(body, new T.SphereGeometry(0.12, 6, 4), armor, -0.15, 1.2, 0.54);
      // 剑
      const sword = new T.Group(); sword.position.set(0.62, 1.15, 0.15); body.add(sword);
      part(sword, new T.BoxGeometry(0.08, 1.5, 0.03), mat(0xc9c2b8, { metalness: 0.9, roughness: 0.25, emissive: 0x401000 }), 0, 0.85);
      part(sword, new T.BoxGeometry(0.4, 0.07, 0.07), dark, 0, 0.1);
      part(sword, new T.CylinderGeometry(0.04, 0.04, 0.3, 5), dark, 0, -0.08);
      sword.rotation.z = -0.35;
      const glow = glowSprite(0xff7a2f, 0.8, 0.6); glow.position.set(0, 2.05, 0.3); body.add(glow);
      g.userData = { body, sword, cape, height: 2.8, idle: 'knight' };
      return g;
    },
    slime() {
      const g = new T.Group(), body = new T.Group(); g.add(body);
      const skin = part(body, new T.SphereGeometry(0.75, 14, 10), mat(0x5a2210, { transparent: true, opacity: 0.85, roughness: 0.3, emissive: 0x3a0c00 }), 0, 0.6);
      skin.scale.set(1.2, 0.85, 1.1);
      const core = part(body, new T.IcosahedronGeometry(0.3, 0), new T.MeshBasicMaterial({ color: 0xff7a1a }), 0, 0.6);
      core.castShadow = false;
      body.add(atPos(glowSprite(0xff6a1a, 1.6, 0.7), 0, 0.6, 0));
      [-0.25, 0.25].forEach(x => part(body, new T.SphereGeometry(0.08, 6, 4), new T.MeshBasicMaterial({ color: 0xfff0c0 }), x, 0.85, 0.75));
      g.userData = { body, core, height: 1.6, idle: 'squish' };
      return g;
    },
    crow() {
      const g = new T.Group(), body = new T.Group(); g.add(body);
      const bone = mat(0xcfc3ad), black = mat(0x18120f);
      const torso = part(body, new T.ConeGeometry(0.32, 1.1, 6), black, 0, 1.6); torso.rotation.z = Math.PI / 2 + 0.3; torso.rotation.y = Math.PI;
      const head = part(body, new T.SphereGeometry(0.24, 6, 5), bone, -0.5, 1.85);
      const beak = part(body, new T.ConeGeometry(0.08, 0.4, 4), bone, -0.82, 1.82); beak.rotation.z = Math.PI / 2;
      part(body, new T.SphereGeometry(0.05, 4, 3), new T.MeshBasicMaterial({ color: 0x9fe0ff }), -0.62, 1.92, 0.18);
      const wl = new T.Group(), wr = new T.Group(); wl.position.set(0, 1.7, 0.2); wr.position.set(0, 1.7, -0.2); body.add(wl, wr);
      part(wl, new T.BoxGeometry(0.6, 0.04, 1.0), black, 0, 0, 0.5);
      part(wr, new T.BoxGeometry(0.6, 0.04, 1.0), black, 0, 0, -0.5);
      for (let i = 0; i < 4; i++) part(body, new T.TorusGeometry(0.2 - i * 0.02, 0.025, 4, 8, Math.PI), bone, 0.1 + i * 0.12, 1.55).rotation.y = Math.PI / 2;
      g.userData = { body, wings: [wl, wr], height: 2.4, idle: 'fly' };
      return g;
    },
    cultist() {
      const g = new T.Group(), body = new T.Group(); g.add(body);
      const robe = mat(0x3a2418, { side: T.DoubleSide });
      part(body, new T.ConeGeometry(0.65, 1.9, 8, 1, true), robe, 0, 0.95);
      part(body, new T.SphereGeometry(0.33, 8, 6), robe, 0, 2.0);
      const hood = part(body, new T.ConeGeometry(0.36, 0.7, 8), robe, 0, 2.35); hood.rotation.x = -0.25;
      part(body, new T.SphereGeometry(0.22, 8, 6), new T.MeshBasicMaterial({ color: 0x050302 }), -0.08, 1.98, 0.17).scale.z = 0.5;
      [-0.12, 0.05].forEach(z => part(body, new T.SphereGeometry(0.04, 4, 3), new T.MeshBasicMaterial({ color: 0xffb02a }), -0.15, 2.02, z + 0.2));
      const staff = part(body, new T.CylinderGeometry(0.04, 0.05, 2.6, 5), mat(0x2a1a10), -0.6, 1.3, 0.2);
      const fire = glowSprite(0xffaa3a, 0.9); fire.position.set(-0.6, 2.7, 0.2); body.add(fire);
      part(body, new T.OctahedronGeometry(0.12), new T.MeshBasicMaterial({ color: 0xffe0a0 }), -0.6, 2.7, 0.2);
      g.userData = { body, fire, height: 2.8, idle: 'sway' };
      return g;
    },
    mushroom() {
      const g = new T.Group(), body = new T.Group(); g.add(body);
      part(body, new T.CylinderGeometry(0.28, 0.4, 0.9, 8), mat(0xb8ab92), 0, 0.45);
      const cap = part(body, new T.SphereGeometry(0.75, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x6a5a50, { emissive: 0x100808 }), 0, 0.85);
      cap.scale.y = 0.75;
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9, r = 0.35 + (i % 2) * 0.2;
        part(body, new T.SphereGeometry(0.07, 5, 4), new T.MeshBasicMaterial({ color: 0xb6ff9a }), Math.cos(a) * r, 1.1 + (0.55 - r) * 0.5, Math.sin(a) * r);
      }
      [-0.12, 0.12].forEach(z => part(body, new T.SphereGeometry(0.05, 4, 3), new T.MeshBasicMaterial({ color: 0x050302 }), -0.32, 0.6, z));
      body.add(atPos(glowSprite(0x9aff7a, 1.6, 0.25), 0, 1.2, 0));
      g.userData = { body, height: 1.7, idle: 'squish' };
      return g;
    },
    golem() {
      const g = new T.Group(), body = new T.Group(); g.add(body);
      const rock = mat(0x2e2622, { roughness: 1 });
      const lava = new T.MeshBasicMaterial({ color: 0xff5a10 });
      part(body, new T.DodecahedronGeometry(0.4), rock, -0.4, 0.4);
      part(body, new T.DodecahedronGeometry(0.4), rock, 0.4, 0.4);
      const torso = part(body, new T.DodecahedronGeometry(0.95), rock, 0, 1.6); torso.scale.set(1.1, 1, 0.9);
      part(body, new T.IcosahedronGeometry(0.42, 0), lava, -0.3, 1.7, 0.55).castShadow = false;
      part(body, new T.DodecahedronGeometry(0.42), rock, 0, 2.75);
      [-0.15, 0.15].forEach(z => part(body, new T.BoxGeometry(0.1, 0.06, 0.06), lava, -0.35, 2.8, z));
      const al = new T.Group(); al.position.set(0, 2.1, 1.0); body.add(al);
      const ar = new T.Group(); ar.position.set(0, 2.1, -1.0); body.add(ar);
      [al, ar].forEach(a => { part(a, new T.DodecahedronGeometry(0.35), rock, 0, -0.4); part(a, new T.DodecahedronGeometry(0.5), rock, -0.1, -1.1); });
      body.add(atPos(glowSprite(0xff5a10, 2.6, 0.55), -0.4, 1.7, 0.4));
      const l = new T.PointLight(0xff5a10, 1.5, 5); l.position.set(-1, 1.7, 0.5); body.add(l);
      g.userData = { body, arms: [al, ar], height: 3.3, idle: 'heavy' };
      g.scale.setScalar(1.05);
      return g;
    },
    revenant() {
      const g = MODELS.knight();
      g.traverse(o => {
        if (o.isMesh && o.material.isMeshStandardMaterial) {
          o.material = o.material.clone();
          o.material.color.setHex(0x4a6a8a); o.material.emissive.setHex(0x0a2a4a);
          o.material.transparent = true; o.material.opacity = 0.78;
        }
        if (o.isMesh && o.material.isMeshBasicMaterial) { o.material = o.material.clone(); o.material.color.setHex(0x7ad4ff); }
        if (o.isSprite) { o.material = o.material.clone(); o.material.color.setHex(0x5ab4ff); }
      });
      g.scale.setScalar(1.15);
      g.userData.height = 3.2; g.userData.idle = 'knight';
      return g;
    },
    king() {
      const g = new T.Group(), body = new T.Group(); g.add(body);
      const iron = mat(0x2a221e, { metalness: 0.8, roughness: 0.4 });
      const ember = new T.MeshBasicMaterial({ color: 0xff6a1a });
      const robe = mat(0x4a0e08, { side: T.DoubleSide, emissive: 0x1a0200 });
      part(body, new T.ConeGeometry(1.3, 3, 10, 1, true), robe, 0, 1.5);
      part(body, new T.CylinderGeometry(0.75, 0.9, 1.3, 8), iron, 0, 3.0);
      part(body, new T.SphereGeometry(0.5, 8, 6), iron, -0.95, 3.5);
      part(body, new T.SphereGeometry(0.5, 8, 6), iron, 0.95, 3.5);
      part(body, new T.IcosahedronGeometry(0.3, 0), ember, -0.6, 3.1, 0.3).castShadow = false;
      part(body, new T.SphereGeometry(0.48, 8, 6), mat(0x0a0605), 0, 4.05);
      [-0.16, 0.16].forEach(z => part(body, new T.SphereGeometry(0.07, 5, 4), ember, -0.42, 4.1, z));
      const crown = new T.Group(); crown.position.y = 4.45; body.add(crown);
      part(crown, new T.CylinderGeometry(0.5, 0.45, 0.2, 10), mat(0xc9932a, { metalness: 0.9, roughness: 0.3, emissive: 0x3a1a00 }));
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2;
        part(crown, new T.ConeGeometry(0.08, 0.55, 4), ember, Math.cos(a) * 0.45, 0.35, Math.sin(a) * 0.45).castShadow = false;
      }
      crown.add(atPos(glowSprite(0xff7a2f, 2.4, 0.8), 0, 0.4, 0));
      // 巨剑
      const blade = new T.Group(); blade.position.set(-0.4, 2.6, 1.3); body.add(blade);
      part(blade, new T.BoxGeometry(0.22, 3.2, 0.06), mat(0x1a1210, { metalness: 0.8, emissive: 0x5a1400 }), 0, -0.6);
      part(blade, new T.BoxGeometry(0.05, 3, 0.07), ember, 0, -0.6).castShadow = false;
      part(blade, new T.BoxGeometry(0.9, 0.15, 0.15), iron, 0, 1.0);
      blade.rotation.z = 0.15;
      const l = new T.PointLight(0xff5a10, 2.5, 8); l.position.set(-1.5, 3.5, 0); body.add(l);
      g.userData = { body, crown, blade, height: 5.2, idle: 'heavy' };
      return g;
    },
  };

  // ---------- 像素精灵（HD-2D）：PixelLab 贴图做成受光照的公告板 ----------
  // 世界高度（单位）；像素用最近邻采样保持锐利
  const SPRITE_H = { knight: 2.6, slime: 1.5, crow: 1.7, cultist: 2.6, mushroom: 1.8, golem: 3.3, revenant: 3.0, king: 4.8 };
  const texCache = {};
  function spriteModel(model) {
    const info = SPRITES[model];
    let tex = texCache[model];
    if (!tex) {
      tex = texCache[model] = new T.TextureLoader().load(info.src);
      tex.magFilter = T.NearestFilter; tex.minFilter = T.NearestFilter;
      tex.generateMipmaps = false; tex.encoding = T.sRGBEncoding;
    }
    const h = SPRITE_H[model] || 2.4, w = h * info.w / info.h;
    const g = new T.Group(), body = new T.Group(); g.add(body);
    // emissiveMap = 贴图本身：受击闪光只染亮像素，基础自发光保证暗处也能看清
    const m = new T.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: 0x3a3430, transparent: true, alphaTest: 0.5,
      roughness: 1, metalness: 0, side: T.DoubleSide,
    });
    const plane = new T.Mesh(new T.PlaneGeometry(w, h), m);
    plane.position.y = h / 2 + (model === 'crow' ? 0.9 : 0);
    plane.castShadow = true;
    plane.customDepthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map: tex, alphaTest: 0.5 });
    body.add(plane);
    if (model === 'king' || model === 'golem') { const l = new T.PointLight(0xff5a10, 1.6, 6); l.position.set(0, h * 0.55, 0.8); body.add(l); }
    if (model === 'revenant') { const l = new T.PointLight(0x5ab4ff, 1.2, 5); l.position.set(0, h * 0.6, 0.8); body.add(l); }
    g.userData = { body, plane, height: h + (model === 'crow' ? 0.9 : 0), idle: model === 'crow' ? 'spriteFly' : 'sprite', ringR: Math.max(0.6, w * 0.4) };
    return g;
  }

  function collectMats(g) {
    const list = [];
    g.traverse(o => {
      if (o.isMesh && o.material.isMeshStandardMaterial) {
        o.material = o.material.clone();
        list.push({ m: o.material, e: o.material.emissive.clone() });
      }
    });
    return list;
  }

  // ---------- 角色 API ----------
  function spawn(model, x, z = 0, facing = 1) {
    const isSprite = typeof SPRITES !== 'undefined' && SPRITES[model];
    const g = isSprite ? spriteModel(model) : MODELS[model]();
    g.position.set(x, 0, z);
    // 精灵本身已是侧视朝向（骑士朝右、敌人朝左）；低模回退时骑士转成 3/4 侧身
    g.rotation.y = isSprite ? 0 : model === 'knight' ? 0.7 : model === 'revenant' ? -0.8 : 0;
    g.userData.baseScale = g.scale.x;
    scene.add(g);
    // 脚下阴影圈 + 选中光环
    const rr = g.userData.ringR || 0.85;
    const ring = new T.Mesh(new T.RingGeometry(rr - 0.1, rr + 0.1, 32), new T.MeshBasicMaterial({ color: 0xff7a2f, transparent: true, opacity: 0, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
    const a = {
      group: g, model, ud: g.userData, ring, mats: collectMats(g),
      home: new T.Vector3(x, 0, z), offset: new T.Vector3(), seed: Math.random() * 10,
      flash: 0, flashColor: new T.Color(1, 1, 1), alive: true, squash: 0,
    };
    g.position.y = -3; // 入场：从下方升起
    tween(600, t => { g.position.y = -3 + 3 * t; }, easeOut);
    actors.add(a);
    return a;
  }

  function remove(a) {
    a.alive = false;
    return tween(700, t => {
      a.group.position.y = -t * 1.2;
      a.group.rotation.z = (a.model === 'knight' ? -1 : 1) * t * 0.6;
      a.group.scale.setScalar((a.ud.baseScale || 1) * (1 - t * 0.4));
      a.mats.forEach(({ m }) => { m.transparent = true; m.opacity = 1 - t; m.emissive.setRGB(t * 1.2, t * 0.4, 0); });
    }).then(() => { scene.remove(a.group); actors.delete(a); });
  }

  function clearEnemies(except) {
    actors.forEach(a => { if (a !== except) { scene.remove(a.group); actors.delete(a); } });
  }

  async function lunge(a, dir, dist = 1.4) {
    await tween(130, t => { a.offset.x = -dir * 0.3 * t; }, easeOut);
    await tween(110, t => { a.offset.x = -dir * 0.3 + dir * (dist + 0.3) * t; }, easeOut);
    tween(300, t => { a.offset.x = dir * dist * (1 - t); }, easeInOut);
  }

  function hit(a, color = 0xffffff, power = 1) {
    a.flash = 1; a.flashColor.set(color); a.squash = 0.25 * power;
    const dir = a.model === 'knight' ? -1 : 1;
    tween(260, t => { a.offset.x = dir * 0.35 * power * Math.sin(t * Math.PI); });
    shake(0.12 * power);
  }

  function pulse(a, color) {
    a.flash = 0.8; a.flashColor.set(color);
    tween(400, t => { a.group.scale.setScalar((a.ud.baseScale || 1) * (1 + 0.08 * Math.sin(t * Math.PI))); });
  }

  function shake(v) { shakeAmt = Math.min(0.5, shakeAmt + v); }

  function center(a, h = 0.5) {
    const p = a.group.position.clone(); p.y += a.ud.height * h * a.group.scale.y; return p;
  }

  function burst(pos, color = 0xff7a2f, n = 18, speed = 4, size = 0.35) {
    for (let i = 0; i < n; i++) {
      const s = glowSprite(color, size);
      s.position.copy(pos);
      const v = new T.Vector3((Math.random() - .5), Math.random() * 0.9 + 0.1, (Math.random() - .5)).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      scene.add(s);
      sparks.push({ s, v, life: 0.5 + Math.random() * 0.5, age: 0, size });
    }
  }

  function ring(pos, color, scale = 3) {
    const m = new T.Mesh(new T.RingGeometry(0.2, 0.35, 32), new T.MeshBasicMaterial({ color, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    m.position.copy(pos); m.position.y = 0.06; m.rotation.x = -Math.PI / 2; scene.add(m);
    tween(500, t => { m.scale.setScalar(1 + t * scale * 3); m.material.opacity = 1 - t; }, easeOut).then(() => scene.remove(m));
  }

  function projectile(from, to, color = 0xff7a2f, dur = 320) {
    const s = glowSprite(color, 0.9); scene.add(s);
    const core = glowSprite(0xffffff, 0.35); s.add(core);
    let last = from.clone();
    return tween(dur, t => {
      s.position.lerpVectors(from, to, t); s.position.y += Math.sin(t * Math.PI) * 1.2;
      if (Math.random() < 0.8) {
        const tr = glowSprite(color, 0.4); tr.position.copy(last); scene.add(tr);
        sparks.push({ s: tr, v: new T.Vector3(0, 0.4, 0), life: 0.3, age: 0, size: 0.4 });
      }
      last.copy(s.position);
    }).then(() => { scene.remove(s); burst(to, color, 22, 5); });
  }

  function slash(pos, color = 0xffe0b0) {
    const geo = new T.RingGeometry(0.9, 1.1, 24, 1, 0, Math.PI * 0.9);
    const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color, transparent: true, blending: T.AdditiveBlending, side: T.DoubleSide, depthWrite: false }));
    m.position.copy(pos); m.rotation.z = Math.random() * Math.PI; m.lookAt(camera.position);
    m.rotateZ(Math.random() * Math.PI);
    scene.add(m);
    tween(260, t => { m.scale.setScalar(0.6 + t * 0.9); m.material.opacity = 1 - t; }, easeOut).then(() => scene.remove(m));
  }

  function setTargeted(a, on) { a.ring.material.opacity = on ? 0.85 : 0; }

  const _v = new T.Vector3();
  function screenOf(a) {
    const p = a.group.position;
    _v.set(p.x, 0, p.z).project(camera);
    const x = (_v.x + 1) / 2 * innerWidth, y = (1 - _v.y) / 2 * innerHeight;
    _v.set(p.x, a.ud.height * a.group.scale.y, p.z).project(camera);
    const top = (1 - _v.y) / 2 * innerHeight;
    return { x, y, top };
  }

  function setMode(m) { mode = m; }

  // ---------- 循环 ----------
  function update() {
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    stepTweens();
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]; p.age += dt;
      p.v.y -= 6 * dt; p.v.multiplyScalar(0.96);
      p.s.position.addScaledVector(p.v, dt);
      const k = 1 - p.age / p.life;
      p.s.material.opacity = k; p.s.scale.setScalar(p.size * (0.5 + k));
      if (k <= 0) { scene.remove(p.s); sparks.splice(i, 1); }
    }
    actors.forEach(a => {
      const { body } = a.ud, s = a.seed;
      if (!a.alive) return;
      a.group.position.x = a.home.x + a.offset.x;
      a.group.position.z = a.home.z + a.offset.z;
      a.squash *= 0.86;
      const sq = 1 - a.squash;
      switch (a.ud.idle) {
        case 'knight':
          body.position.y = Math.sin(t * 2 + s) * 0.04;
          a.ud.cape.rotation.x = 0.15 + Math.sin(t * 2.4 + s) * 0.08;
          a.ud.sword.rotation.z = -0.35 + Math.sin(t * 1.6 + s) * 0.05;
          break;
        case 'squish':
          body.scale.set(1 + Math.sin(t * 3 + s) * 0.06, (1 - Math.sin(t * 3 + s) * 0.06) * sq, 1);
          if (a.ud.core) a.ud.core.rotation.y += dt * 1.5;
          break;
        case 'fly':
          body.position.y = Math.sin(t * 3 + s) * 0.18;
          a.ud.wings[0].rotation.x = Math.sin(t * 12 + s) * 0.6;
          a.ud.wings[1].rotation.x = -Math.sin(t * 12 + s) * 0.6;
          break;
        case 'sway':
          body.rotation.z = Math.sin(t * 1.4 + s) * 0.05;
          a.ud.fire.scale.setScalar(0.8 + Math.random() * 0.25);
          break;
        case 'sprite':
          // 呼吸：以脚底为轴轻微伸缩
          body.scale.x = 1 + Math.sin(t * 2.2 + s) * 0.015;
          body.scale.y = (1 - Math.sin(t * 2.2 + s) * 0.025) * sq;
          break;
        case 'spriteFly':
          body.position.y = Math.sin(t * 3 + s) * 0.2;
          body.scale.y = (1 + Math.sin(t * 9 + s) * 0.04) * sq;
          break;
        case 'heavy':
          body.position.y = Math.sin(t * 1.2 + s) * 0.05;
          if (a.ud.arms) { a.ud.arms[0].rotation.x = Math.sin(t * 1.2) * 0.08; a.ud.arms[1].rotation.x = -Math.sin(t * 1.2) * 0.08; }
          if (a.ud.crown) a.ud.crown.rotation.y += dt * 0.5;
          break;
      }
      if (!['squish', 'sprite', 'spriteFly'].includes(a.ud.idle)) body.scale.y = sq;
      // 精灵始终正对镜头（仅绕 Y 轴）
      if (a.ud.plane) a.group.rotation.y = Math.atan2(camera.position.x - a.group.position.x, camera.position.z - a.group.position.z) * 0.6;
      if (a.flash > 0.01) {
        a.flash *= 0.85;
        a.mats.forEach(({ m, e }) => m.emissive.copy(e).lerp(a.flashColor, a.flash));
      }
      if (a.ring.material.opacity > 0) a.ring.rotation.z += dt;
    });
    flames.forEach(f => {
      if (f.embers) {
        const pos = f.embers.geometry.attributes.position, spd = f.embers.userData.spd;
        for (let i = 0; i < spd.length; i++) {
          let y = pos.getY(i) + spd[i] * dt;
          if (y > 9) y = -1;
          pos.setY(i, y); pos.setX(i, pos.getX(i) + Math.sin(t + i) * dt * 0.2);
        }
        pos.needsUpdate = true;
        return;
      }
      const k = 0.85 + Math.sin(t * 9 + f.seed) * 0.08 + Math.random() * 0.1;
      f.fl.scale.setScalar(1.8 * k); f.light.intensity = 2.2 * k;
    });

    // 镜头
    shakeAmt *= 0.88;
    let target = camBase, look = camLook;
    if (mode !== 'combat') {
      const r = 10.5, a = t * 0.06;
      target = new T.Vector3(Math.sin(a) * r * 0.4 + 0.5, 4.2, Math.cos(a) * 2 + 10);
      look = new T.Vector3(1.5, 3, -6);
    }
    camera.position.lerp(target, 0.04);
    camera.position.x += (Math.random() - .5) * shakeAmt;
    camera.position.y += (Math.random() - .5) * shakeAmt;
    camera.userData.look = (camera.userData.look || look.clone()).lerp(look, 0.04);
    camera.lookAt(camera.userData.look);
    renderer.render(scene, camera);
    requestAnimationFrame(update);
  }

  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    // 竖屏时拉远镜头以容纳整个战场
    camera.fov = camera.aspect < 1 ? 70 : 45;
    camera.updateProjectionMatrix();
  }

  function init(canvas) {
    renderer = new T.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(45, 1, 0.1, 200);
    camera.position.set(0, 6, 14);
    clock = new T.Clock();
    buildWorld();
    resize(); addEventListener('resize', resize);
    update();
  }

  return { init, spawn, remove, clearEnemies, lunge, hit, pulse, shake, burst, ring, projectile, slash, center, screenOf, setTargeted, setMode, wait, tween };
})();
