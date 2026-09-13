"use strict";
let G = null;
function walkableAt(x, y, forOwner) {
  if (x < 0 || y < 0 || x >= G.MW || y >= G.MH) return false;
  const t = G.terr[y * G.MW + x];
  if (t === 2) return false;
  const occ = G.occ[x + "," + y];
  if (occ) {
    if (occ.typeId === "farm") return true;
    if (occ.typeId === "gate" && forOwner >= 0 && !isEnemy(forOwner, occ.owner) && !isEnemy(occ.owner, forOwner) && occ.owner >= 0) return true;
    return false;
  }
  return true;
}
function tileRes(x, y) { return G.resGrid.get(tkey(x, y)); }
function visible(e, viewer) {
  if (viewer === undefined || viewer === null) return true;
  const pv = G.players[viewer], pe = G.players[e.owner >= 0 ? e.owner : (G.humanTeam === -2 ? -9 : -1)];
  if (e.owner >= 0 && (e.owner === viewer || (pv && pe && pv.team === pe.team))) return true;
  const tx = e.x !== undefined ? e.x : e.tx + (D.BUILDS[e.typeId].fp[0] - 1) / 2;
  const ty = e.y !== undefined ? e.y : e.ty + (D.BUILDS[e.typeId].fp[1] - 1) / 2;
  return G.seen[(ty | 0) * G.MW + (tx | 0)] === 1;
}

const GAME = {
  boot() {
    this.canvas = document.getElementById("game");
    this.ctx = this.canvas.getContext("2d");
    this.hudc = document.getElementById("hudc");
    this.hc = this.hudc.getContext("2d");
    this.mm = document.getElementById("minimap");
    this.mc = this.mm.getContext("2d");
    this.resize();
    window.addEventListener("resize", () => this.resize());
  },
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    for (const c of [this.canvas, this.hudc]) { c.width = w; c.height = h; }
  
  }
};

function newGame(cfg) {
  const rng = makeRng(cfg.seed || (Math.random() * 1e9 | 0));
  G = {
    MW: cfg.mapSize, MH: cfg.mapSize, rng,
    terr: null, occ: {}, res: new Set(), resGrid: new Map(), mapDirty: true,
    players: [], units: [], buildings: [], animals: [], projs: [], relics: [],
    time: 0, speed: 1, paused: false, running: true,
    camX: 0, camY: 0, camSPD: 14, keys: {},
    sel: new Set(), selBld: null, ctrl: {}, placing: null,
    seen: null, vis: null, visionT: 0, mmDirty: true,
    cfg, relicTotal: 4, ended: false, wonderB: null,
    floaters: [], lastSpeed: 1
  };
  window.G = G;
  G.terr = new Uint8Array(G.MW * G.MH);
  G.seen = new Uint8Array(G.MW * G.MH);
  G.vis = new Uint16Array(G.MW * G.MH);
  genMap(cfg, rng);
  const slots = cfg.slots;
  G.humanTeam = slots[0].team;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    G.players.push({
      idx: i, civ: s.civ, isAI: !s.human, isHuman: s.human, team: s.team, color: i % D.PCOLORS.length,
      res: { food: 250, wood: 250, gold: 250, stone: 250 },
      era: 0, eraNext: -1, eraT: 0, techs: new Set(), research: [], popUsed: 0,
      alive: true, resigned: false, relics: 0, wonderT: -1, hitT: 0, ai: {}
    });
  }
  const spots = pickStarts(slots.length, rng);
  for (let i = 0; i < slots.length; i++) placeStart(i, spots[i], rng);
  G.findPath = (sx,sy,tx,ty,tol,fo,bl)=>findPath(sx,sy,tx,ty,tol,fo===undefined?-1:fo,bl);
  G.walkable = (x,y,fo)=>walkableAt(x,y,fo===undefined?-1:fo);
  const hm = G.players[0];
  const tc = G.buildings.find(b => b.owner === 0);
  G.camX = tc ? tc.tx + 1.5 : G.MW / 2; G.camY = tc ? tc.ty + 1.5 : G.MH / 2;
  G.units.filter(u => u.owner === 0 && u.spec.spr === "vill").slice(0, 3).forEach(v => G.sel.add(v));
  updateVision();
  return G;
}

