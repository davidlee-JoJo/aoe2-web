"use strict";
let rafId = 0, lastTs = 0, running = false;
const Main = {
  boot() {
    GAME.boot();
    UI.init();
    this.paintDemo();
    const civSel = document.getElementById("selCiv");
    for (const cid in D.CIVS) {
      const o = document.createElement("option");
      o.value = cid; o.textContent = D.CIVS[cid].name + "（" + D.CIVS[cid].desc + "）";
      if (cid === "britons") o.selected = true;
      civSel.appendChild(o);
    }
    document.getElementById("btnLobby").onclick = () => { AudioSys.init(); AudioSys.sfx("click"); document.getElementById("screenStart").classList.add("hidden"); document.getElementById("screenLobby").classList.remove("hidden"); };
    document.getElementById("btnBack").onclick = () => { document.getElementById("screenLobby").classList.add("hidden"); document.getElementById("screenStart").classList.remove("hidden"); };
    document.getElementById("btnStart").onclick = () => this.startFromLobby();
    document.getElementById("btnFs").onclick = () => this.toggleFs();
    document.getElementById("chkSound").onchange = e => AudioSys.setOn(e.target.checked);
    document.getElementById("btnResume").onclick = () => this.loadAndStart();
    document.getElementById("btnResumeGame").onclick = () => this.toggleMenu();
    document.getElementById("btnSaveGame").onclick = () => this.saveGame();
    document.getElementById("btnResign").onclick = () => { G.paused = false; document.getElementById("screenMenu").classList.add("hidden"); endGame(false); };
    document.getElementById("btnQuit").onclick = () => this.quitToMenu();
    document.getElementById("btnEndQuit").onclick = () => this.quitToMenu();
    if (localStorage.getItem("aoe2web_autosave") || localStorage.getItem("aoe2web_save"))
      document.getElementById("btnResume").classList.remove("hidden");
    document.getElementById("chkRelic").checked = true;
    document.getElementById("chkWonder").checked = true;
  },
  toggleFs() {
    const de = document.documentElement;
    if (!document.fullscreenElement) { de.requestFullscreen && de.requestFullscreen(); }
    else document.exitFullscreen && document.exitFullscreen();
  },
  startFromLobby() {
    const size = +document.getElementById("selMapSize").value;
    const nOpp = +document.getElementById("selOpp").value;
    const teamMode = document.getElementById("selTeam").value;
    const diff = +document.getElementById("selDiff").value;
    const civIds = Object.keys(D.CIVS);
    const myCiv = document.getElementById("selCiv").value;
    const picks = [myCiv];
    const rest = shuffle(civIds.filter(c => c !== myCiv), Math.random);
    for (let i = 0; i < nOpp; i++) picks.push(rest[i % rest.length]);
    const slots = picks.map((c, i) => ({ civ: c, human: i === 0, team: teamMode === "ffa" ? i : (i === 0 ? 0 : (i % 2 !== 0 ? 0 : 1)) }));
    const cfg = { mapSize: size, slots, diff, relicWin: document.getElementById("chkRelic").checked, wonderWin: document.getElementById("chkWonder").checked, seed: Math.random() * 1e9 | 0 };
    document.getElementById("screenLobby").classList.add("hidden");
    this.launch(cfg, null);
    const info = document.getElementById("lobbyPicks");
    info.innerHTML = "";
    slots.forEach((s, i) => {
      const t = document.createElement("span"); t.className = "pickTag";
      t.style.borderColor = D.PCOLORS[i % 8];
      t.textContent = (i === 0 ? "你 · " : "AI · ") + D.CIVS[s.civ].name + "（隊" + (s.team + 1) + "）";
      info.appendChild(t);
    });
  },
  launch(cfg, saveData) {
    try {
      document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
      ["topbar", "minimap", "cmdPanel"].forEach(id => document.getElementById(id).classList.remove("hidden"));
      if (saveData) { loadGame(saveData); }
      else newGame(cfg);
      running = true; lastTs = 0;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(t => this.frame(t));
      toast("歡迎來到帝王時代！已選取村民，右鍵點擊資源開始採集。");
    } catch (err) {
      alert("啟動失敗：" + err.message);
      console.error(err);
    }
  },
  frame(ts) {
    rafId = requestAnimationFrame(t => this.frame(t));
    if (!lastTs) lastTs = ts;
    let dt = Math.min(.06, (ts - lastTs) / 1000);
    lastTs = ts;
    if (!running || !G) return;
    try {
      updateGame(dt);
      renderGame();
      renderMinimap();
      UI.frame(dt);
    } catch (e) {
      console.error(e);
      running = false;
      toast("發生錯誤：" + e.message, true);
    }
  },
  toggleMenu() {
    if (!G) return;
    const m = document.getElementById("screenMenu");
    if (m.classList.contains("hidden")) { m.classList.remove("hidden"); G.paused = true; }
    else { m.classList.add("hidden"); G.paused = false; }
  },
  saveGame() {
    if (!G) return;
    try { localStorage.setItem("aoe2web_save", JSON.stringify(serializeGame())); toast("遊戲已儲存"); } catch (e) { toast("儲存失敗：" + e.message, true); }
  },
  loadAndStart() {
    const raw = localStorage.getItem("aoe2web_save") || localStorage.getItem("aoe2web_autosave");
    if (!raw) { toast("沒有找到存檔", true); return; }
    try {
      const data = JSON.parse(raw);
      document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
      this.launch(null, data);
    } catch (e) { alert("讀檔失敗：" + e.message); console.error(e); }
  },
  quitToMenu() {
    running = false;
    cancelAnimationFrame(rafId);
    G = null; window.G = null;
    ["topbar", "minimap", "cmdPanel", "buildMenu"].forEach(id => document.getElementById(id).classList.add("hidden"));
    document.getElementById("screenMenu").classList.add("hidden");
    document.getElementById("screenEnd").classList.add("hidden");
    document.getElementById("screenStart").classList.remove("hidden");
  },
  paintDemo() {
    const c = document.getElementById("demoCanvas"), g = c.getContext("2d");
    const rng = makeRng(777);
    let y = g.createLinearGradient(0, 0, 0, 600);
    y.addColorStop(0, "#1a2a4a"); y.addColorStop(.4, "#4a5a8a"); y.addColorStop(.55, "#7a8ab0"); y.addColorStop(.56, "#3f6b2a"); y.addColorStop(1, "#264d1a");
    g.fillStyle = y; g.fillRect(0, 0, 960, 600);
    g.fillStyle = "#e8d9a8"; g.beginPath(); g.arc(760, 120, 46, 0, 7); g.fill();
    for (let i = 0; i < 26; i++) { g.fillStyle = "rgba(255,255,255,.5)"; g.fillRect(rng() * 960, 60 + rng() * 120, 40 + rng() * 80, 6); }
    g.fillStyle = "rgba(20,60,110,.6)";
    g.beginPath(); g.moveTo(0, 340); g.bezierCurveTo(240, 320, 500, 360, 960, 330); g.lineTo(960, 420); g.bezierCurveTo(500, 440, 300, 400, 0, 430); g.fill();
    for (let i = 0; i < 40; i++) {
      const x = rng() * 960, yy = 430 + rng() * 160, s = 20 + rng() * 40;
      const t = SPR.ground("tree", (rng() * 4) | 0);
      g.drawImage(t, x, yy - t.height * .5, s * 1.2, s * 1.4);
    }
    for (let i = 0; i < 5; i++) {
      const b = SPR.building(["castle", "tc", "barracks", "tower"][i % 4], i, 1);
      g.drawImage(b, 80 + i * 190, 470 - b.height * .45, b.width * .9, b.height * .9);
    }
    for (let i = 0; i < 14; i++) {
      const u = SPR.unit(["inf", "cav", "inf", "vill"][i % 4], (i * 3) % 8, (i * 2 + 1) % 8, 0, ["sword", "bow", "spear", "none", "axe"][i % 5]);
      g.drawImage(u, 40 + (i * 67) % 880, 560 - (i % 3) * 36);
    }
  }
};
function serializeGame() {
  return {
    cfg: G.cfg, time: G.time,
    terr: Array.from(G.terr), seen: Array.from(G.seen),
    players: G.players.map(p => ({ civ: p.civ, isAI: p.isAI, team: p.team, color: p.color, res: p.res, era: p.era, eraNext: p.eraNext, eraT: p.eraT, techs: [...p.techs], research: p.research, popUsed: p.popUsed, alive: p.alive, resigned: p.resigned, relics: p.relics, wonderT: p.wonderT, wonderBuilt: !!p.wonderBuilt })),
    units: G.units.filter(u => u.alive).map(u => ({ o: u.owner, tid: u.tid, x: u.x, y: u.y })),
    buildings: G.buildings.filter(b => b.alive).map(b => ({ o: b.owner, tid: b.typeId, tx: b.tx, ty: b.ty, done: b.done, progress: b.progress, hp: b.hp, food: b.food, reseedT: b.reseedT, qt: b.qt, rally: b.rally })),
    animals: G.animals.map(a => ({ tid: a.tid, x: a.x, y: a.y, food: a.food })),
    res: [...G.resGrid.values()].map(r => ({ t: r.t, amt: r.amt, tx: r.tx, ty: r.ty })),
    relics: G.relics.map(r => ({ x: r.x, y: r.y, got: r.got }))
  };
}
function loadGame(data) {
  const cfg = data.cfg;
  G = {
    MW: cfg.mapSize, MH: cfg.mapSize, rng: makeRng(cfg.seed || 1),
    terr: Uint8Array.from(data.terr), seen: Uint8Array.from(data.seen), vis: new Uint16Array(cfg.mapSize * cfg.mapSize),
    occ: {}, res: new Set(), resGrid: new Map(), mapDirty: true,
    players: [], units: [], buildings: [], animals: [], projs: [], relics: [],
    time: data.time || 0, speed: 1, paused: false, running: true,
    camX: 0, camY: 0, camSPD: 14, keys: {},
    sel: new Set(), selBld: null, ctrl: {}, placing: null, visionT: 0, mmDirty: true, fogDirty: 0,
    cfg, relicTotal: 4, ended: false, wonderB: null, floaters: [], parts: []
  };
  window.G = G;
  G.findPath = (sx, sy, tx, ty, tol, fo, bl) => findPath(sx, sy, tx, ty, tol, fo === undefined ? -1 : fo, bl);
  G.walkable = (x, y, fo) => walkableAt(x, y, fo === undefined ? -1 : fo);
  G.humanTeam = cfg.slots[0].team;
  data.players.forEach((pd, i) => {
    G.players.push({ idx: i, civ: pd.civ, isAI: pd.isAI, isHuman: i === 0, team: pd.team, color: pd.color, res: pd.res, era: pd.era, eraNext: pd.eraNext, eraT: pd.eraT, techs: new Set(pd.techs), research: pd.research || [], popUsed: pd.popUsed, alive: pd.alive, resigned: pd.resigned || false, relics: pd.relics, wonderT: pd.wonderT, wonderBuilt: !!pd.wonderBuilt, hitT: 0, ai: {} });
  });
  for (const bd of data.buildings) {
    const b = new Building(bd.o, bd.tid, bd.tx, bd.ty, bd.done);
    b.progress = bd.progress; b.hp = bd.hp; b.food = bd.food; b.reseedT = bd.reseedT || 0; b.qt = bd.qt || 0; b.rally = bd.rally || null;
    G.buildings.push(b);
  }
  for (const ud of data.units) G.units.push(new Unit(ud.o, ud.tid, ud.x, ud.y));
  for (const ad of data.animals) { const a = new Animal(ad.tid, ad.x, ad.y); a.food = ad.food; G.animals.push(a); }
  for (const rd of data.res) G.resGrid.set(tkey(rd.tx, rd.ty), { t: rd.t, amt: rd.amt, tx: rd.tx, ty: rd.ty });
  for (const rl of data.relics) if (!rl.got) G.relics.push({ id: G.relics.length, x: rl.x, y: rl.y, got: false, carried: false });
  makeDecals(cfg.seed || 1);
  updateVision();
  const tc = G.buildings.find(b => b.owner === 0);
  if (tc) { G.camX = tc.tx + 1.5; G.camY = tc.ty + 1.5; }
}
window.addEventListener("load", () => Main.boot());
window.addEventListener("error", e => { if (G) toast("錯誤：" + e.message, true); });
