"use strict";
const UI = {
  dragging: false, dragS: null, dragE: null, amoveArmed: false, repairMode: false,
  ghostTile: null, lastPanel: "", hoverEnt: null, mouse: { x: 0, y: 0 }, downT: 0, lastClickT: 0, lastClickSel: null,
  hudT: 0, camEdge: { l: false, r: false, t: false, b: false }, hoverUI: false,

  init() {
    const cv = GAME.hudc;
    cv.addEventListener("contextmenu", e => e.preventDefault());
    cv.addEventListener("mousedown", e => this.onDown(e));
    window.addEventListener("mousemove", e => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      const t = e.target;
      this.hoverUI = !!(t && t.closest && t.closest("#topbar,#minimap,#cmdPanel,#buildMenu,#tooltip,#fpsTag,.screen"));
      if (this.dragging) this.dragE = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("mouseup", e => this.onUp(e));
    window.addEventListener("keydown", e => this.onKey(e));
    window.addEventListener("keyup", e => this.onKeyUp(e));
    document.getElementById("minimap").addEventListener("mousedown", e => { this.mmDrag(e); e.stopPropagation(); });
    document.getElementById("minimap").addEventListener("mousemove", e => { if (e.buttons) this.mmDrag(e); });
    this.buildMenuTab = "eco";
    this.wireHud();
  },
  mmDrag(e) {
    if (!G) return;
    const S = 240, r = GAME.mm.getBoundingClientRect();
    const px = clamp((e.clientX - r.left) / r.width, 0, 1) * S, py = clamp((e.clientY - r.top) / r.height, 0, 1) * S;
    const MW = G.MW, MH = G.MH, s = S / (MW + MH), uc = (MW - MH) / 2, vc = (MW + MH) / 2, R = (MW + MH) / 2;
    let u = (px - S / 2) / s + uc, v = py / s;
    const dd = Math.abs(u - uc) + Math.abs(v - vc);
    if (dd > R) { const f = R / dd; u = uc + (u - uc) * f; v = vc + (v - vc) * f; }
    G.camX = clamp((u + v) / 2, 0, MW); G.camY = clamp((v - u) / 2, 0, MH);
  },
  s2w(sx, sy) {
    const W = GAME.canvas.width, H = GAME.canvas.height;
    const px = sx - W / 2 + (G.camX - G.camY) * HW, py = sy - H / 2 + (G.camX + G.camY) * HH;
    return [(px / HW + py / HH) / 2, (py / HH - px / HW) / 2];
  },

  onDown(e) {
    if (!G || G.ended) return;
    if (e.target.closest && e.target.closest("#topbar,#minimap,#cmdPanel,#buildMenu,.screen")) return;
    AudioSys.init();
    if (e.button === 2) { this.onRight(e); return; }
    if (e.button !== 0) return;
    const [wx, wy] = this.s2w(e.clientX, e.clientY);
    if (G.placing) { this.tryPlace(wx, wy); return; }
    if (this.repairMode) {
      const b = this.pickBuilding(wx, wy, false);
      if (b && b.owner === 0) { Cmd.repair([...G.sel].filter(u => u.spec.spr === "vill"), b); }
      this.repairMode = false; return;
    }
    if (this.demolishMode) {
      const b = this.pickBuilding(wx, wy, false);
      if (b && b.owner === 0 && b !== (G.selBld)) {
        b.claimTiles(false); b.alive = false;
        refund(G.players[0], b.spec.cost);
        toast("已拆除 " + D.BUILDS[b.typeId].name);
        if (G.selBld === b) G.selBld = null;
      }
      this.demolishMode = false; return;
    }
    if (this.rmMode && G.selBld) {
      G.selBld.rally = [wx, wy]; this.rmMode = false;
      toast("已設定集結點"); return;
    }
    this.dragging = true; this.dragS = { x: e.clientX, y: e.clientY }; this.dragE = { x: e.clientX, y: e.clientY }; this.downT = performance.now();
  },
  onUp(e) {
    if (!this.dragging) return;
    this.dragging = false;
    const d = Math.hypot(e.clientX - this.dragS.x, e.clientY - this.dragS.y);
    const additive = e.shiftKey;
    if (d < 6) {
      const [wx, wy] = this.s2w(e.clientX, e.clientY);
      if (!additive) { if (!e.ctrlKey) G.sel.clear(); G.selBld = null; }
      const u = this.pickUnit(wx, wy);
      if (u) {
        const dbl = (performance.now() - this.lastClickT < 380) && this.lastClickSel && lastClickEnt && lastClickEnt.tid === u.tid;
        lastClickEnt = u;
        this.lastClickT = performance.now(); this.lastClickSel = u;
        if (dbl) G.units.filter(q => q.owner === 0 && q.alive && q.tid === u.tid && dist2(q.x, q.y, u.x, u.y) < 100).forEach(q => G.sel.add(q));
        else G.sel.add(u);
        AudioSys.sfx("select");
        G.selBld = null;
      } else {
        const b = this.pickBuilding(wx, wy, true);
        if (b) { G.selBld = b; G.sel.clear(); AudioSys.sfx("select"); }
      }
      this.refreshPanel();
    } else {
      const cA = this.s2w(Math.min(this.dragS.x, this.dragE.x), Math.min(this.dragS.y, this.dragE.y));
      const cB = this.s2w(Math.max(this.dragS.x, this.dragE.x), Math.min(this.dragS.y, this.dragE.y));
      const cC = this.s2w(Math.min(this.dragS.x, this.dragE.x), Math.max(this.dragS.y, this.dragE.y));
      const cD = this.s2w(Math.max(this.dragS.x, this.dragE.x), Math.max(this.dragS.y, this.dragE.y));
      const xs = [cA[0], cB[0], cC[0], cD[0]], ys = [cA[1], cB[1], cC[1], cD[1]];
      const x1 = Math.min(...xs), x2 = Math.max(...xs), y1 = Math.min(...ys), y2 = Math.max(...ys);
      if (!additive) { G.sel.clear(); G.selBld = null; }
      let any = false;
      for (const u of G.units) {
        if (u.owner !== 0 || !u.alive) continue;
        if (u.x >= x1 && u.x <= x2 && u.y >= y1 && u.y <= y2) { G.sel.add(u); any = true; }
      }
      if (!any) {
        for (const b of G.buildings) {
          if (b.owner !== 0) continue;
          const s = b.spec;
          if (b.tx + s.fp[0] > x1 && b.tx < x2 && b.ty + s.fp[1] > y1 && b.ty < y2) { G.selBld = b; G.sel.clear(); any = true; break; }
        }
      }
      if (any) AudioSys.sfx("select");
      this.refreshPanel();
    }
  },
  pickUnit(wx, wy) {
    let best = null, bd = .9;
    for (const u of G.units) {
      if (!u.alive) continue;
      if (!(u.owner === 0 || visible(u, 0))) continue;
      const d = Math.hypot((u.x - wx), (u.y - wy));
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  },
  pickBuilding(wx, wy, ownOnly) {
    let best = null, bd = 1e9;
    for (const b of G.buildings) {
      if (ownOnly && b.owner !== 0) continue;
      if (!isVisibleB(b)) continue;
      const s = b.spec;
      if (wx >= b.tx - .4 && wx <= b.tx + s.fp[0] - .6 && wy >= b.ty - .4 && wy <= b.ty + s.fp[1] - .6) {
        const d = Math.abs(wx - (b.tx + s.fp[0] / 2)) + Math.abs(wy - (b.ty + s.fp[1] / 2));
        if (d < bd) { bd = d; best = b; }
      }
    }
    return best;
  },
  pickRes(wx, wy) {
    const tx = wx | 0, ty = wy | 0;
    return tileRes(tx, ty) || null;
  },
  pickAnimal(wx, wy) {
    for (const a of G.animals) if (visible(a, 0) && Math.hypot(a.x - wx, a.y - wy) < .9) return a;
    return null;
  },

  onRight(ev) {
    if (!G) return;
    const [wx, wy] = this.s2w(ev.clientX, ev.clientY);
    const sel = [...G.sel].filter(u => u.alive);
    if (sel.length === 0) return;
    const enemy = this.pickTarget(wx, wy);
    if (enemy) {
      const vills = sel.filter(u => u.spec.spr === "vill");
      const mil = sel.filter(u => u.spec.spr !== "vill");
      if (enemy.owner >= 0 && isEnemy(0, enemy.owner)) {
        Cmd.attack(mil, enemy);
      }
      if (enemy.owner === 0 && enemy.typeId && enemy.hp < enemy.maxHp && vills.length) Cmd.repair(vills, enemy);
      return;
    }
    const animal = this.pickAnimal(wx, wy);
    if (animal) {
      const vills = sel.filter(u => u.spec.spr === "vill");
      if (vills.length) Cmd.gather(vills, animal, undefined, undefined, "food");
      const archers = sel.filter(u => u.st.atk > 0 && (u.spec.cls || []).includes("ranged"));
      return;
    }
    const b = this.pickBuilding(wx, wy, false);
    if (b && b.owner === 0) {
      const vills = sel.filter(u => u.spec.spr === "vill");
      const s = b.spec;
      const cx = b.tx + s.fp[0] / 2, cy = b.ty + s.fp[1] / 2;
      if (!b.done && vills.length) {
        vills.forEach(v => { v.task = { b }; v.setMode("build"); if (!b.builders.includes(v)) b.builders.push(v); });
        return;
      }
      if (b.typeId === "farm" && vills.length) { Cmd.gather(vills, b, cx, cy, "food"); return; }
    }
    const r = this.pickRes(wx, wy);
    if (r) {
      const vills = sel.filter(u => u.spec.spr === "vill");
      if (vills.length) {
        const resKind = r.t === "tree" ? "wood" : (r.t === "berry" ? "food" : (r.t === "gold" ? "gold" : "stone"));
        Cmd.gather(vills, r, r.tx + .5, r.ty + .5, resKind);
        return;
      }
    }
    if (this.amoveArmed) { Cmd.amove(sel, wx, wy); this.amoveArmed = false; AudioSys.sfx("order"); return; }
    Cmd.move(sel, wx, wy);
  },
  pickTarget(wx, wy) {
    for (const u of G.units) {
      if (!u.alive || u.owner === 0 || !isEnemy(0, u.owner)) continue;
      if (Math.hypot(u.x - wx, u.y - wy) < .8 && visible(u, 0)) return u;
    }
    for (const b of G.buildings) {
      if (!b.alive || b.owner === 0 || !isEnemy(0, b.owner) || !isVisibleB(b)) continue;
      const s = b.spec;
      if (wx >= b.tx - .3 && wx <= b.tx + s.fp[0] - .7 && wy >= b.ty - .3 && wy <= b.ty + s.fp[1] - .7) return b;
    }
    return null;
  },

  onKey(e) {
    if (!G) return;
    const tgt = e.target;
    if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "SELECT" || tgt.tagName === "TEXTAREA")) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey && k >= "1" && k <= "9") {
      const n = k;
      if (G.sel.size) { G.ctrl[n] = [...G.sel].filter(u => u.alive && u.owner === 0); e.preventDefault(); return; }
      G.sel.clear(); G.selBld = null;
      (G.ctrl[n] || []).forEach(u => { if (u.alive) G.sel.add(u); });
      this.refreshPanel(); e.preventDefault(); return;
    }
    if (k === "escape") { G.placing = null; this.repairMode = false; this.demolishMode = false; this.amoveArmed = false; UI.closeMenus(); Main.toggleMenu(); return; }
    if (k === "a") { this.amoveArmed = true; toast("攻擊移動：選擇目標地點"); return; }
    if (k === "s") { Cmd.stop([...G.sel].filter(u => u.owner === 0)); return; }
    if (k === "h") { Cmd.stop([...G.sel]); return; }
    if (k === "t" && [...G.sel].some(u => u.spec.spr === "vill")) { this.buildMenuTab = "eco"; this.openBuildMenu(); return; }
    if (k === "e") {
      const idle = G.units.filter(u => u.owner === 0 && u.alive && u.spec.spr === "vill" && u.mode === "idle");
      if (idle.length) {
        const cur = [...G.sel][0];
        const i = idle.indexOf(cur);
        const n = idle[(i + 1) % idle.length];
        G.sel.clear(); G.sel.add(n); G.camX = n.x; G.camY = n.y;
        AudioSys.sfx("select"); this.refreshPanel();
      }
      return;
    }
    if (k === "v") {
      G.sel.clear(); G.selBld = null;
      G.units.filter(u => u.owner === 0 && u.alive && u.spec.spr === "vill").forEach(u => G.sel.add(u));
      AudioSys.sfx("select"); this.refreshPanel(); return;
    }
    G.keys[k] = true;
    if (k === " " && e.target === document.body) { this.camEdge.t = true; e.preventDefault(); }
  },
  onKeyUp(e) { G.keys[e.key.toLowerCase()] = false; },

  frame(dt) {
    if (!G) return;
    const s = G.camSPD * dt;
    // accumulate a SCREEN-space pan vector (sx: +right, sy: +down)
    let sx = 0, sy = 0;
    if (G.keys["w"] || G.keys["arrowup"]) sy -= 1;
    if (G.keys["arrowdown"]) sy += 1;
    if (G.keys["arrowleft"]) sx -= 1;
    if (G.keys["arrowright"]) sx += 1;
    const m = 40;
    if (!this.dragging && !this.hoverUI) {
    const r = GAME.canvas.getBoundingClientRect();
    const mx = this.mouse.x - r.left, my = this.mouse.y - r.top;
    const m = 40;
      if (mx < m) sx -= 1;
      if (mx > r.width - m) sx += 1;
      if (my < m) sy -= 1;
      if (my > r.height - m) sy += 1;
    }
    // convert screen vector -> iso camera axes (+right=(+1,-1)/(+down)=(+1,+1))
    if (sx || sy) {
      const f = s * Math.SQRT1_2;
      G.camX += (sx + sy) * f; G.camY += (sy - sx) * f;
    }
    G.camX = clamp(G.camX, 0, G.MW); G.camY = clamp(G.camY, 0, G.MH);
    if (G.placing) {
      const [wx, wy] = this.s2w(this.mouse.x, this.mouse.y);
      const spec = D.BUILDS[G.placing];
      this.ghostTile = { type: G.placing, tx: Math.round(wx - spec.fp[0] / 2), ty: Math.round(wy - spec.fp[1] / 2) };
    } else this.ghostTile = null;
    const hc = GAME.hc;
    hc.clearRect(0, 0, GAME.canvas.width, GAME.canvas.height);
    if (this.dragging && this.dragS) {
      hc.strokeStyle = "#7fe06f"; hc.lineWidth = 1; hc.setLineDash([4, 3]);
      hc.strokeRect(this.dragS.x, this.dragS.y, this.dragE.x - this.dragS.x, this.dragE.y - this.dragS.y);
      hc.setLineDash([]);
    }
    const tl = document.getElementById("tooltip");
    tl.classList.add("hidden");
    if (G && !G.ended && !this.hoverUI && !this.dragging && !G.placing && !this.repairMode && !this.demolishMode && !this.rmMode) {
      const [hwx, hwy] = this.s2w(this.mouse.x, this.mouse.y);
      const hr = this.pickRes(hwx, hwy);
      if (hr) {
        const amt = Math.ceil(hr.amt !== undefined ? hr.amt : 0);
        const nm = hr.t === "tree" ? "🌲 樹叢（木材）" : hr.t === "gold" ? "🪙 金礦" : hr.t === "stone" ? "⛏️ 石礦" : hr.t === "berry" ? "🫐 漿果（食物）" : "資源";
        const cl = hr.claims ? Object.values(hr.claims).reduce((a, c2) => a + c2, 0) : 0;
        tl.textContent = nm + "　剩餘可採 " + amt + (cl ? "｜採集中 " + cl + " 人" : "");
        tl.style.left = (this.mouse.x + 14) + "px"; tl.style.top = (this.mouse.y + 18) + "px";
        tl.classList.remove("hidden");
      }
    }
    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = .25; this.updateTop(); this.refreshPanel(true); }
  },
  updateTop() {
    if (!G) return;
    const p = G.players[0];
    const S = "🌾 🪵 🪙 ⛏️ 👥".split(" ");
    document.getElementById("rFood").textContent = "🌾 " + Math.floor(p.res.food);
    document.getElementById("rWood").textContent = "🪵 " + Math.floor(p.res.wood);
    document.getElementById("rGold").textContent = "🪙 " + Math.floor(p.res.gold);
    document.getElementById("rStone").textContent = "⛏️ " + Math.floor(p.res.stone);
    document.getElementById("rPop").textContent = "👥 " + p.popUsed + "/" + Math.min(D.POP_CAP, this.popMax(0));
    document.getElementById("rAge").textContent = "🏛️ " + D.ERAS[p.era].name + (p.eraNext > p.era ? "（升級中 " + Math.ceil(p.eraT) + "s）" : "");
    document.getElementById("rTime").textContent = fmtTime(G.time);
    if (p.wonderT > 0) document.getElementById("rTime").textContent += " · 🏛️奇觀勝利倒數 " + Math.ceil(p.wonderT) + "s";
    else { const e = G.players.find(q => q !== p && q.alive && q.wonderT > 0); if (e) document.getElementById("rTime").textContent += " · ⚠️敵方奇觀倒數 " + Math.ceil(e.wonderT) + "s"; }
    document.getElementById("fpsTag").textContent = "";
  },
  popMax(idx) {
    let v = 0;
    for (const b of G.buildings) if (b.owner === idx && b.done && b.spec.pop) v += b.spec.pop;
    return v;
  },

  wireHud() {
    document.getElementById("btnSpeed").onclick = () => {
      const sp = [1, 2, 3];
      G.speed = sp[(sp.indexOf(G.speed) + 1 + sp.length) % sp.length] || 1;
      document.getElementById("btnSpeed").textContent = "⏩ " + G.speed + "x";
    };
    document.getElementById("btnSave").onclick = () => Main.saveGame();
    document.getElementById("btnMenu").onclick = () => Main.toggleMenu();
  },

  refreshPanel(quiet) {
    if (!G) return;
    const panel = document.getElementById("cmdPanel");
    const sel = [...G.sel].filter(u => u.alive && u.owner === 0);
    const b = G.selBld && G.selBld.alive && G.selBld.owner === 0 ? G.selBld : null;
    let sig = "";
    if (sel.length) {
      const t = {};
      for (const u of sel) t[u.tid] = (t[u.tid] || 0) + 1;
      sig = "u" + Object.keys(t).map(k => k + t[k]).join(",");
      if (sel.some(u => u.carry > 0)) sig += "c" + (G.time | 0);
    } else if (b) sig = "b" + b.id + (b.done ? "" : ":" + (b.progress * 4 | 0)) + ":" + b.queue.length + ":" + (b.queue[0] || "") + (b.queue.length ? (b.qt / 2 | 0) : "") + ":" + (!b.done ? "p" : "") + (G.players[0].era);
    else sig = "none";
    if (sig === this.lastPanel) return;
    this.lastPanel = sig;
    panel.innerHTML = "";
    if (sel.length) {
      const counts = {}, first = sel[0];
      for (const u of sel) counts[u.tid] = (counts[u.tid] || 0) + 1;
      const portrait = document.createElement("div");
      portrait.id = "cmdPortrait";
      portrait.appendChild(SPR.portrait(first.tid, G.players[0].color, false));
      panel.appendChild(portrait);
      const info = document.createElement("div"); info.id = "cmdInfo";
      const nm = document.createElement("div"); nm.id = "cmdName";
      nm.textContent = Object.keys(counts).map(k => D.UNITS[k].name + " ×" + counts[k]).join("、");
      info.appendChild(nm);
      const hp = document.createElement("div"); hp.id = "cmdHp";
      const avg = sel.reduce((a, u) => a + u.hp / u.maxHp, 0) / sel.length;
      hp.innerHTML = "<i style='width:" + (avg * 100) + "%'></i>";
      info.appendChild(hp);
      const btns = document.createElement("div"); btns.id = "cmdButtons";
      const addBtn = (icon, cb, txt, off) => {
        const bt = document.createElement("div"); bt.className = "cmdBtn" + (off ? " off" : "");
        const img = document.createElement("canvas"); img.width = 40; img.height = 34;
        img.getContext("2d").drawImage(SPR.menuIcon(icon, 0), 0, 0);
        bt.appendChild(img);
        const s = document.createElement("span"); s.textContent = txt || ""; bt.appendChild(s);
        if (!off) bt.onclick = () => cb();
        btns.appendChild(bt);
      };
      if (sel.some(u => u.spec.spr === "vill")) {
        addBtn("build", () => { this.openBuildMenu(); }, "建造");
        addBtn("stop", () => Cmd.stop(sel), "停止");
        addBtn("repair", () => { this.repairMode = true; toast("選擇要修復的建築"); }, "修復");
      } else {
        addBtn("attack", () => { this.amoveArmed = true; toast("攻擊移動：選擇目標地點"); }, "攻擊", 0);
        addBtn("stop", () => Cmd.stop(sel), "停止");
        if (sel.some(u => u.spec.spr === "monk")) addBtn("heal", () => { }, "治療", true);
      }
      info.appendChild(btns);
      panel.appendChild(info);
    } else if (b) {
      const spec = b.spec;
      const portrait = document.createElement("div"); portrait.id = "cmdPortrait";
      portrait.appendChild(SPR.portrait(b.typeId, G.players[0].color, false));
      panel.appendChild(portrait);
      const info = document.createElement("div"); info.id = "cmdInfo";
      const nm = document.createElement("div"); nm.id = "cmdName";
      nm.textContent = spec.name + (b.done ? "" : "（興建中 " + Math.round(b.progress * 100) + "%）");
      info.appendChild(nm);
      const hp = document.createElement("div"); hp.id = "cmdHp";
      hp.innerHTML = "<i style='width:" + (b.hp / b.maxHp * 100) + "%'></i>";
      info.appendChild(hp);
      const btns = document.createElement("div"); btns.id = "cmdButtons";
      const addBtn = (icon, cb, txt, title) => {
        const bt = document.createElement("div"); bt.className = "cmdBtn";
        bt.title = title || "";
        const img = document.createElement("canvas"); img.width = 40; img.height = 34;
        const ctx = img.getContext("2d");
        try { ctx.drawImage(SPR.menuIcon(icon, G.players[0].color), 0, -6); } catch (e) { }
        bt.appendChild(img);
        const s = document.createElement("span"); s.className = "costline";
        const u = D.UNITS[icon];
        s.textContent = (txt || "") + (u ? "\n" + fmtRes(u.cost) : "");
        s.style.whiteSpace = "pre"; s.style.textAlign = "center";
        bt.appendChild(s);
        bt.onclick = cb;
        btns.appendChild(bt);
      };
      const p = G.players[0];
      if (spec.produce || true) {
        for (const tid in D.UNITS) {
          const u = D.UNITS[tid];
          if (u.bld !== b.typeId) continue;
          if (u.civ && !(D.CIVS[p.civ].units || []).includes(tid)) continue;
          addBtn(tid, () => b.train(tid), u.name, fmtRes(u.cost) + " · " + u.train + "秒");
        }
      }
      if (b.typeId === "tc") {
        const next = p.era + 1;
        if (next <= 3) addBtn("age" + next, () => ageUp(0, next), "升級 " + D.ERAS[next].name, fmtRes(D.ERAS[next].cost));
      }
      if (b.typeId === "tc" && nextAgeCheck() && G.cfg.wonderWin) addBtn("wonder", () => this.startPlace("wonder"), "興建功業", "奇觀");
      for (const tid in D.TECHS) {
        const t = D.TECHS[tid];
        if (t.bld !== b.typeId || t.civ && t.civ !== p.civ) continue;
        if (p.techs.has(tid)) continue;
        addBtn("tech", () => researchTech(0, tid), t.name.replace("_", ""), fmtRes(t.cost));
      }
      if (b.typeId === "market") {
        addBtn("sell", () => sellBuy(0, "sell"), "賣糧", "出售100糧食換金");
        addBtn("buy", () => sellBuy(0, "buy"), "買糧", "用金買糧食");
      }
      if (b.spec.rally) addBtn("rally", () => { this.rmMode = true; toast("右鍵設定集結點"); }, "集結點", "");
      addBtn("demolish", () => { this.demolishMode = true; toast("點選建築以拆除"); }, "拆除", "");
      if (b.queue.length) {
        const qd = document.createElement("div");
        qd.style.cssText = "max-height:70px;overflow:auto";
        for (const tid of b.queue) {
          const row = document.createElement("div"); row.className = "qRow";
          row.textContent = D.UNITS[tid].name;
          qd.appendChild(row);
        }
        btns.appendChild(qd);
      }
      info.appendChild(btns);
      panel.appendChild(info);
    }
    if (G.placing) this.openBuildMenu();
  },

  openBuildMenu() {
    const bm = document.getElementById("buildMenu");
    bm.classList.remove("hidden");
    bm.innerHTML = "";
    const tabs = document.createElement("div"); tabs.className = "tabs";
    const TABS = { eco: "經濟", mil: "軍事", def: "防禦", tech: "科技" };
    for (const t in TABS) {
      const tb = document.createElement("div"); tb.className = "tab" + (this.buildMenuTab === t ? " on" : "");
      tb.textContent = TABS[t];
      tb.onclick = () => { this.buildMenuTab = t; this.openBuildMenu(); };
      tabs.appendChild(tb);
    }
    bm.appendChild(tabs);
    const items = document.createElement("div"); items.className = "items";
    const p = G.players[0];
    const add = (id, name, cost, age, cb, off, icon) => {
      const el = document.createElement("div"); el.className = "bItem" + (off ? " off" : "");
      const img = document.createElement("canvas"); img.width = 44; img.height = 30;
      const g2 = img.getContext("2d");
      try { g2.drawImage(icon ? SPR.menuIcon(icon, p.color) : SPR.menuIcon(id, p.color), 0, 0); } catch (e) { }
      el.appendChild(img);
      const s1 = document.createElement("div"); s1.textContent = name;
      el.appendChild(s1);
      const s2 = document.createElement("div"); s2.className = "costline"; s2.textContent = cost || (age ? D.ERAS[age].name : "");
      el.appendChild(s2);
      if (!off) el.onclick = cb;
      el.title = (off ? "（不足或需求未達）" : "") + (cost || "");
      items.appendChild(el);
    };
    const T = this.buildMenuTab;
    const p2 = G.players[0];
    if (T === "eco" || T === "mil" || T === "def") {
      for (const tid in D.BUILDS) {
        const s = D.BUILDS[tid];
        const grp = ["tc", "house", "farm", "lumber", "mine", "mill", "market", "dock"].includes(tid) ? "eco"
          : (["tower", "castle", "wall", "gate"].includes(tid) ? "def" : "mil");
        if (grp !== T) continue;
        if (tid === "dock" && !this.hasWaterNear()) continue;
        const off = s.age > p2.era || !checkReq(0, tid) || !afford(0, s.cost);
        add(tid, s.name, fmtRes(s.cost), s.age, () => this.startPlace(tid), off);
      }
    } else if (T === "tech") {
      for (const tid in D.TECHS) {
        const t = D.TECHS[tid];
        if (t.civ && t.civ !== p2.civ) continue;
        if (p2.techs.has(tid) || p2.research.some(r => r.tid === tid)) continue;
        const off = t.age > p2.era || !afford(0, t.cost);
        add("tech", t.name.replace(/^_/, ""), fmtRes(t.cost), t.age, () => researchTech(0, tid), off);
      }
    }
    bm.appendChild(items);
  },
  hasWaterNear() {
    const tc = G.buildings.find(b => b.owner === 0 && b.typeId === "tc");
    if (!tc) return false;
    for (let y = Math.max(0, tc.ty - 14); y < Math.min(G.MH, tc.ty + 14); y++) for (let x = Math.max(0, tc.tx - 14); x < Math.min(G.MW, tc.tx + 14); x++)
      if (G.terr[y * G.MW + x] === 2) return true;
    return false;
  },
  startPlace(tid) {
    G.placing = tid;
    toast("點選位置放置 " + D.BUILDS[tid].name + "（Esc 取消）");
  },
  tryPlace(wx, wy) {
    const spec = D.BUILDS[G.placing];
    const tx = Math.round(wx - spec.fp[0] / 2), ty = Math.round(wy - spec.fp[1] / 2);
    const builders = this.getBuilders();
    const b = Cmd.build(0, G.placing, tx, ty, builders);
    if (b) {
      if (!event || !event.shiftKey) G.placing = null;
      this.lastPanel = "";
    }
  },
  getBuilders() {
    const vs = [...G.sel].filter(u => u.spec.spr === "vill" && u.alive);
    if (vs.length) return vs;
    return autoVills(0, 2, G.camX, G.camY);
  },
  drawPlacement(c, w2s) {
    if (!this.ghostTile) return;
    const { type, tx, ty } = this.ghostTile;
    const ok = canPlace(type, tx, ty, 0);
    const spr = SPR.building(type, G.players[0].color, 1);
    const [sx, sy] = w2s(tx + D.BUILDS[type].fp[0] / 2, ty + D.BUILDS[type].fp[1] / 2);
    c.globalAlpha = .6;
    c.drawImage(spr, sx - spr._anchorX, sy - spr._anchorY);
    c.globalAlpha = .25;
    c.fillStyle = ok ? "#3f5" : "#f44";
    for (let dx = 0; dx < D.BUILDS[type].fp[0]; dx++) for (let dy = 0; dy < D.BUILDS[type].fp[1]; dy++) {
      const [px, py] = w2s(tx + dx + .5, ty + dy + .5);
      c.beginPath(); c.moveTo(px, py - 16); c.lineTo(px + 32, py); c.lineTo(px, py + 16); c.lineTo(px - 32, py); c.closePath(); c.fill();
    }
    c.globalAlpha = 1;
  },
  closeMenus() {
    document.getElementById("buildMenu").classList.add("hidden");
  }
};
let lastClickEnt = null;
function nextAgeCheck() { const p = G && G.players[0]; return p && p.era === 3; }
function sellBuy(pl, mode) {
  const p = G.players[pl];
  if (mode === "sell") { if (p.res.food >= 100) { p.res.food -= 100; p.res.gold += 60; toast("賣出 100 糧 → +60 金"); } else err("糧食不足"); }
  else { if (p.res.gold >= 60) { p.res.gold -= 60; p.res.food += 100; toast("買入 100 糧 ← -60 金"); } else err("金不足"); }
}
function afford(pl, cost) {
  const p = G.players[pl];
  for (const k in cost) if ((p.res[k] || 0) < cost[k]) return false;
  return true;
}