function genMap(cfg, rng) {
  const MW = G.MW, MH = G.MH, terr = G.terr;
  terr.fill(0);
  const lakes = 2 + Math.floor(rng() * 3);
  for (let l = 0; l < lakes; l++) {
    const cx = 6 + rng() * (MW - 12), cy = 6 + rng() * (MH - 12);
    const r = 3 + rng() * (Math.min(MW, MH) / 7);
    if (dist2(cx, cy, MW / 2, MH / 2) < (Math.min(MW, MH) / 3) ** 2) continue;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const d = dist2(x, y, cx + (rng() - .5) * 2, cy + (rng() - .5) * 2);
      const rr = r * (0.75 + rng() * 0.25);
      if (d < rr * rr) terr[y * MW + x] = 2;
    }
  }
  const forestN = Math.floor(MW * MH / 130);
  for (let f = 0; f < forestN; f++) {
    const cx = 3 + rng() * (MW - 6), cy = 3 + rng() * (MH - 6);
    const n = 8 + rng() * 14;
    for (let i = 0; i < n; i++) {
      const x = Math.floor(clamp(cx + (rng() - .5) * 5, 1, MW - 2)), y = Math.floor(clamp(cy + (rng() - .5) * 5, 1, MH - 2));
      if (terr[y * MW + x] === 0 && !G.resGrid.has(tkey(x, y)))
        G.resGrid.set(tkey(x, y), { t: "tree", amt: 120 + rng() * 40, tx: x, ty: y });
    }
  }
  const oreN = Math.max(3, Math.floor(MW * MH / 700));
  const oreKinds = ["gold", "gold", "stone", "stone"];
  for (let o = 0; o < oreN * 2 && o < 14; o++) {
    const cx = 5 + rng() * (MW - 10), cy = 5 + rng() * (MH - 10);
    const kd = oreKinds[o % oreKinds.length];
    for (let i = 0; i < 5 + rng() * 3; i++) {
      const x = Math.floor(clamp(cx + (rng() - .5) * 3.6, 1, MW - 2)), y = Math.floor(clamp(cy + (rng() - .5) * 3.6, 1, MH - 2));
      if (terr[y * MW + x] === 0 && !G.resGrid.has(tkey(x, y)))
        G.resGrid.set(tkey(x, y), { t: kd, amt: kd === "gold" ? 320 : 240, tx: x, ty: y });
    }
  }
  for (let d = 0; d < Math.max(3, MW / 12); d++) {
    const cx = 4 + rng() * (MW - 8), cy = 4 + rng() * (MH - 8);
    if (terr[(cy | 0) * MW] === 2) continue;
    for (let i = 0; i < 3 + rng() * 2; i++) {
      const x = clamp(cx + (rng() - .5) * 3, 1, MW - 2), y = clamp(cy + (rng() - .5) * 3, 1, MH - 2);
      if (terr[(y | 0) * MW + (x | 0)] === 0 && !tileRes(x | 0, y | 0)) G.animals.push(new Animal("deer", x, y));
    }
  }
  for (let r = 0; r < G.relicTotal; r++) {
    let x, y, tries = 0;
    do { x = 4 + rng() * (MW - 8); y = 4 + rng() * (MH - 8); tries++; }
    while (tries < 200 && (terr[(y | 0) * MW + (x | 0)] === 2 || tileRes(x | 0, y | 0)));
    G.relics.push({ id: r, x, y, got: false, carried: false });
  }
}
function pickStarts(n, rng) {
  const spots = [], MW = G.MW, MH = G.MH, terr = G.terr;
  const cx = MW / 2, cy = MH / 2, R = Math.min(MW, MH) / 2 - 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * .5 - .25;
    let sx = cx + Math.cos(a) * R, sy = cy + Math.sin(a) * R;
    let tries = 0;
    const bad = () => {
      if (sx < 5 || sy < 5 || sx > MW - 7 || sy > MH - 7) return true;
      for (let y = Math.floor(sy); y < sy + 5; y++) for (let x = Math.floor(sx); x < sx + 5; x++)
        if (terr[y * MW + x] === 2 || tileRes(x, y)) return true;
      return false;
    };
    while (tries++ < 300 && bad()) { sx = cx + Math.cos(a + (rng() - .5) * .6) * R * (0.7 + rng() * .3); sy = cy + Math.sin(a + (rng() - .5) * .6) * R * (0.7 + rng() * .3); }
    sx = clamp(sx, 3, MW - 6); sy = clamp(sy, 3, MH - 6);
    spots.push([Math.floor(sx), Math.floor(sy)]);
  }
  return spots;
}
function placeStart(i, [sx, sy], rng) {
  const MW = G.MW, terr = G.terr;
  for (let y = sy - 1; y < sy + 6; y++) for (let x = sx - 1; x < sx + 6; x++) {
    const k = tkey(x, y);
    if (G.resGrid.has(k) && x >= sx && y >= sy && x < sx + 4 && y < sy + 4) G.resGrid.delete(k);
    if (terr[y * MW + x] === 2) terr[y * MW + x] = 0;
  }
  const b = new Building(i, "tc", sx, sy, true);
  G.buildings.push(b);
  for (let v = 0; v < 3; v++) { const vv = new Unit(i, "vill", sx + 4.5 + (v % 2), sy + 1 + (v % 3) * .6); G.units.push(vv); G.players[i].popUsed += vv.pop(); }
  for (let s = 0; s < 4; s++) {
    const a = rng() * 7, r = 4 + rng() * 2.5;
    const x = clamp(sx + 2 + Math.cos(a) * r, 1, G.MW), y = clamp(sy + 2 + Math.sin(a) * r, 1, G.MH);
    if (terr[(y | 0) * MW + (x | 0)] !== 2 && !tileRes(x | 0, y | 0)) G.animals.push(new Animal("sheep", x, y));
  }
  for (let s = 0; s < 3; s++) {
    const a2 = rng() * 7, r2 = 3.5 + rng() * 2;
    const x = Math.floor(clamp(sx + 2 + Math.cos(a2) * r2, 1, G.MW - 2)), y = Math.floor(clamp(sy + 2 + Math.sin(a2) * r2, 1, G.MH - 2));
    const k = tkey(x, y);
    if (!G.resGrid.has(k) && terr[y * MW + x] !== 2) G.resGrid.set(k, { t: "berry", amt: 150, tx: x, ty: y });
  }
  G.mapDirty = true;
}

