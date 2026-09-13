"use strict";
let ENT_ID = 1;
const fmtRes = (c) => { const m = { food: "🌾", wood: "🪵", gold: "🪙", stone: "⛏️" }; return Object.keys(c).map(k => m[k] + " " + c[k]).join("  "); };
const RES_ICON = { food: "🌾", wood: "🪵", gold: "🪙", stone: "⛏️" };

function calcStats(tid, pl) {
  const base = D.UNITS[tid];
  const s = { hp: base.hp, atk: base.atk || 0, cd: base.cd || 2, ar: base.ar || 0, sar: base.sar || 0, spd: base.spd, rng: base.rng || 0, carry: (base.carry || 0), heal: base.heal || 0, los: base.los || 3, cls: (base.cls || []).slice(), bonus: (base.bonus || []).slice(), pierce: base.pierce || 0, moving: false };
  const civ = D.CIVS[pl.civ];
  const effList = [];
  if (civ && civ.passives) effList.push(...civ.passives);
  for (const t of pl.techs) { const e = D.TECHS[t]; if (e && e.eff && !e.civ) effList.push(e.eff); }
  if (civ && civ.tech && pl.techs.has(civ.tech)) effList.push(D.TECHS[civ.tech].eff);
  for (const e of effList) {
    if (e.units && !e.units.includes(tid)) continue;
    if (e.atk) s.atk += e.atk;
    if (e.ar) s.ar += e.ar;
    if (e.hp) s.hp = Math.round(s.hp * (1 + e.hp));
    if (e.spd) s.spd *= (1 + e.spd);
    if (e.rng) s.rng += e.rng;
    if (e.carry) s.carry += e.carry;
    if (e.heal) s.heal += e.heal;
    if (e.cd) s.cd = Math.max(0.4, s.cd + e.cd);
    if (e.moving) s.moving = true;
    if (e.bonusAdd) s.bonus.push(...e.bonusAdd);
    if (e.pierce) s.pierce = Math.max(s.pierce, e.pierce);
  }
  return s;
}
function ecoBonus(pl, k) {
  let v = 0;
  for (const t of pl.techs) { const e = D.TECHS[t]; if (e && e.eff && e.eco && e.eco[k]) v += e.eco[k]; }
  const civ = D.CIVS[pl.civ];
  if (civ && civ.passives) for (const p of civ.passives) if (p.eco && p.eco[k]) v += p.eco[k];
  return v;
}
function buildingHpMod(pl) {
  let hp = 1, ar = 0;
  for (const t of pl.techs) { const e = D.TECHS[t]; if (e && e.eff) { if (e.eff.bhp) hp += e.eff.bhp; if (e.eff.barm) ar += e.eff.barm; } }
  return { hp, ar };
}
function isEnemy(a, b) {
  const pa = G.players[a], pb = G.players[b];
  if (!pa || !pb) return false;
  return pa.alive && pb.alive && pa.team !== pb.team;
}

class Ent {
  constructor(pl) { this.id = ENT_ID++; this.owner = pl; this.alive = true; this.fade = 1; }
  center() { return [this.x, this.y]; }
  radius() { return 0.45; }
}

