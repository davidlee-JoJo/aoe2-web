"use strict";
function aiFindSpot(typeId, cx, cy, rng, minR, maxR) {
  const spec = D.BUILDS[typeId];
  for (let r = minR || 1; r <= (maxR || 14); r++) {
    const tries = Math.min(30, r * 5);
    for (let t = 0; t < tries; t++) {
      const a = (t / tries) * Math.PI * 2 + rng();
      const x = Math.round(cx + Math.cos(a) * r * 1.5), y = Math.round(cy + Math.sin(a) * r * 1.1);
      if (canPlace(typeId, x, y, -2) && spotClear(typeId, x, y)) return [x, y];
    }
  }
  for (let y = 2; y < G.MH - 4; y += 2) for (let x = 2; x < G.MW - 4; x += 2)
    if (canPlace(typeId, x, y, -2) && spotClear(typeId, x, y) && dist2(x, y, cx, cy) < 400) return [x, y];
  return null;
}
function spotClear(typeId, x, y) {
  const spec = D.BUILDS[typeId];
  const wantAdj = ["lumber", "mine"];
  if (wantAdj.includes(typeId)) {
    let adj = false;
    for (let dx = -2; dx <= spec.fp[0] + 1 && !adj; dx++) for (let dy = -2; dy <= spec.fp[1] + 1; dy++) {
      const r = tileRes(x + dx, y + dy);
      if (typeId === "lumber" && r && r.t === "tree") adj = true;
      if (typeId === "mine" && r && (r.t === "gold" || r.t === "stone")) adj = true;
    }
    if (!adj) return false;
  }
  if (typeId === "mill") {
    for (let dx = -1; dx <= spec.fp[0]; dx++) for (let dy = -1; dy <= spec.fp[1]; dy++) { const r = tileRes(x + dx, y + dy); if (r && (r.t === "gold" || r.t === "stone")) return false; }
  }
  if (typeId === "farm") {
    for (let dx = -1; dx <= spec.fp[0]; dx++) for (let dy = -1; dy <= spec.fp[1]; dy++) { const r = tileRes(x + dx, y + dy); if (r && (r.t !== "tree")) return false; }
  }
  if (typeId === "dock") {
    for (let dy = 0; dy < spec.fp[1]; dy++) { let w = 0; for (let dx = 0; dx < spec.fp[0]; dx++) if (G.terr[(y + dy) * G.MW + (x + dx)] === 2) w++; if (w < spec.fp[0]) return false; }
  }
  return true;
}
function aiBuild(pl, typeId, cx, cy, nBuilders) {
  const spot = aiFindSpot(typeId, cx, cy, G.players[pl].ai_rng || G.rng, typeId === "farm" ? 3 : 2, typeId === "farm" ? 7 : 16);
  if (!spot) return false;
  const b = Cmd.build(pl, typeId, spot[0], spot[1], autoVills(pl, nBuilders || 2, spot[0], spot[1]));
  return !!b;
}
function updateAI(idx, dt) {
  const p = G.players[idx];
  if (!p.alive) return;
  const st = p.ai;
  if (st.last === undefined) st.last = 0;
  const diff = G.cfg.diff || 1;
  const tc = G.buildings.find(b => b.alive && b.owner === idx && b.typeId === "tc");
  if (!tc) return;
  if (!st.rng) st.rng = makeRng(917 + idx * 31);
  const cx = tc.tx, cy = tc.ty;
  const vills = G.units.filter(u => u.owner === idx && u.alive && u.spec.spr === "vill");
  const idleVills = vills.filter(u => u.mode === "idle");
  const houses = G.buildings.filter(b => b.alive && b.owner === idx && b.typeId === "house").length;
  const targetPop = 4 + [13, 20, 28][diff] + p.era * 4;
  const mult = [0.7, 1, 1.25][diff];

  const have = t => G.buildings.some(b => b.alive && b.owner === idx && b.typeId === t);
  const count = t => G.buildings.filter(b => b.alive && b.owner === idx && b.typeId === t).length;
  const done = t => G.buildings.some(b => b.alive && b.done && b.owner === idx && b.typeId === t);

  if (count("house") * 5 + 10 + count("castle") * 10 < p.popUsed + 10 && count("house") < 22) {
    if (!G.buildings.some(b => b.alive && b.owner === idx && b.typeId === "house" && !b.done)) aiBuild(idx, "house", cx, cy, 1);
  }
  const needF = p.eraNext > p.era ? 0 : (p.era < 3 ? (D.ERAS[p.era + 1].cost.food || 0) : 0);
  while (tc.queue.length < 2 && vills.length + tc.queue.length < targetPop && p.res.food >= 60 + needF * 0.9 && aiPopHeadroom(idx) > tc.queue.length) {
    tc.train("vill");
  }
  if (vills.length >= targetPop && tc.queue.length && tc.queue[0] === "vill") tc.queue.shift();

  st.econT = (st.econT || 0) - dt;
  if (st.econT <= 0) {
    st.econT = 2.2;
    if (!done("lumber") && p.res.wood < 300 && vills.length > 4) aiBuild(idx, "lumber", cx, cy, 2);
    if (!have("mill")) aiBuild(idx, "mill", cx, cy, 1);
    const farms = count("farm");
    const farmsActive = G.buildings.filter(b => b.alive && b.owner === idx && b.typeId === "farm" && b.food > 0).length;
    if ((p.res.food < 450 || farmsActive < 5) && farms < 12) {
      if (done("mill")) aiBuild(idx, "farm", cx, cy, 1);
    }
    if (!have("mine")) {
      const ng = nearestRes(cx, cy, ["gold", "stone"]);
      if (ng && dist2(cx, cy, ng.tx, ng.ty) < 400) aiBuild(idx, "mine", ng.tx, ng.ty, 2);
    }
    const needMil = {
      barracks: p.era >= 1, archery: p.era >= 1, stable: p.era >= 1,
      siege: p.era >= 2 && G.time > 300, market: p.era >= 1 && !count("market"), monastery: p.era >= 2 && !count("monastery") && G.time > 420 && G.cfg.relicWin,
      university: p.era >= 2 && !count("university"), armory: p.era >= 1 && !count("armory"),
      castle: p.era >= 2 && G.time > 500 && count("castle") < 1
    };
    for (const t in needMil) {
      if (needMil[t] && !have(t)) {
        const plan = st.plan;
        if (!plan || plan.length === 0 || plan[0] !== t) {
          if (G.time > 60 && p.res.food > 150 && aiBuild(idx, t, cx, cy, 2)) { st.plan = st.plan || []; break; }
        } else break;
      }
    }
    if (!st.houseT1 && G.buildings.filter(b => b.owner === idx && b.typeId === "house" && !b.done).length >= 2) { }
  }

  st.taskT = (st.taskT || 0) - dt;
  if (st.taskT <= 0) {
    st.taskT = 1.5;
    for (const v of idleVills.slice(0, 6)) {
      const job = aiVillJob(idx, v, cx, cy);
      if (job) {
        if (job.type === "bldc") { v.setMode("idle"); }
        else assignAIJob(v, job);
      }
    }
  }

  if (p.eraNext <= p.era) {
    const next = p.era + 1;
    if (next <= 3) {
      const mult2 = [0.7,1,1.3][diff]; const ready = (next === 1 && vills.length >= 6 && p.res.food > 430) || (next === 2 && vills.length >= 10 && p.res.food > 720 && p.res.gold > 240) || (next === 3 && vills.length >= 14 && p.res.food > 950 && p.res.gold > 780);
      const needWood = next <= 1 ? 0 : (next === 2 ? 150 : 250); if (ready && (p.res.wood > needWood)) ageUp(idx, next);
    }
  }

  st.techT = (st.techT || 0) - dt;
  if (st.techT <= 0) {
    st.techT = 6;
    for (const tid in D.TECHS) {
      const t = D.TECHS[tid];
      if (p.techs.has(tid) || p.research.some(r => r.tid === tid)) continue;
      if (t.civ && t.civ !== p.civ) continue;
      if (t.age > p.era) continue;
      const cost = t.cost, big = Object.values(cost).reduce((a, b) => a + b, 0);
      if (G.time < 120 && big > 350) continue;
      let ok = true;
      for (const k in cost) if ((p.res[k] || 0) < cost[k] * (diff === 0 ? 1.4 : 1)) ok = false;
      if (ok && G.buildings.some(b => b.alive && b.done && b.owner === idx && b.typeId === t.bld)) researchTech(idx, tid);
    }
  }

  st.milT = (st.milT || 0) - dt;
  if (st.milT <= 0 && G.time > 150 - diff * 30) {
    st.milT = Math.max(4, 9 - diff * 2);
    const army = G.units.filter(u => u.owner === idx && u.alive && u.st.atk > 0 && u.spec.spr !== "vill");
    const cap = Math.floor([12, 22, 34][diff] + G.time / (40 - diff * 10));
    if (army.length + countQueue(idx) < cap) {
      const comps = [];
      const bl = G.buildings.filter(b => b.alive && b.done && b.owner === idx && b.spec.produce);
      for (const b of bl) {
        for (const tid in D.UNITS) {
          const u = D.UNITS[tid];
          if (u.bld !== b.typeId || u.age > p.era) continue;
          if (u.civ && !(D.CIVS[p.civ].units || []).includes(tid)) continue;
          comps.push({ b, tid });
        }
      }
      if (comps.length) {
        const w = st.plan2 || (st.plan2 = ["sword", "archer", "cavalry", "spear"]);
        let pickC = comps[Math.floor(st.rng() * comps.length)];
        if (st.rng() < .5) {
          const pref = comps.filter(c => (D.UNITS[c.tid].cls || []).some(cl => w.includes(cl)) || c.tid === "cavalry");
          if (pref.length) pickC = pref[Math.floor(st.rng() * pref.length)];
        }
        if (pickC && pickC.b.queue.length < 4) pickC.b.train(pickC.tid);
      }
    }
  }

  st.raidT = (st.raidT || 80) - dt;
  if (st.raidT <= 0 && G.time > 240 - diff * 60) {
    st.raidT = Math.max(55, 130 - diff * 35);
    const army = G.units.filter(u => u.owner === idx && u.alive && u.st.atk > 0 && u.spec.spr !== "vill" && u.mode === "idle");
    if (army.length >= [6, 9, 12][diff]) {
      const foes = G.buildings.filter(b => b.alive && b.done && isEnemy(idx, b.owner));
      let tgt = foes.length ? foes[Math.floor(st.rng() * foes.length)] : null;
      if (tgt) {
        army.forEach(u => atk(u, tgt));
        const tcE = foes.find(b => b.typeId === "tc");
        if (tcE && diff === 2) army.slice(army.length >> 1).forEach(u => atk(u, tcE));
      }
    }
  }
  if (p.relics < G.relicTotal && G.cfg.relicWin && p.era >= 2) {
    const monks = G.units.filter(u => u.owner === idx && u.alive && u.spec.spr === "monk" && u.mode === "idle");
    for (const m of monks) { const rl = freeRelic(m); if (rl) { m.task = { relic: rl }; m.setMode("relic"); } }
  }
}
function aiPopHeadroom(idx) { const p2 = G.players[idx]; let v = 0; for (const b of G.buildings) if (b.owner === idx && b.done && b.spec.pop) v += b.spec.pop; return Math.min(D.POP_CAP, Math.max(10, v)) - p2.popUsed; }
function countQueue(idx) {
  let n = 0;
  for (const b of G.buildings) if (b.owner === idx && b.queue) n += b.queue.length;
  return n;
}
function nearestRes(cx, cy, kinds) {
  let best = null, bd = 1e9;
  for (const [, r] of G.resGrid) {
    if (!kinds.includes(r.t)) continue;
    if (r.claims && (r.claims.total || 0) > 6) continue;
    const d = dist2(cx, cy, r.tx, r.ty);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}
function nearestGRes(cx, cy, kinds) { let best = null, bd = 1e9; for (const [, r] of G.resGrid) { if (!kinds.includes(r.t) || r.amt <= 0) continue; const d = dist2(cx, cy, r.tx, r.ty); if (d < bd) { bd = d; best = r; } } return best; }
function aiVillJob(idx, v, cx, cy) {
  const all = G.units.filter(u => u.owner === idx && u.alive && u.spec.spr === "vill" && (u.mode === "gather" || u.mode === "return"));
  let wF = 0, wW = 0, wG = 0, wS = 0, wB = 0;
  for (const u of all) {
    if (!u.task) continue;
    if (u.mode === "build") { wB++; continue; }
    const r = u.task.res;
    if (r === "food") wF++; else if (r === "wood") wW++; else if (r === "gold") wG++; else if (r === "stone") wS++;
  }
  const tot = 0.75;
  if (v.id % 2 === 0) { const tcs = G.buildings.filter(b => b.alive && b.owner === idx && !b.done && b.builders.filter(x => x.alive).length < 3); if (tcs.length) return { type: "bld", b: tcs[v.id % tcs.length] }; }
  const p = G.players[idx];
  const lumber = G.buildings.some(b => b.alive && b.done && b.owner === idx && b.typeId === "lumber");
  const doneMine = G.buildings.some(b => b.alive && b.done && b.owner === idx && b.typeId === "mine");
  const farmFood = G.buildings.filter(b => b.alive && b.owner === idx && b.typeId === "farm" && b.food > 0);
  const want = { food: Math.ceil((all.length + 1) * 0.40), wood: Math.ceil((all.length + 1) * (lumber ? 0.32 : 0.18)), gold: doneMine ? Math.ceil((all.length + 1) * 0.18) : 0, stone: doneMine ? Math.ceil((all.length + 1) * 0.12) : 0 };
  const pick = () => {
    if (wF < want.food) return "food";
    if (wW < want.wood) return "wood";
    if (wG < want.gold) return "gold";
    if (wS < want.stone) return "stone";
    if (wF < want.food + 2) return "food";
    return "wood";
  };
  const role = pick();
  if (role === "wood") { const t = nearestRes(cx, cy, ["tree"]); if (t && (t.claims && t.claims._n || 0) < 7) return { type: "gather", src: t, res: "wood", tx: t.tx, ty: t.ty }; }
  if (role === "gold") { const t = nearestRes(cx, cy, ["gold"]); if (t && (t.claims && t.claims._n || 0) < 5) return { type: "gather", src: t, res: "gold", tx: t.tx, ty: t.ty }; }
  if (role === "stone") { const t = nearestRes(cx, cy, ["stone"]); if (t && (t.claims && t.claims._n || 0) < 4) return { type: "gather", src: t, res: "stone", tx: t.tx, ty: t.ty }; }
  if (farmFood.length) { const f = farmFood[v.id % farmFood.length]; return { type: "gather", src: f, res: "food" }; }
  const gb = nearestGRes(cx, cy, ["berry"]); if (gb && (gb.claims && gb.claims._n || 0) < 4) return { type: "gather", src: gb, res: "food", tx: gb.tx, ty: gb.ty };
  if (role === "wood") { const t = nearestRes(cx, cy, ["tree"]); if (t) return { type: "gather", src: t, res: "wood", tx: t.tx, ty: t.ty }; }
  const herd = G.animals.find(a => (a.tid === "sheep" || a.tid === "deer") && a.food > 15 && !claimed(a, idx)); if (herd) return { type: "gather", src: herd, res: "food" };
  const t = nearestRes(cx, cy, ["tree"]); if (t) return { type: "gather", src: t, res: "wood", tx: t.tx, ty: t.ty };
  return null;
}
function assignAIJob(v, job) {
  if (job.type === "gather") {
    Cmd.gather([v], job.src, job.tx !== undefined ? job.tx + .5 : job.src.x, job.ty !== undefined ? job.ty + .5 : job.src.y, job.res);
    if (job.src.claims) { job.src.claims._n = (job.src.claims._n || 0) + 1; }
  } else if (job.type === "bld") {
    if (job.b.builders.length < 3) { v.task = { b: job.b }; v.setMode("build"); if (!job.b.builders.includes(v)) job.b.builders.push(v); }
  } else if (job.type === "moveHome") {
    Cmd.move([v], job.b ? job.b.x : v.x, v.y);
  }
}

function treeClaims(r) { return (r.claims && r.claims._n) || 0; }
function oreClaims(r) { return (r.claims && r.claims._n) || 0; }
function claimed(src, idx) { return src.claims && src.claims[idx]; }
function done2(idx, t) { return G.buildings.some(b => b.alive && b.done && b.owner === idx && b.typeId === t); }