const OPEN = [], F = new Float64Array(1 << 16), GC = new Float64Array(1 << 16), PREV = new Int32Array(1 << 16);
let visitStamp = 0, VS = new Int32Array(1 << 16);
function findPath(sx, sy, tx, ty, tol, forOwner, block) {
  sx = clamp(sx | 0, 0, G.MW - 1); sy = clamp(sy | 0, 0, G.MH - 1);
  tx = clamp(tx | 0, 0, G.MW - 1); ty = clamp(ty | 0, 0, G.MH - 1);
  const MW = G.MW, MH = G.MH;
  const start = sy * MW + sx, goal = ty * MW + tx, size = MW * MH;
  if (start === goal) return [{ x: tx + .5, y: ty + .5 }];
  visitStamp++;
  if (VS.length < size) { VS = new Int32Array(size); F.fill(0); GC.fill(0); PREV.fill(0); }
  const heap = [start]; VS[start] = visitStamp; GC[start] = 0;
  PREV[start] = -1;
  const h = (i) => { const x = i % MW, y = (i / MW) | 0; const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); };
  F[start] = h(start);
  let it = 0, found = -1;
  const tol2 = (tol || 1) * (tol || 1) + .2;
  const pushHeap = (arr, v, fv) => { arr.push(v); let i = arr.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (F[arr[p]] <= fv) break; arr[i] = arr[p]; i = p; } arr[i === 0 ? 0 : i] = v; };
  const popHeap = (arr) => { const top = arr[0], last = arr.pop(); if (arr.length) { arr[0] = last; let i = 0; for (; ;) { const l = i * 2 + 1, r = l + 1; let s = i; if (l < arr.length && F[arr[l]] < F[arr[s]]) s = l; if (r < arr.length && F[arr[r]] < F[arr[s]]) s = r; if (s === i) break; const t = arr[i]; arr[i] = arr[s]; arr[s] = t; i = s; } } return top; };
  while (heap.length && it++ < 4200) {
    const cur = popHeap(heap);
    const cx = cur % MW, cy = (cur / MW) | 0;
    const ddx = cx - tx, ddy = cy - ty;
    if (dx2(ddx, ddy) <= tol2) { found = cur; break; }
    for (let oy2 = -1; oy2 <= 1; oy2++) for (let ox2 = -1; ox2 <= 1; ox2++) {
      if (!oy2 && !ox2) continue;
      const nx = cx + ox2, ny = cy + oy2;
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      if (!walkableAt(nx, ny, forOwner === undefined ? -1 : forOwner)) continue;
      if (block && block.has(ny * MW + nx)) continue;
      if (ox2 && oy2 && (!walkableAt(cx + ox2, cy, -1) || !walkableAt(cx, cy + oy2, -1))) continue;
      const ni = ny * MW + nx;
      const g = GC[cur] + (ox2 && oy2 ? 1.414 : 1);
      if (VS[ni] !== visitStamp) { VS[ni] = visitStamp; GC[ni] = g; F[ni] = g + h(ni); PREV[ni] = cur; pushHeap(heap, ni, F[ni]); }
      else if (g < GC[ni]) { GC[ni] = g; F[ni] = g + h(ni); PREV[ni] = cur; }
    }
  }
  if (found < 0) return null;
  const pts = [];
  let c = found;
  while (c !== -1 && c !== start) { pts.push({ x: (c % MW) + .5, y: ((c / MW) | 0) + .5 }); c = PREV[c]; if (pts.length > 3000) break; }
  pts.reverse();
  return pts.length ? pts : [{ x: tx + .5, y: ty + .5 }];
}
function dx2(a, b) { return a * a + b * b; }