class Unit extends Ent {
  constructor(pl, tid, x, y) {
    super(pl);
    this.tid = tid; this.spec = D.UNITS[tid];
    const p = G.players[pl];
    this.st = calcStats(tid, p);
    this.maxHp = this.st.hp; this.hp = this.st.hp;
    this.x = x; this.y = y; this.dir = 0; this.frame = 0; this.animT = 0;
    this.mode = "idle"; this.path = null; this.pathI = 0; this.dest = null;
    this.target = null; this.task = null; this.carry = 0; this.carryKind = null;
    this.atkT = 0; this.repathT = 0; this.aggroT = 0; this.dropB = null;
    this.spawnT = 0.4;
    this.act = "std"; this.actT = 0; this.actK = 0; this.stuckT = 0;
  }
  pop() { return this.spec.pop || 1; }
  setMode(m) { this.mode = m; this.path = null; }
  pathTo(tx, ty, tol) {
    const sx0 = Math.floor(this.x), sy0 = Math.floor(this.y);
    const gt = tx | 0, gy = ty | 0;
    let block = null;
    const bx1 = Math.max(Math.min(sx0, gt) - 9, 0), bx2 = Math.min(Math.max(sx0, gt) + 9, G.MW - 1);
    const by1 = Math.max(Math.min(sy0, gy) - 9, 0), by2 = Math.min(Math.max(sy0, gy) + 9, G.MH - 1);
    block = new Set();
    for (const o of G.units) {
      if (!o.alive || o === this || o === this.target) continue;
      const oxo = o.x | 0, oyo = o.y | 0;
      if (oxo < bx1 || oxo > bx2 || oyo < by1 || oyo > by2) continue;
      if (Math.abs(oxo - gt) <= 1 && Math.abs(oyo - gy) <= 1) continue;
      block.add(oyo * G.MW + oxo);
    }
    if (block.size === 0) block = null;
    else block.delete(sy0 * G.MW + sx0);
    let p = G.findPath(sx0, sy0, tx, ty, tol || 1.2, this.owner, block);
    if (!p && block) p = G.findPath(sx0, sy0, tx, ty, tol || 1.2, this.owner, null);
    if (p) { this.path = p; this.pathI = 0; return true; }
    return false;
  }
  step(dt) {
    if (!this.path) return true;
    const wp = this.path[this.pathI];
    const dx = wp.x - this.x, dy = wp.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < .12) { this.pathI++; if (this.pathI >= this.path.length) { this.path = null; return true; } return false; }
    let mvx = dx / d, mvy = dy / d;
    // local avoidance: slide around crowding units instead of bulldozing into them
    const perpx = -mvy, perpy = mvx;
    let avx = 0, avy = 0;
    for (const o of G.units) {
      if (o === this || !o.alive || o === this.target) continue;
      const ox = o.x - this.x, oy = o.y - this.y;
      const dd = Math.hypot(ox, oy);
      if (dd > .78 || dd < .001) continue;
      const ahead = (ox * mvx + oy * mvy) / dd;
      if (ahead < .35) continue;
      const lat = ox * perpx + oy * perpy;
      const w = (.78 - dd) * ahead;
      const sgn = lat > 0 ? -1 : (lat < 0 ? 1 : 1);
      avx += perpx * sgn * w; avy += perpy * sgn * w;
    }
    if (avx || avy) { mvx += avx * 1.6; mvy += avy * 1.6; const l = Math.hypot(mvx, mvy) || 1; mvx /= l; mvy /= l; }
    const sp = this.st.spd * dt;
    const x0 = this.x, y0 = this.y;
    const cx0 = this.x | 0, cy0 = this.y | 0;
    const x1 = this.x + mvx * sp;
    if ((x1 | 0) === cx0 || G.walkable(x1 | 0, cy0, this.owner)) this.x = x1;
    const y1 = this.y + mvy * sp;
    if ((y1 | 0) === (this.y | 0) || G.walkable(this.x | 0, y1 | 0, this.owner)) this.y = y1;
    this.dir = dirOf(mvx, mvy);
    const moved = Math.hypot(this.x - x0, this.y - y0);
    this.stuckT = moved < sp * .5 ? (this.stuckT || 0) + dt : 0;
    if (this.stuckT > .8) { this.repathT = 0; this.stuckT = 0; }
    this.animT += dt * this.st.spd * 3.4; this.frame = (this.animT | 0) % 2;
    return false;
  }
  distTo(e) {
    let ex, ey, rad;
    if (e.typeId) { const s = D.BUILDS[e.typeId]; ex = e.tx + (s.fp[0] - 1) / 2; ey = e.ty + (s.fp[1] - 1) / 2; rad = Math.max(s.fp[0], s.fp[1]) / 2; }
    else if (e.radius) { ex = e.x; ey = e.y; rad = e.radius(); }
    else { ex = e.x; ey = e.y; rad = .45; }
    return { d: Math.hypot(this.x - ex, this.y - ey) - rad * .8, ex, ey };
  }
  faceAt(e) { const r = this.distTo(e); let dx = r.ex - this.x, dy = r.ey - this.y; this.dir = dirOf(dx, dy); }
  canAttack() { return this.st.atk > 0; }
  fire(e) {
    this.atkT = this.st.cd;
    this.actK = .34;
    const sp = this.spec;
    const total = this.atkVs(e), bonus = total - this.st.atk;
    AudioSys.sfx(sp.proj ? "shoot" : "hitmelee");
    if (sp.proj) {
      G.projs.push({ x: this.x, y: this.y - .3, tgt: e, spd: 9, dmg: this.st.atk, bonus, owner: this.owner, splash: sp.splash || 0, pierce: this.st.pierce, kind: sp.proj, atkBy: this });
    } else {
      dealDamage(e, this.st.atk, bonus, this.owner, this.st.pierce);
    }
  }
  atkVs(e) {
    let dmg = this.st.atk, tcls = e.clsList ? e.clsList() : (e.typeId ? ["building", D.BUILDS[e.typeId].cls || ""] : []);
    if (!e.clsList) tcls = ["building"];
    for (const [c, v] of this.st.bonus) if (tcls.includes(c)) dmg += v;
    return dmg;
  }
  pickDrop(resKind) {
    let best = null, bd = 1e9;
    for (const b of G.buildings) {
      if (!b.done || b.owner !== this.owner) continue;
      if (!D.BUILDS[b.typeId].drop) continue;
      const dl = D.BUILDS[b.typeId];
      const isTC = b.typeId === "tc", isMill = b.typeId === "mill", isL = b.typeId === "lumber", isM = b.typeId === "mine";
      let ok = false;
      if (resKind === "food") ok = isTC || (isMill && this.task && this.task.kind === "farm");
      if (resKind === "wood") ok = isTC || isL;
      if (resKind === "gold" || resKind === "stone") ok = isTC || isM;
      if (!ok) continue;
      const d = Math.abs(b.tx - this.x) + Math.abs(b.ty - this.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  update(dt) {
    if (!this.alive) return;
    if (this.spawnT > 0) this.spawnT -= dt;
    if (this.atkT > 0) this.atkT -= dt;
    if (this.actK > 0) this.actK -= dt;
    if (this.aggroT > 0) this.aggroT -= dt;
    if (this.repathT > 0) this.repathT -= dt;
    this.act = "std";
    const m = this.mode;
    if (m === "move" || m === "amove") {
      const done = this.step(dt);
      const [tx, ty] = this.dest;
      if (!done && this.repathT <= 0) { this.pathTo(tx, ty); this.repathT = 1.5; }
      if (done) {
        if (m === "amove") { const e = scanEnemy(this, 8); if (e) { this.target = e; this.setMode("fight"); } else this.setMode("idle"); }
        else this.setMode("idle");
      }
      if (this.autoAcquire()) {}
    } else if (m === "fight") {
      const t = this.target;
      if (!t || !t.alive || !visible(t, this.owner)) {
        const e = scanEnemy(this, 8);
        if (e) { this.target = e; } else if (this.amDest) { this.dest = this.amDest; this.amDest = null; this.setMode("amove"); this.pathTo(this.dest[0], this.dest[1]); }
        else { if (m === "fight") this.setMode("idle"); }
        return;
      }
      const r = this.distTo(t);
      if (r.d <= this.st.rng + .1 && (this.st.moving || !this.path)) {
        this.faceAt(t);
        this.act = this.spec.proj ? "fire" : "atk";
        this.frame = 0;
        if (this.atkT <= 0) this.fire(t);
      } else {
        if (this.repathT <= 0) { this.pathTo(Math.floor(r.ex), Math.floor(r.ey), 1.0); this.repathT = .8; }
        this.step(dt);
      }
    } else if (m === "gather") {
      this.gatherUpdate(dt);
    } else if (m === "build") {
      const b = this.task.b;
      if (!b || !b.alive) { this.setMode("idle"); return; }
      if (b.done) { if (!b.queue || b.queue.length === 0) b.queue = b.queue || []; this.setMode("idle"); return; }
      const r = this.distTo(b);
      if (r.d < 1.9) { if (this.path) this.path = null; this.faceAt(b); this.act = "build"; this.actT += dt; this.frame = 0; b.addBuild(this, dt); }
      else { if (!this.path) { const s = D.BUILDS[b.typeId]; this.pathTo((b.tx + ((s.fp[0] - 1) / 2)) | 0, (b.ty + s.fp[1] + .5) | 0, 2.2); } this.step(dt); }
    } else if (m === "repair") {
      const b = this.task.b;
      if (!b || !b.alive || b.hp >= b.maxHp) { this.setMode("idle"); return; }
      const r = this.distTo(b);
      if (r.d < 1.3) { this.faceAt(b); this.act = "build"; this.actT += dt; this.frame = 0; b.hp = Math.min(b.maxHp, b.hp + dt * 12); if (Math.random() < dt * 2) AudioSys.sfx("build"); }
      else { if (!this.path) this.pathTo(Math.floor(r.ex), b.ty, 2); this.step(dt); }
    } else if (m === "return") {
      const b = this.dropB;
      if (!b || !b.alive || !b.done) { this.dropB = this.pickDrop(this.carryKind); if (!this.dropB) return; }
      const r = this.distTo(this.dropB);
      if (r.d < 1.9) {
        G.players[this.owner].res[this.carryKind] = (G.players[this.owner].res[this.carryKind] || 0) + this.carry;
        if (Math.random() < .5) AudioSys.sfx("gather");
        this.carry = 0; this.carryKind = null;
        if (this.task && this.task.doneGather) { this.setMode("idle"); }
        else this.setMode("gather");
      } else { if (!this.path) { const s = D.BUILDS[this.dropB.typeId]; this.pathTo((this.dropB.tx + (s.fp[0] >> 1) + .5) | 0, (this.dropB.ty + s.fp[1] + .5) | 0, 1.6); } this.step(dt); }
    } else if (m === "heal") {
      const t = this.target;
      if (!t || !t.alive || t.hp >= t.maxHp) { this.target = null; this.setMode("idle"); return; }
      const r = this.distTo(t);
      if (r.d <= this.st.rng) { this.faceAt(t); this.act = "heal"; this.actT += dt; this.frame = 0; if (this.atkT <= 0) { t.hp = Math.min(t.maxHp, t.hp + this.st.heal); this.atkT = this.st.cd; AudioSys.sfx("convert"); } }
      else { if (this.repathT <= 0) { this.pathTo(Math.floor(r.ex), Math.floor(r.ey), 1); this.repathT = 1; } this.step(dt); }
    } else if (m === "relic") {
      const rl = this.task.relic;
      if (!rl) { this.setMode("idle"); return; }
      if (!rl.carried) {
        const d = Math.hypot(this.x - rl.x, this.y - rl.y);
        if (d < 1.6) { rl.carried = true; rl.x = this.x; rl.y = this.y; }
        else { if (this.repathT <= 0) { this.pathTo(Math.floor(rl.x), Math.floor(rl.y), 1.5); this.repathT = 1; } this.step(dt); }
      } else {
        const tc = this.nearestTC();
        if (!tc) { this.setMode("idle"); return; }
        rl.x = this.x; rl.y = this.y;
        const r = this.distTo(tc);
        if (r.d < 1.15) { G.players[this.owner].relics++; rl.got = true; AudioSys.sfx("done"); toast("收回聖物！（共 " + G.players[this.owner].relics + " 件）"); this.task.relic = null; this.setMode("idle"); checkWin(); }
        else { if (this.repathT <= 0) { this.pathTo(tc.tx + 1, tc.ty + 3, 1.1); this.repathT = 1; } this.step(dt); }
      }
    } else if (m === "idle") {
      if (this.spec.spr === "monk") { const rl = freeRelic(this); if (rl) { this.task = { relic: rl }; this.setMode("relic"); } }
      else if (this.spec.hp > 0 && this.spec.bld !== "tc" || this.spec.atk > 0) { }
      if (this.autoAcquire()) { }
    }
  }
  autoAcquire() {
    if (this.mode !== "idle" && this.mode !== "amove") return false;
    if (this.spec.atk <= 0 || this.spec.spr === "vill") return false;
    const e = scanEnemy(this, this.st.rng + 2.2);
    if (e) { this.amDest = this.mode === "amove" ? this.dest : null; this.target = e; this.setMode("fight"); return true; }
    return false;
  }
  nearestTC() { for (const b of G.buildings) if (b.owner === this.owner && b.typeId === "tc" && b.done && b.alive) return b; return null; }
  gatherUpdate(dt) {
    const tsk = this.task;
    if (!tsk) { this.setMode("idle"); return; }
    if (this.carry >= this.st.carry) {
      this.carryKind = tsk.res; this.carry = Math.min(this.carry, this.st.carry);
      this.dropB = this.pickDrop(tsk.res) || this.nearestTC();
      if (!this.dropB) return;
      this.setMode("return"); return;
    }
    const amt = tsk.src.amt !== undefined ? tsk.src.amt : tsk.src.food;
    if (amt === undefined || amt <= 0) {
      if (tsk.src.claims && tsk.src.claims[this.owner]) tsk.src.claims[this.owner]--;
      const src = tsk.src;
      if (!src.typeId) { if (src.tid) src.dead = true; removeRes(src); }
      const nxt = this.findNextRes(tsk.res, src);
      if (nxt) {
        const sx = nxt.tx !== undefined ? nxt.tx + .5 : nxt.x, sy = nxt.ty !== undefined ? nxt.ty + .5 : nxt.y;
        this.task = { src: nxt, sx, sy, res: tsk.res };
        this.repathT = 0;
        if (nxt.claims) nxt.claims[this.owner] = (nxt.claims[this.owner] || 0) + 1;
        return;
      }
      this.setMode("idle");
      return;
    }
    let tx = tsk.sx, ty = tsk.sy;
    if (tsk.src.tid) { tx = tsk.src.x; ty = tsk.src.y; }
    const d = Math.hypot(this.x - tx, this.y - ty);
    if (d > 1.35) {
      if (this.repathT <= 0) { this.pathTo(tx | 0, ty | 0, 1.4); this.repathT = .9; }
      this.step(dt);
      if (tsk.src.tid && tsk.src.mode === "graze") tsk.src.mode = "flee";
    } else {
      this.faceAt({ x: tx, y: ty });
      this.act = tsk.res === "wood" ? "wood" : (tsk.res === "stone" || tsk.res === "gold" ? "mine" : "farm");
      this.actT += dt; this.frame = 0;
      const rate = this.spec.grate * (1 + ecoBonus(G.players[this.owner], "gather")) * dt * (tsk.res === "food" && tsk.src.tid ? (1 + ecoBonus(G.players[this.owner], "fishMul") * 0) : 1);
      const take = Math.min(rate, amt);
      if (tsk.src.amt !== undefined) tsk.src.amt -= take; else tsk.src.food -= take;
      this.carry += take;
      if (Math.random() < dt * .8) AudioSys.sfx("gather");
      if (tsk.src.tid) { tsk.src.mode = "flee"; tsk.src.scareT = 3; }
    }
  }
  findNextRes(res, oldSrc) {
    const kinds = res === "wood" ? ["tree"] : res === "gold" ? ["gold"] : res === "stone" ? ["stone"] : ["berry"];
    let best = null, bd = 1e9;
    for (const r of G.resGrid.values()) {
      if (!kinds.includes(r.t) || r === oldSrc) continue;
      if ((r.amt !== undefined ? r.amt : 0) <= 0) continue;
      const dd = Math.abs(r.tx - this.x) + Math.abs(r.ty - this.y);
      if (dd > 16 || dd >= bd) continue;
      best = r; bd = dd;
    }
    if (res === "food") {
      for (const b of G.buildings) {
        if (!b.alive || !b.done || b.typeId !== "farm" || b.owner !== this.owner) continue;
        if ((b.food || 0) <= 0 || b === oldSrc) continue;
        const d = Math.abs(b.tx + 1 - this.x) + Math.abs(b.ty + 1 - this.y);
        if (d < 14 && d < bd) { best = b; bd = d; }
      }
    }
    return best;
  }
}
function dirOf(dx, dy) {
  const a = Math.atan2(dy, dx);
  return Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
}
function scanEnemy(u, rng) {
  let best = null, bd = rng + 1;
  for (const e of G.units) {
    if (!e.alive || !isEnemy(u.owner, e.owner)) continue;
    if (!visible(e, u.owner)) continue;
    const r = u.distTo(e);
    if (r.d < bd) { bd = r.d; best = e; }
  }
  for (const b of G.buildings) {
    if (!b.alive || !isEnemy(u.owner, b.owner)) continue;
    if (!visible(b, u.owner)) continue;
    const r = u.distTo(b);
    if (r.d < bd - 1) { bd = r.d; best = b; }
  }
  return best;
}
function freeRelic(u) {
  let best = null, bd = 22;
  for (const r of G.relics) {
    if (r.got || r.carried) continue;
    const d = Math.hypot(u.x - r.x, u.y - r.y);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

class Animal extends Ent {
  constructor(tid, x, y) { super(-1); this.tid = tid; this.x = x; this.y = y; this.food = tid === "deer" ? 178 : 120; this.mode = "graze"; this.scareT = 0; this.wt = Math.random() * 4; this.hx = x; this.hy = y; }
  clsList() { return ["animal"]; }
  radius() { return .3; }
  update(dt) {
    if (this.scareT > 0) { this.scareT -= dt; this.mode = "flee"; }
    if (this.mode === "flee") {
      const near = G.units.find(u => u.alive && Math.abs(u.x - this.x) + Math.abs(u.y - this.y) < 3 && u.mode === "gather" && u.task && u.task.src === this);
      if (near) { const d = Math.hypot(this.x - near.x, this.y - near.y) || .1; this.x += (this.x - near.x) / d * dt * 1.6; this.y += (this.y - near.y) / d * dt * 1.6; }
      if (this.scareT <= 0 && !near) this.mode = "graze";
      this.x = clamp(this.x, 1, G.MW - 2); this.y = clamp(this.y, 1, G.MH - 2);
    } else {
      this.wt -= dt;
      if (this.wt <= 0) { this.wt = 2 + Math.random() * 4; this.wdx = (Math.random() - .5); this.wdy = (Math.random() - .5); }
      if (this.wt > 1.2 && dist2(this.x, this.y, this.hx, this.hy) < 16) {
        this.x += this.wdx * dt * .25; this.y += this.wdy * dt * .25;
      }
    }
  }
}

class Building extends Ent {
  constructor(pl, typeId, tx, ty, done) {
    super(pl);
    this.typeId = typeId; this.spec = D.BUILDS[typeId];
    const p = G.players[pl];
    const hm = buildingHpMod(p);
    this.maxHp = Math.round(this.spec.hp * hm.hp);
    this.hp = done ? this.maxHp : 1;
    this.tx = tx; this.ty = ty;
    this.done = !!done; this.progress = done ? 1 : 0;
    this.builders = [];
    this.queue = []; this.qt = 0;
    this.rally = null; this.towerT = 0; this.rageT = 0;
    this.food = this.spec.farm ? D.BUILDS.farm.farm.food : undefined;
    this.reseedT = 0;
    this.armor = (this.spec.ar || 0) + buildingHpMod(p).ar;
    if (done) this.claimTiles(true);
  }
  tiles() { const out = []; for (let dx = 0; dx < this.spec.fp[0]; dx++) for (let dy = 0; dy < this.spec.fp[1]; dy++) out.push([this.tx + dx, this.ty + dy]); return out; }
  claimTiles(on) { for (const [x, y] of this.tiles()) G.occ[`${x},${y}`] = on ? this : undefined; if (on) G.dirtyOcc++; }
  clsList() { const c = ["building"]; if (this.typeId === "tower" || this.typeId === "castle") c.push("tower"); if (this.typeId === "tc") c.push("tc"); return c; }
  radius() { return Math.max(this.spec.fp[0], this.spec.fp[1]) / 2 + .1; }
  addBuild(b, dt) {
    const r = this.spec.build * (1 - Math.min(.85, (b ? 0 : 0)));
    const inc = dt / r;
    this.progress = Math.min(1, this.progress + inc);
    if (Math.random() < dt * 1.4) AudioSys.sfx("build");
    if (this.progress >= 1) {
      this.done = true; this.hp = this.maxHp;
      this.claimTiles(true);
      AudioSys.sfx("done");
      toast(this.spec.name + " 建造完成");
      if (this.typeId === "wonder") { const p = G.players[this.owner]; if (G.cfg.wonderWin) { p.wonderT = 160; p.wonderBuilt = true; toast("奇觀已完成！" + (p.isHuman ? "勝利倒數 160 秒開始！" : "敵方奇觀完成！")); } else toast("奇觀已完成（此局未開啟奇觀勝負）"); if (this === G.wonderB) G.wonderB.built = true; }
      for (const v of this.builders) { if (v.mode === "build") { v.setMode("idle"); } }
      this.builders = [];
    }
  }
  edgeFreeTile() {
    const w = this.spec.fp[0], d = this.spec.fp[1];
    const cands = [];
    for (let dx = -1; dx <= w; dx++) { cands.push([this.tx + dx, this.ty - 1]); cands.push([this.tx + dx, this.ty + d]); }
    for (let dy = 0; dy < d; dy++) { cands.push([this.tx - 1, this.ty + dy]); cands.push([this.tx + w, this.ty + dy]); }
    for (const [cx, cy] of cands) if (G.walkable(cx, cy, -1)) return [cx + .5, cy + .5];
    return null;
  }
  update(dt) {
    if (!this.alive) return;
    if (!this.done) { this.hp = Math.max(1, 1 + this.progress * (this.maxHp - 1)); return; }
    if (this.typeId === "farm") {
      if (this.food <= 0) {
        let busy = false;
        for (const u of G.units) if (u.alive && u.owner === this.owner && (u.mode === "gather" || u.mode === "return") && u.task && u.task.src === this) { busy = true; break; }
        if (!busy) {
          this.reseedT += dt;
          if (this.reseedT > 20) { this.food = D.BUILDS.farm.farm.food * (1 + ecoBonus(G.players[this.owner], "farmMul")); this.reseedT = 0; }
        }
      } else this.reseedT = 0;
    }
    for (let i = this.builders.length - 1; i >= 0; i--) { const v = this.builders[i]; if (!v.alive || v.task?.b !== this) this.builders.splice(i, 1); }
    if (this.spec.produce && this.queue.length) {
      this.qt -= dt;
      if (this.qt <= 0) {
        const tid = this.queue.shift();
        const p = G.players[this.owner];
        const spec2 = D.UNITS[tid];
        const st = calcStats(tid, p);
        let [sx, sy] = this.rally && G.walkable(this.rally[0] | 0, this.rally[1] | 0, -1) ? this.rally : (this.edgeFreeTile() || [this.tx + this.spec.fp[0] / 2, this.ty + this.spec.fp[1] + 1]);
        const u = new Unit(this.owner, tid, sx, sy);
        G.units.push(u);
        p.popUsed += u.pop();
        if (this.queue.length) this.qt = D.UNITS[this.queue[0]].train;
        AudioSys.sfx("train");
      }
    }
    if (this.spec.tower && this.alive && this.done) {
      this.towerT -= dt;
      if (this.towerT <= 0) {
        const tw = this.spec.tower;
        let best = null, bd = tw.rng + 1;
        const cx = this.tx + (this.spec.fp[0] - 1) / 2, cy = this.ty + (this.spec.fp[1] - 1) / 2;
        for (const e of G.units) {
          if (!e.alive || !isEnemy(this.owner, e.owner) || !visible(e, this.owner)) continue;
          const d = Math.hypot(e.x - cx, e.y - cy);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) {
          this.towerT = tw.cd;
          const shots = tw.shots || 1;
          for (let s = 0; s < shots; s++) {
            G.projs.push({ x: cx, y: cy - 2, tgt: best, spd: 10, dmg: tw.atk + (this.towatk || 0), owner: this.owner, spr: SPR.proj(tw.proj), splash: 0, pierce: 0, kind: "arrow", atkBy: this });
          }
          AudioSys.sfx("shoot");
        } else this.towerT = .5;
      }
    }
  }
  train(tid) {
    const spec = D.UNITS[tid], p = G.players[this.owner];
    const okList = (this.spec.produce || []).includes(tid) || spec.bld === this.typeId;
    if (!okList) return err("此建築不能訓練該單位");
    if (spec.civ && !(D.CIVS[p.civ].units || []).includes(tid)) return err("非本文明兵種");
    if (spec.age > p.era) return err("需要先進時代");
    if (p.popUsed + (spec.pop || 1) > D.POP_CAP) return err("達到人口上限");
    if (!pay(p, spec.cost)) return err("資源不足");
    this.queue.push(tid);
    if (this.queue.length === 1) this.qt = spec.train;
    AudioSys.sfx("click");
  }
}

function pay(p, cost) {
  for (const k in cost) if ((p.res[k] || 0) < cost[k]) return false;
  for (const k in cost) p.res[k] -= cost[k];
  return true;
}
function refund(p, cost) { for (const k in cost) p.res[k] = (p.res[k] || 0) + cost[k]; }

function dealDamage(tgt, base, bonus, owner, pierce) {
  if (!tgt.alive) return;
  if (tgt.owner === owner && !isEnemy(owner, tgt.owner)) return;
  let ar = tgt.st ? tgt.st.ar : (tgt.armor || 0);
  const sar = tgt.st ? (tgt.st.sar || 0) : 0;
  const redBase = base * 100 / (100 + Math.max(0, ar));
  const redBonus = Math.max(0, bonus - sar * (1 - (pierce || 0)));
  const final = Math.max(1, Math.round(redBase + redBonus));
  tgt.hp -= final;
  if (Math.random() < .4) AudioSys.sfx("hit");
  if (tgt.owner >= 0 && isEnemy(owner, tgt.owner)) {
    G.players[tgt.owner].hitT = 3;
    const hx = tgt.x !== undefined ? tgt.x : tgt.tx, hy = tgt.y !== undefined ? tgt.y : tgt.ty;
    if (Math.random() < .5) for (const u of G.units) {
      if (u.owner === tgt.owner && u.alive && u.st.atk > 0 && u.mode === "idle" && G.players[u.owner].isAI && Math.hypot(u.x - hx, u.y - hy) < 9) {
        const at = G.units.find(a => a.alive && a.owner === owner && Math.hypot(a.x - hx, a.y - hy) < 10) || null;
        atk(u, at, false);
      }
    }
  }
  if (tgt.hp <= 0) killEntity(tgt);
}
function killEntity(e) {
  e.alive = false; e.fade = 1;
  if (e.typeId) {
    e.claimTiles(false);
    AudioSys.sfx("hit");
    const p = G.players[e.owner];
    if (e.typeId === "wonder") { if (p) { p.wonderT = -1; p.wonderBuilt = false; } toast((D.CIVS[G.players[e.owner].civ] || { name: "" }).name + " 的奇觀被摧毀了！"); }
    e.queue && e.queue.length && toast("生產中的建築被摧毀", true);
  } else if (e.spec) {
    G.players[e.owner].popUsed -= e.pop();
    AudioSys.sfx("death");
  }
  checkWin();
}
function removeRes(r) {
  if (r.tid) { const i = G.animals.indexOf(r); if (i >= 0) G.animals.splice(i, 1); return; }
  G.res.delete(r);
  if (r.tx !== undefined) { G.resGrid.delete(tkey(r.tx, r.ty)); G.mapDirty = true; }
}

const atk = (u, t, queued) => { if (!u) return; u.target = t; u.setMode("fight"); u.path = null; };
const Cmd = {
  move(units, tx, ty) {
    const n = units.length, side = Math.ceil(Math.sqrt(n));
    units.forEach((u, i) => {
      const ox = (i % side) - side / 2, oy = ((i / side) | 0) - side / 2;
      u.dest = [tx + ox * .6, ty + oy * .6]; u.amDest = null; u.target = null; u.task = null;
      u.setMode("move"); u.pathTo(tx + ox * .6, ty + oy * .6);
    });
    if (units.length) AudioSys.sfx("order");
  },
  amove(units, tx, ty) {
    units.forEach((u, i) => { u.dest = [tx, ty]; u.amDest = null; u.setMode("amove"); u.pathTo(tx, ty); });
    if (units.length) AudioSys.sfx("order");
  },
  attack(units, tgt) { units.forEach(u => { if (u.st.atk > 0 || u.spec.spr === "monk") { if (u.spec.spr === "monk") { u.target = tgt; u.setMode("heal"); } else atk(u, tgt); } }); AudioSys.sfx("order"); },
  stop(units) { units.forEach(u => { u.target = null; u.task = null; u.setMode("idle"); }); },
  gather(vills, src, sx, sy, res) {
    if (src.claims) src.claims = src.claims || {};
    vills.forEach(v => {
      v.task = { src, sx: sx !== undefined ? sx : (src.x !== undefined ? src.x : sx), sy: sy !== undefined ? sy : (src.y !== undefined ? src.y : sy), res };
      v.carry = 0; v.setMode("gather");
      if (src.claims) src.claims[v.owner] = (src.claims[v.owner] || 0) + 1;
    });
    AudioSys.sfx("order");
  },
  build(pl, typeId, tx, ty, builders) {
    const p = G.players[pl];
    const spec = D.BUILDS[typeId];
    if (spec.age > p.era) { err("需要 " + D.ERAS[spec.age].name); return null; }
    if (!checkReq(pl, typeId)) return null;
    if (!canPlace(typeId, tx, ty, pl)) { err("無法建造在此處"); return null; }
    if (!pay(p, spec.cost)) { err("資源不足"); return null; }
    const b = new Building(pl, typeId, tx, ty, false);
    G.buildings.push(b);
    const bs = builders && builders.length ? builders : autoVills(pl, 1, tx, ty);
    bs.slice(0, 4).forEach(v => { if (v.mode !== "build") { v.task = { b }; v.setMode("build"); if (!b.builders.includes(v)) b.builders.push(v); } });
    AudioSys.sfx("build");
    return b;
  },
  repair(builders, b) { builders.forEach(v => { v.task = { b }; v.setMode("repair"); }); }
};
function autoVills(pl, n, tx, ty) {
  const vs = G.units.filter(u => u.owner === pl && u.alive && u.spec.spr === "vill" && (u.mode === "idle" || u.mode === "move")).sort((a, b) => dist2(a.x, a.y, tx, ty) - dist2(b.x, b.y, tx, ty));
  return vs.slice(0, n);
}
function checkReq(pl, typeId) {
  const p = G.players[pl], reqs = {
    farm: ["mill"], lumber: [], mine: [], mill: [], barracks: [], archery: ["tc"], stable: ["tc"], siege: ["barracks", "stable"], armory: [], market: ["tc"], monastery: ["tc"], university: ["castle", "market"], tower: [], castle: ["tc"], wall: [], gate: [], dock: ["tc"]
  };
  for (const r of reqs[typeId] || []) {
    if (!G.buildings.some(b => b.alive && b.done && b.owner === pl && b.typeId === r)) { err("需要先建造 " + D.BUILDS[r].name); return false; }
  }
  return true;
}
function canPlace(typeId, tx, ty, pl) {
  const spec = D.BUILDS[typeId];
  const water = typeId === "dock";
  for (let dx = 0; dx < spec.fp[0]; dx++) for (let dy = 0; dy < spec.fp[1]; dy++) {
    const x = tx + dx, y = ty + dy;
    if (x < 0 || y < 0 || x >= G.MW || y >= G.MH) return false;
    if (G.occ[x + "," + y]) return false;
    const t = G.terr[y * G.MW + x];
    if (water) { if (t !== 2) return false; }
    else {
      if (t === 2) return false;
      if (G.resGrid.has(tkey(x, y)) && G.resGrid.get(tkey(x, y)).t === "tree") return false;
    }
  }
  return true;
}
function placeGhostValid(typeId, tx, ty, pl) { return canPlace(typeId, tx, ty, pl); }

function ageUp(pl, era) {
  const p = G.players[pl];
  if (p.eraNext > p.era) { err("正在升級時代"); return; }
  if (era <= p.era) { err("已是該時代"); return; }
  const cost = D.ERAS[era].cost;
  if (!pay(p, cost)) { err("升級資源不足：" + fmtRes(cost)); return; }
  p.eraNext = era; p.eraT = D.ERAS[era].time;
  AudioSys.sfx("age");
}
function researchTech(pl, tid) {
  const p = G.players[pl], t = D.TECHS[tid];
  if (!t || p.techs.has(tid)) return;
  if (t.civ && t.civ !== p.civ) { err("文明專屬科技"); return; }
  if (t.age > p.era) { err("需要 " + D.ERAS[t.age].name); return; }
  if (!G.buildings.some(b => b.alive && b.done && b.owner === pl && b.typeId === t.bld)) { err("需要 " + D.BUILDS[t.bld].name); return; }
  if (!pay(p, t.cost)) { err("資源不足"); return; }
  p.research.push({ tid, t: t.t });
}
function err(msg) { AudioSys.sfx("error"); toast(msg, true); return null; }