function updateVision() {
  const MW = G.MW, MH = G.MH;
  G.vis.fill(0);
  const human = G.players[0];
  const teamP = p => p.team === human.team;
  const see = (x, y, los) => {
    const ix = x | 0, iy = y | 0, r = Math.ceil(los);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > (los + .4) * (los + .4)) continue;
      const xx = ix + dx, yy = iy + dy;
      if (xx < 0 || yy < 0 || xx >= MW || yy >= MH) continue;
      const i2 = yy * MW + xx;
      G.vis[i2]++;
      G.seen[i2] = 1;
    }
  };
  for (const pl of G.players) {
    if (!teamP(pl)) continue;
    if (pl.resigned) continue;
    for (const u of G.units) if (u.alive && u.owner === pl.idx) see(u.x, u.y, u.st.los);
    for (const b of G.buildings) if (b.alive && b.done && b.owner === pl.idx) see(b.tx + (b.spec.fp[0] - 1) / 2, b.ty + (b.spec.fp[1] - 1) / 2, b.spec.los);
  }
}

function updateGame(dt) {
  if (!G || !G.running || G.paused) return;
  dt *= G.speed;
  G.time += dt;
  G.visionT -= dt;
  if (G.visionT <= 0) { G.visionT = .35; updateVision(); }
  for (const p of G.players) {
    if (p.hitT > 0) p.hitT -= dt;
    if (p.eraNext > p.era) {
      p.eraT -= dt;
      if (p.eraT <= 0) { p.era = p.eraNext; p.eraNext = -1; toast(D.CIVS[p.civ].name + " 進入 " + D.ERAS[p.era].name); }
    }
    for (let i = p.research.length - 1; i >= 0; i--) {
      const r = p.research[i]; r.t -= dt;
      if (r.t <= 0) { p.techs.add(r.tid); p.research.splice(i, 1); toast("完成科技：" + D.TECHS[r.tid].name); AudioSys.sfx("done"); refreshStats(p.idx); }
    }
    if (p.wonderT > 0) {
      p.wonderT -= dt;
      if (p.wonderT <= 0) { p.wonderT = -1; checkWin(true); }
    }
  }
  for (const u of G.units) u.update(dt);
  for (const a of G.animals) a.update(dt);
  for (const b of G.buildings) b.update(dt);
  for (const p of G.ghosts || []) { }
  const aliveUnits = [];
  for (const u of G.units) { if (u.alive) aliveUnits.push(u); else { u.fade -= dt * 2; } }
  G.units = aliveUnits.filter(u => u.alive || u.fade > 0);
  const deadAnimals = [];
  G.animals = G.animals.filter(a => a.alive && !a.dead);
  G.buildings = G.buildings.filter(b => b.alive);
  for (let i = G.projs.length - 1; i >= 0; i--) {
    const p = G.projs[i];
    const t = p.tgt;
    let tx, ty;
    if (t && t.alive) { tx = t.x !== undefined ? t.x : t.tx + (D.BUILDS[t.typeId].fp[0] - 1) / 2; ty = t.y !== undefined ? t.y : t.ty + (D.BUILDS[t.typeId].fp[1] - 1) / 2; }
    else { G.projs.splice(i, 1); continue; }
    const dx = tx - p.x, dy = ty - p.y;
    const d = Math.hypot(dx, dy), step = (p.spd || 9) * dt;
    p.x += dx / d * step; p.y += dy / d * step;
    if (d < .45 || d <= step) {
      dealDamage(t, p.dmg, p.bonus || 0, p.owner, p.pierce);
      if (p.splash > 0) {
        for (const u2 of G.units) if (u2 !== t && u2.alive && Math.hypot(u2.x - tx, u2.y - ty) < p.splash && isEnemy(p.owner, u2.owner))
          dealDamage(u2, p.dmg * .6, (p.bonus || 0) * .6, p.owner, p.pierce);
      }
      G.projs.splice(i, 1);
    }
  }
  separate(dt);
  if (G.aiT === undefined) G.aiT = 0;
  G.aiT -= dt;
  if (G.aiT <= 0) { G.aiT = .5; for (const p of G.players) if (p.isAI && p.alive) updateAI(p.idx, dt); }
  if (G._winT === undefined) G._winT = 1;
  G._winT -= dt;
  if (G._winT <= 0) { G._winT = 2.5; checkWin(); }
  if (G.floaters.length) G.floaters = G.floaters.filter(f => (f.t -= dt) > 0);
  if (!G._saveT || G.time - G._saveT > 40) { G._saveT = G.time; try { localStorage.setItem("aoe2web_autosave", JSON.stringify(serializeGame())); } catch (e) { } }
}
function refreshStats(pl) {
  const p = G.players[pl];
  for (const u of G.units) if (u.owner === pl) { const ns = calcStats(u.tid, p); u.st = ns; u.maxHp = ns.hp; }
}
function separate(dt) {
  const cell = {}, MW = G.MW;
  for (const u of G.units) {
    if (!u.alive) continue;
    const k = ((u.y | 0) * MW + (u.x | 0));
    (cell[k] || (cell[k] = [])).push(u);
  }
  for (const k in cell) {
    const arr = cell[k];
    const kk = k | 0;
    const nb = [arr];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const nk = kk + dy * MW + dx;
      if (cell[nk]) nb.push(cell[nk]);
    }
    for (const other of nb) for (let i = 0; i < arr.length; i++) for (let j = (other === arr ? i + 1 : 0); j < other.length; j++) {
      const a = arr[i], b = other[j];
      if (!a.alive || !b.alive) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d < .5 && d > .001) {
        const push = (.5 - d) * .4;
        const ua = a.mode === "gather" || a.mode === "build", ub = b.mode === "gather" || b.mode === "build";
        a.x -= dx / d * push * (ua ? .3 : .6); a.y -= dy / d * push * (ua ? .3 : .6);
        b.x += dx / d * push * (ub ? .3 : .6); b.y += dy / d * push * (ub ? .3 : .6);
      }
    }
  }
  for (const u of G.units) {
    if (!u.alive) continue;
    if (!walkableAt(u.x | 0, u.y | 0, u.owner)) {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
      for (const [dx, dy] of dirs) if (walkableAt((u.x | 0) + dx, (u.y | 0) + dy, u.owner)) { u.x = (u.x | 0) + dx + .5; u.y = (u.y | 0) + dy + .5; break; }
    }
  }
}

function checkWin(force) {
  if (!G || G.ended) return;
  for (const p of G.players) {
    if (!p.alive) continue;
    const has = G.units.some(u => u.owner === p.idx && u.alive) || G.buildings.some(b => b.owner === p.idx && b.alive);
    if (!has) {
      p.alive = false;
      toast(CivName(p) + " 已被消滅！");
      if (p.wonderT > 0) { p.wonderT = -1; p.wonderBuilt = false; }
    }
  }
  if (!G.players[0].alive && G.players.filter(p => p.alive && p.team === G.players[0].team).length === 0) { endGame(false); return; }
  const teams = new Set(G.players.filter(p => p.alive).map(p => p.team));
  if (teams.size <= 1) {
    const winner = [...teams][0];
    const humanAliveTeam = G.players.some(p => p.alive && p.team === G.players[0].team);
    endGame(winner === G.players[0].team && humanAliveTeam);
    return;
  }
  if (G.cfg.relicWin) {
    for (const p of G.players) if (p.relics >= G.relicTotal) { endGame(p.team === G.players[0].team); return; }
  }
  if (G.cfg.wonderWin) {
    for (const p of G.players) if (p.alive && p.wonderBuilt && p.wonderT === -1) { endGame(p.team === G.players[0].team); return; }
  }
}
function CivName(p) { return D.CIVS[p.civ].name; }
function endGame(win) {
  if (G.ended) return;
  G.ended = true;
  const t = document.getElementById("endTitle");
  t.textContent = win ? "勝利！" : "戰敗…";
  t.style.color = win ? "#ffd970" : "#d0432f";
  document.getElementById("screenEnd").classList.remove("hidden");
  AudioSys.sfx(win ? "age" : "death");
}

function toast(msg, warn) {
  const box = document.getElementById("msgToasts");
  if (!box) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  if (warn) el.style.color = "#ff9a8a";
  box.appendChild(el);
  setTimeout(() => el.remove(), 4200);
  const kids = [...box.children];
  if (kids.length > 6) kids[0].remove();
}

function renderGame() {
  const g = GAME;
  const c = g.ctx, W = g.canvas.width, H = g.canvas.height;
  if (!G) return;
  c.imageSmoothingEnabled = false;
  c.fillStyle = "#0a1622";
  c.fillRect(0, 0, W, H);
  const camX = G.camX, camY = G.camY;
  const ox = W / 2 - (camX - camY) * HW, oy = H / 2 - (camX + camY) * HH;
  g._ox = ox; g._oy = oy;
  const w2s = (x, y) => [ox + (x - y) * HW, oy + (x + y) * HH];
  const corners = [[-ox, -oy], [(W - ox), -oy], [-ox, (H - oy)], [(W - ox), (H - oy)]].map(([sx, sy]) => [(sx / HW + sy / HH) / 2, (sy / HH - sx / HW) / 2]);
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (const [x, y] of corners) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
  minx = clamp(Math.floor(minx) - 2, 0, G.MW - 1); maxx = clamp(Math.ceil(maxx) + 2, 0, G.MW - 1);
  miny = clamp(Math.floor(miny) - 3, 0, G.MH - 1); maxy = clamp(Math.ceil(maxy) + 3, 0, G.MH - 1);
  const wframe = (G.time * 1.6 | 0) % 2;
  const drawList = [];
  const isFlatB = b => b.spec.wh <= 0;
  // 1) ground tiles
  for (let ty = miny; ty <= maxy; ty++) {
    for (let tx = minx; tx <= maxx; tx++) {
      const i = ty * G.MW + tx;
      const t = G.terr[i];
      const [sx, sy] = w2s(tx + .5, ty + .5);
      if (t === 2) {
        const nearLand = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tx + dx >= 0 && ty + dy >= 0 && tx + dx < G.MW && ty + dy < G.MH && G.terr[(ty + dy) * G.MW + tx + dx] !== 2);
        c.drawImage(SPR.tile(nearLand ? "shallows" : "water", (wframe + (tx + ty) % 2) % 2), sx - 32, sy - 16);
      } else {
        const r = tileRes(tx, ty);
        let tn = "grass";
        if (r) { if (r.t === "gold") tn = "gold"; else if (r.t === "stone") tn = "stone"; else if (r.t === "berry") tn = "berry"; }
        c.drawImage(SPR.tile(tn, r ? 0 : (tx * 7 + ty * 13) & 3), sx - 32, sy - 16);
        if (r && r.t === "tree") c.drawImage(SPR.ground("tree", (tx * 5 + ty * 3) % 4), sx - 36, sy - 56);
      }
    }
  }
  // 2) ground-level buildings (farms): painted on the soil, villagers/military always render above
  const flats = [];
  for (const b of G.buildings) { if (isFlatB(b) && (b.owner === 0 || isVisibleB(b))) flats.push(b); }
  flats.sort((a, bb) => (a.tx + a.ty) - (bb.tx + bb.ty));
  for (const b of flats) drawBuilding(c, b, w2s);
  // 3) fog of war (dims ground AND farms uniformly)
  for (let ty = miny; ty <= maxy; ty++) {
    for (let tx = minx; tx <= maxx; tx++) {
      const i = ty * G.MW + tx;
      if (G.seen[i] && G.vis[i]) continue;
      const [sx, sy] = w2s(tx + .5, ty + .5);
      if (!G.seen[i]) {
        c.fillStyle = "#05070c";
        c.beginPath(); c.moveTo(sx, sy - 16); c.lineTo(sx + 32, sy); c.lineTo(sx, sy + 16); c.lineTo(sx - 32, sy); c.closePath(); c.fill();
      } else {
        c.fillStyle = "rgba(14,16,34,.55)";
        c.beginPath(); c.moveTo(sx, sy - 16); c.lineTo(sx + 32, sy); c.lineTo(sx, sy + 16); c.lineTo(sx - 32, sy); c.closePath(); c.fill();
      }
    }
  }
  // 4) solid buildings + entities, depth = iso anchor of footprint base
  for (const b of G.buildings) {
    if (isFlatB(b)) continue;
    if (b.owner === 0 || isVisibleB(b)) drawList.push({ d: b.tx + b.ty + (b.spec.fp[0] + b.spec.fp[1]) / 2 - .5, b });
  }
  for (const u of G.units) {
    if (u.owner === 0 || visible(u, 0)) drawList.push({ d: u.x + u.y, u });
  }
  for (const a of G.animals) {
    if (visible(a, 0)) drawList.push({ d: a.x + a.y, a });
  }
  for (const r of G.relics) if (!r.got && !r.carried) drawList.push({ d: r.x + r.y, r });
  drawList.sort((a, bb) => a.d - bb.d);
  for (const it of drawList) {
    if (it.b) drawBuilding(c, it.b, w2s);
    else if (it.u) drawUnit(c, it.u, w2s);
    else if (it.a) drawAnimal(c, it.a, w2s);
    else if (it.r) { const [sx, sy] = w2s(it.r.x + .5, it.r.y + .5); c.drawImage(SPR.ground("relic", 0), sx - 8, sy - 16); }
  }
  for (const p of G.projs) {
    const [sx, sy] = w2s(p.x, p.y);
    const t = p.tgt;
    let ang = 0;
    if (t && t.alive) {
      const txp = t.x !== undefined ? t.x : t.tx, typ = t.y !== undefined ? t.y : t.ty;
      const r2 = rotIso2(txp - p.x, typ - p.y);
      ang = Math.atan2(r2[1], r2[0]);
    }
    if (p.kind === "stone") { const sp = SPR.proj("stone"); c.drawImage(sp, sx - 5, sy - 12); }
    else {
      const sp = SPR.proj("arrow");
      c.save(); c.translate(sx, sy - 8); c.rotate(ang); c.drawImage(sp, -8, -3); c.restore();
    }
  }
  if (G.placing && UI && UI.ghostTile) UI.drawPlacement(c, w2s);
  if (!G.resLabelsOff) {
    c.font = "bold 9px monospace"; c.textAlign = "center"; c.lineWidth = 2;
    for (let ry = miny; ry <= maxy; ry++) for (let rx = minx; rx <= maxx; rx++) {
      const r = tileRes(rx, ry);
      if (!r) continue;
      const vi = ry * G.MW + rx;
      if (!G.seen[vi] || !G.vis[vi]) continue;
      const amt = Math.ceil(r.amt !== undefined ? r.amt : 0);
      if (amt <= 0) continue;
      const [sx, sy] = w2s(rx + .5, ry + .5);
      const col = r.t === "gold" ? "#ffd970" : r.t === "stone" ? "#d5dbe4" : r.t === "tree" ? "#9fe06a" : "#f0a0a0";
      c.strokeStyle = "rgba(0,0,0,.8)"; c.strokeText(amt, sx + 13, sy + 10);
      c.fillStyle = col; c.fillText(amt, sx + 13, sy + 10);
    }
    c.textAlign = "left";
  }
  if (G.sel.size) {
    c.strokeStyle = "#5dd84a"; c.lineWidth = 2;
    for (const u of G.sel) { const [sx, sy] = w2s(u.x, u.y); c.beginPath(); c.ellipse(sx, sy, 15, 7.5, 0, 0, 7); c.stroke(); }
  }
  if (G.selBld && G.selBld.alive) {
    c.strokeStyle = "#5dd84a"; c.lineWidth = 2;
    const b = G.selBld, [sx, sy] = w2s(b.tx + (b.spec.fp[0] - 1) / 2, b.ty + (b.spec.fp[1] - 1) / 2);
    c.strokeRect(sx - b.spec.fp[0] * HW / 2 - 6, sy - 40, b.spec.fp[0] * HW + 12, 60);
  }
  if (G.floaters) for (const f of G.floaters) { const [sx, sy] = w2s(f.x, f.y); c.fillStyle = "rgba(255,231,140," + Math.min(1, f.t) + ")"; c.font = "11px sans-serif"; c.fillText(f.txt, sx - 6, sy - 14 - (1.4 - f.t) * 10); }
}
function rotIso2(dx, dy) { return [((dx - dy) * HW) / 32, ((dx + dy) * HH) / 24]; }
function isVisibleB(b) {
  const i = (b.ty | 0) * G.MW + (b.tx | 0);
  return G.seen[i] && (G.vis[i] > 0 || b.owner === 0 || (G.players[b.owner] && G.players[b.owner].team === G.players[0].team));
}
function drawBuilding(c, b, w2s) {
  const spec = b.spec;
  const [sx, sy] = w2s(b.tx + spec.fp[0] / 2, b.ty + spec.fp[1] / 2);
  const stage = b.typeId === "farm" ? (b.done ? (b.food > 0 ? 1 : .15) : b.progress) : b.progress;
  const spr = SPR.building(b.typeId, G.players[b.owner].color, stage);
  c.globalAlpha = b.done ? 1 : .92;
  c.drawImage(spr, sx - spr._anchorX, sy - spr._anchorY + (spec.fp[0] + spec.fp[1] - 2) * HH / 2 * 0);
  c.globalAlpha = 1;
  if (!b.done) {
    const [bx, by] = w2s(b.tx, b.ty + spec.fp[1]);
    const w = spec.fp[0] * HW * .9, h = 5;
    const px = sx - w / 2, py = by + 8;
    c.fillStyle = "#1c2138"; c.fillRect(px, py, w, h);
    c.fillStyle = "#4ec54e"; c.fillRect(px, py, w * b.progress, h);
    c.strokeStyle = "#6b7ab0"; c.strokeRect(px, py, w, h);
  } else if (b.hp < b.maxHp) hpBar(c, sx, sy - 34, spr.width < 60 ? 30 : 44, b.hp / b.maxHp);
  if (b.rally && b === G.selBld) { const [rx, ry] = w2s(b.rally[0], b.rally[1]); c.fillStyle = "#4ec54e"; c.fillRect(rx - 3, ry - 3, 6, 6); }
  if (b.typeId === "farm" && b.done && !G.resLabelsOff) {
    const v = Math.ceil(b.food || 0);
    c.font = "bold 9px monospace"; c.textAlign = "center"; c.lineWidth = 2;
    c.strokeStyle = "rgba(0,0,0,.8)"; c.strokeText("🌾 " + v, sx, sy - 26);
    c.fillStyle = v > 20 ? "#e8f0a0" : "#e0b83a"; c.fillText("🌾 " + v, sx, sy - 26);
    c.textAlign = "left";
  }
}
function hpBar(c, x, y, w, r) {
  c.fillStyle = "#1c160c"; c.fillRect(x - w / 2, y, w, 3.5);
  c.fillStyle = r > .5 ? "#4ec54e" : (r > .25 ? "#e0b83a" : "#d0432f");
  c.fillRect(x - w / 2, y, w * clamp(r, 0, 1), 3.5);
}
function drawUnit(c, u, w2s) {
  const [sx, sy] = w2s(u.x, u.y);
  const sub = u.spec.sub;
  let act = u.act || "std", af = 0;
  if (!u.alive) act = "std";
  else if (act === "wood" || act === "mine" || act === "build") af = (u.actT * 2.6 | 0) % 2;
  else if (act === "farm" || act === "heal") af = (u.actT * 2.4 | 0) % 2;
  else if (act === "atk" || act === "fire") af = u.actK > .16 ? 2 : (u.actK > 0 ? 1 : 0);
  let spr;
  if (u.spec.spr === "siege" && sub) spr = SPR.siege(sub, G.players[u.owner].color);
  else spr = SPR.unit(u.spec.spr, G.players[u.owner].color, u.dir, u.alive ? u.frame : 0, u.spec.wpn || "none", act, af);
  c.globalAlpha = u.alive ? 1 : Math.max(0, u.fade);
  c.drawImage(spr, sx - spr.width / 2, sy - spr.height + 8);
  c.globalAlpha = 1;
  if (u.carry > 0) { c.fillStyle = "#c8a24a"; c.fillRect(sx - 3, sy - spr.height - 2, 6, 5); }
  if (u.alive && u.hp < u.maxHp && (u.owner === 0 || G.vis[(u.y | 0) * G.MW + (u.x | 0)] > 0)) hpBar(c, sx, sy - spr.height + 2 + 3, 22, u.hp / u.maxHp);
}
function drawAnimal(c, a, w2s) {
  const [sx, sy] = w2s(a.x, a.y);
  const spr = SPR.ground(a.tid, 0);
  c.drawImage(spr, sx - 12, sy - 26);
  if (a.food < (a.tid === "deer" ? 178 : 120)) hpBar(c, sx, sy - 24, 16, a.food / (a.tid === "deer" ? 178 : 120));
}

function renderMinimap() {
  const mc = GAME.mc, mm = GAME.mm;
  if (!G) return;
  if (G.mapDirty) {
    const off = GAME._mmOff && GAME._mmOff.width === G.MW ? GAME._mmOff : (GAME._mmOff = cc(G.MW, G.MH));
    const g = off.getContext("2d");
    const img = g.createImageData(G.MW, G.MH);
    for (let y = 0; y < G.MH; y++) for (let x = 0; x < G.MW; x++) {
      const i = (y * G.MW + x) * 4;
      const t = G.terr[y * G.MW + x];
      const r = tileRes(x, y);
      let col = [76, 122, 46];
      if (t === 2) col = [44, 90, 136];
      else if (r) { if (r.t === "tree") col = [24, 58, 26]; else if (r.t === "gold") col = [217, 160, 31]; else if (r.t === "stone") col = [154, 160, 168]; else if (r.t === "berry") col = [120, 40, 30]; }
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    G.mapDirty = false;
    G._mapBase = g;
  }
  mc.imageSmoothingEnabled = false;
  mc.clearRect(0, 0, 200, 200);
  mc.drawImage(GAME._mmOff, 0, 0, 200, 200);
  const sc = 200 / G.MW;
  for (const b of G.buildings) {
    if (!isVisibleB(b)) continue;
    mc.fillStyle = G.seen[(b.ty | 0) * G.MW + (b.tx | 0)] && G.vis[(b.ty | 0) * G.MW + (b.tx | 0)] > 0 ? D.PCOLORS[G.players[b.owner].color % D.PCOLORS.length] : "#777";
    mc.fillRect(b.tx * sc, b.ty * sc, Math.max(2, b.spec.fp[0] * sc), Math.max(2, b.spec.fp[1] * sc));
  }
  for (const u of G.units) {
    if (u.owner !== 0 && !visible(u, 0)) continue;
    mc.fillStyle = D.PCOLORS[G.players[u.owner].color % D.PCOLORS.length];
    mc.fillRect(u.x * sc - 1, u.y * sc - 1, 2.4, 2.4);
  }
  for (const r of G.relics) if (!r.got && visible({ owner: -1, x: r.x, y: r.y }, 0)) { mc.fillStyle = "#ffd970"; mc.fillRect(r.x * sc - 2, r.y * sc - 2, 4, 4); }
  mc.fillStyle = "rgba(0,0,0,.55)";
  for (let y = 0; y < G.MH; y++) for (let x = 0; x < G.MW; x++) {
    const i = y * G.MW + x;
    if (!G.seen[i]) { mc.fillStyle = "rgba(2,4,8,.92)"; mc.fillRect(x * sc, y * sc, sc + 1, sc + 1); }
    else if (!G.vis[i]) { mc.fillStyle = "rgba(2,4,8,.45)"; mc.fillRect(x * sc, y * sc, sc + 1, sc + 1); }
  }
}
