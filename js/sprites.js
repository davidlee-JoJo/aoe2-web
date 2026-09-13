"use strict";
const SPR = {
  _cache: new Map(),
  _mem(k, fn) { let c = this._cache.get(k); if (!c) { c = fn(); this._cache.set(k, c); } return c; },
  _px(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); },
  _poly(g, pts, c) { g.fillStyle = c; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fill(); },

  tile(name, variant) {
    return this._mem("t_" + name + "_" + variant, () => {
      const c = cc(64, 32), g = c.getContext("2d");
      const rng = makeRng("t" + name + "_" + variant);
      const dia = (col) => this._poly(g, [[32, 0], [64, 16], [32, 32], [0, 16]], col);
      const stip = (cols, n) => { for (let i = 0; i < n; i++) { const px = 12 + rng() * 40, py = 6 + rng() * 20; if (Math.abs(px - 32) / 32 + Math.abs(py - 16) / 16 <= 0.82) this._px(g, px, py, 2, 2, cols[(rng() * cols.length) | 0]); } };
      if (name === "water" || name === "shallows") {
        dia(name === "water" ? "#2c5a88" : "#3f7ba3");
        stip(name === "water" ? ["#376a9c", "#254d76", "#43799f"] : ["#5b90b4", "#4e83a8", "#6ea3c4"], 30);
        g.fillStyle = "rgba(210,235,255,.45)";
        for (let i = 0; i < 3; i++) this._px(g, 14 + (rng() * 36), 8 + rng() * 15, 4, 1, "rgba(210,235,255,.45)");
      } else if (name === "gold") {
        dia("#4c7a2e"); stip(["#577f33", "#426c26"], 20);
        const gems = ["#f5c542", "#d9a01f", "#ffe98a"];
        for (let i = 0; i < 14; i++) { const px = 15 + rng() * 30, py = 8 + rng() * 14; this._px(g, px, py, 4, 4, gems[i % 3]); this._px(g, px, py, 2, 2, "#fff2b0"); }
      } else if (name === "stone") {
        dia("#4c7a2e"); stip(["#577f33", "#426c26"], 20);
        const gems = ["#9aa0a8", "#7d848c", "#c2c8d0"];
        for (let i = 0; i < 13; i++) { const px = 15 + rng() * 30, py = 8 + rng() * 14, s = 3 + rng() * 3; this._px(g, px, py, s, s, gems[i % 3]); }
      } else if (name === "berry") {
        dia("#4c7a2e"); stip(["#577f33"], 18);
        this._px(g, 18, 10, 4, 3, "#2c5a1e");
        g.fillStyle = "#2f6b2a";
        g.beginPath(); g.arc(26, 18, 7, 0, 7); g.arc(36, 15, 8, 0, 7); g.arc(32, 21, 7, 0, 7); g.fill();
        g.fillStyle = "#1f4d1f";
        for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(24 + rng() * 18, 13 + rng() * 10, 1.6, 0, 7); g.fill(); }
        g.fillStyle = "#d8322a";
        for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(24 + rng() * 18, 12 + rng() * 12, 1.9, 0, 7); g.fill(); }
      } else {
        dia("#4c7a2e"); stip(["#577f33", "#5a8a38", "#426c26", "#628445"], 28);
        if (variant > 2) for (let i = 0; i < 2; i++) { const px = 16 + rng() * 32, py = 8 + rng() * 16; this._px(g, px, py, 2, 3, "rgba(214,201,120,.7)"); }
      }
      return c;
    });
  },

  ground(id, variant) {
    return this._mem("g_" + id + "_" + variant, () => {
      const rng = makeRng("g" + id + "_" + variant);
      if (id === "tree") {
        const c = cc(72, 76), g = c.getContext("2d");
        const pine = (variant % 2) === 0;
        g.fillStyle = "rgba(0,0,0,.3)"; g.beginPath(); g.ellipse(36, 66, 15, 5, 0, 0, 7); g.fill();
        this._px(g, 33, 50, 6, 16, "#5a3a1c"); this._px(g, 33, 50, 3, 16, "#6b4523");
        const greens = pine ? ["#1e4d24", "#2a5c2e", "#173d1c", "#32743a"] : ["#2e6b2a", "#3f7c34", "#245620", "#4a8a3e"];
        const blob = (cx, cy, r) => {
          for (let i = 0; i < 30; i++) { const a = rng() * 7, rr = rng() * r; this._px(g, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * .8, 3, 4, greens[(rng() * 4) | 0]); }
          for (let i = 0; i < 9; i++) { const a = rng() * 7, rr = rng() * r * .8; this._px(g, cx + Math.cos(a) * rr, cy - r * .2 + Math.sin(a) * rr * .5, 2, 2, greens[2]); }
        };
        if (pine) { blob(36, 16, 8); blob(36, 30, 11); blob(36, 44, 12); }
        else { blob(36, 26, 15); blob(27, 38, 10); blob(46, 38, 10); blob(36, 46, 9); }
        return c;
      }
      if (id === "deer") return this._animal(rng, "#8a5a2c", "#5f3c1a", true);
      if (id === "sheep") return this._animal(rng, "#e8e0cc", "#b8ae96", false);
      if (id === "relic") { const c = cc(16, 16), g = c.getContext("2d"); this._px(g, 3, 6, 10, 7, "#c8a24a"); this._px(g, 3, 6, 10, 2, "#8a6d2f"); this._px(g, 6, 2, 4, 4, "#e8d9a8"); return c; }
      return cc(8, 8);
    });
  },

  _animal(rng, body, dark, ant) {
    const c = cc(24, 28), g = c.getContext("2d");
    g.fillStyle = "rgba(0,0,0,.25)"; g.beginPath(); g.ellipse(12, 25.5, 8, 2.5, 0, 0, 7); g.fill();
    this._px(g, 5, 13, 13, 9, body);
    this._px(g, 16, 8, 4, 6, body);
    this._px(g, 18, 8, 3, 3, dark);
    this._px(g, 5, 14, 3, 3, dark);
    this._px(g, 6, 21, 2, 5, dark); this._px(g, 9, 21, 2, 5, dark);
    this._px(g, 13, 21, 2, 5, dark); this._px(g, 16, 21, 2, 5, dark);
    if (ant) { this._px(g, 17, 4, 1, 5, "#7a5a2a"); this._px(g, 20, 3, 1, 5, "#7a5a2a"); this._px(g, 17, 5, 4, 1, "#7a5a2a"); }
    else { g.fillStyle = "#f4efe2"; g.beginPath(); g.ellipse(11, 13, 7, 5.5, 0, 0, 7); g.fill(); this._px(g, 13, 7, 6, 4, "#f4efe2"); }
    return c;
  },

  unit(kind, colorIdx, dir, frame, wpn, act, af) {
    act = act || "std"; af = af || 0;
    const col = D.PCOLORS[colorIdx % D.PCOLORS.length];
    const key = "u_" + kind + "_" + colorIdx + "_" + dir + "_" + frame + "_" + wpn + "_" + act + "_" + af;
    return this._mem(key, () => {
      const mount = (kind === "cav" || kind === "camel" || kind === "eleph");
      const W = kind === "eleph" ? 48 : (mount ? 40 : 24), H = kind === "eleph" ? 66 : (mount ? 62 : 50);
      const c = cc(W, H), g = c.getContext("2d"), ax = Math.floor(W / 2), by = H - 3;
      g.__ax = ax; g.__by = by;
      const B = (x, y, w, h, cl) => { g.fillStyle = cl; g.fillRect(Math.round(ax + x * 2), Math.round(by + y * 2), Math.max(1, Math.round(w * 2)), Math.max(1, Math.round(h * 2))); };
      const d = ((dir % 8) + 8) % 8;
      const sx = [0, 1, 1, 1, 0, -1, -1, -1][d];
      const back = d >= 4;
      const skin = "#c98f5a", skinD = "#a06f42";
      const pal = D.UNITPALETTE[kind] || {};
      const tunic = pal.tunic || shade(col, .55);
      const toolAct = act === "wood" || act === "mine" || act === "build";
      let lv = 0;
      if (act === "atk" || act === "fire") lv = af;
      else if (toolAct) lv = af === 1 ? 1 : 2;
      const atk = lv === 2;
      const step = frame === 1 ? 1 : 0;
      const wpnUse = toolAct ? (act === "build" ? "hammer" : act === "mine" ? "pick" : "axe") : wpn;
      const lean = ((toolAct && lv === 2) ? .55 : 0) + (atk && (act === "atk" || act === "fire") ? .4 : 0);
      const lea = lean * (sx >= 0 ? 1 : -1);
      const crouch = act === "farm" ? (af === 1 ? .9 : .4) : 0;
      g.fillStyle = "rgba(0,0,0,.3)";
      g.beginPath(); g.ellipse(ax, by, (kind === "eleph" ? 17 : mount ? 13 : 8), 3.5, 0, 0, 7); g.fill();

      if (mount) {
        const mcol = kind === "camel" ? "#967442" : (kind === "eleph" ? "#8b8d95" : (pal.mnt || "#5a4636"));
        const md = shade(mcol, .72), mH = kind === "eleph" ? -12 : -9, mLen = kind === "eleph" ? 10 : 8;
        for (let i = 0; i < 4; i++) {
          const lx = -3.6 + i * 2.4 + ((i % 2 === step) ? .8 : 0);
          const lH = kind === "eleph" ? 9 : 6;
          B(lx, mH + 3, 1.3, lH - ((i % 2 === step) ? 1 : 0), md);
        }
        B(-mLen / 2, mH, mLen, kind === "eleph" ? 5 : 4, mcol);
        B(-mLen / 2, mH + .5, mLen, 1.2, shade(mcol, 1.15));
        const nx = sx >= 0 ? mLen / 2 - 1 : -mLen / 2 - 2;
        B(nx, mH - (kind === "eleph" ? 5 : 3), 2.6, kind === "eleph" ? 5 : 3.4, mcol);
        this._px(g, Math.round(ax + (nx + (sx >= 0 ? 1.2 : .2)) * 2), Math.round(by + (mH - (kind === "eleph" ? 4 : 2)) * 2), 2, 2, "#111");
        if (kind === "camel") { B(-.5, mH - 4, 1.4, 4.5, mcol); B(2.5, mH - 4, 1.4, 4.5, mcol); }
        if (kind === "eleph") { B(sx >= 0 ? mLen / 2 - 1.6 : -mLen / 2 - 1.8, mH - 3, 1.5, 7, shade(mcol, .82)); B(-mLen / 2 + 1, mH + (kind === "eleph" ? -2 : -3), mLen - 2, 1.4, shade(col, .85)); }
        else B(-mLen / 2 + 1, mH - 2.4, mLen - 2, 1.6, shade(col, .8));
        const ry = mH - (kind === "eleph" ? 6 : 4);
        B(-2.6, ry - 5, 5.2, 5.5, tunic);
        B(-2.6, ry - 5, 5.2, 1.2, shade(col, 1.05));
        B(-1.8, ry - 8.5, 3.8, 3.4, skin);
        if (!back) this._px(g, ax + (sx >= 0 ? 0 : -3), by + (ry - 7) * 2, 2, 2, "#111");
        B(-2, ry - 10.5, 4.2, 2.4, "#7d848c"); B(-2, ry - 10.5, 4.2, .8, "#565c64");
        this._wpn(g, B, wpnUse, sx, ry - 4, 2.9, lv);
        return c;
      }
      B(-1.9 + step * .8, -6, 1.5, 6, "#3d352a");
      B(.5 - step * .8, -6, 1.5, 6, "#4b4335");
      B(-2.6 + lea, -13.5 + crouch, 5.2, 7.5, tunic);
      if (kind !== "vill" && kind !== "monk") { B(-2.6 + lea, -13.5 + crouch, 5.2, 3.4, shade(col, .8)); B(-2.6 + lea, -13.5 + crouch, 5.2, 1, shade(col, .55)); }
      const armLen = 4.5 + (crouch ? 1.6 : 0);
      B(-3.3 + lea, -12.5 + crouch, 1.2, armLen, skinD); B(2.1 + lea, -12.5 + crouch, 1.2, armLen, skinD);
      B(-1.9 + lea, -17.2 + crouch, 3.9, 3.8, skin);
      if (kind === "vill") B(-2.1 + lea, -19.2 + crouch, 4.4, 2.2, "#6b5a35");
      else if (kind === "monk") { B(-2.1 + lea, -19.4 + crouch, 4.4, 2.6, "#ddd5b5"); g.strokeStyle = "rgba(200,162,74,.85)"; g.lineWidth = 1.2; g.beginPath(); g.arc(ax, by - 36, 6.4, 0, 7); g.stroke(); }
      else if (kind === "siege") B(-2.1 + lea, -19.2 + crouch, 4.4, 2.3, "#6b6455");
      else { B(-2.1 + lea, -19.4 + crouch, 4.4, 2.5, ["sword", "axe", "spear"].includes(wpn) ? "#828992" : "#3f4750"); B(-2.1 + lea, -19.4 + crouch, 4.4, .8, "#5c646e"); }
      if (!back) { const ey = by - 32 + Math.round(crouch * 2), ex = Math.round(lea * 2); this._px(g, ax + (sx >= 0 ? 0 : -3) + ex, ey, 2, 2, "#111"); this._px(g, ax + (sx >= 0 ? -3 : 0) + ex, ey, 2, 2, "#111"); }
      if (act === "farm" && af === 1) {
        const s = sx >= 0 ? 1 : -1;
        this._px(g, ax + (s > 0 ? 5 : -9), by - 5, 3, 3, "#d9b23a");
        this._px(g, ax + (s > 0 ? 2 : -6), by - 2, 2, 2, "#c89a2c");
      }
      if (act === "heal" && af === 1) {
        const s = sx >= 0 ? 1 : -1;
        g.strokeStyle = "rgba(245,215,110,.95)"; g.lineWidth = 1.4;
        g.beginPath(); g.arc(ax + s * 7, by - 13, 4.6, 0, 7); g.stroke();
      }
      this._wpn(g, B, wpnUse, sx, -10.5, 2.9, act === "heal" ? (af === 1 ? 1 : 0) : lv);
      if (kind === "vill") { B(-4.4, -9, 1.8, 1.6, "#b98a3f"); }
      return c;
    });
  },

  _wpn(g, B, wpn, sx, wy, X, lv) {
    const s = sx >= 0 ? 1 : -1, px0 = s * X;
    const f = lv === 1 ? -3 : 0;
    const axx = bx => g.__ax + bx * 2, byy = by => g.__by + by * 2;
    if (wpn === "axe" || wpn === "pick" || wpn === "hammer") {
      const tipX = lv === 1 ? px0 - s * 1.6 : lv === 2 ? px0 + s * 3.4 : px0 + s * 1.4;
      const tipY = lv === 1 ? wy - 12.5 : lv === 2 ? wy + 1.4 : wy - 8.8;
      g.strokeStyle = "#6b4523"; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(axx(px0), byy(wy - 2.5)); g.lineTo(axx(tipX), byy(tipY)); g.stroke();
      const hw = wpn === "pick" ? 2.6 : wpn === "hammer" ? 1.8 : 2.2;
      const hh = wpn === "pick" ? 1.1 : wpn === "hammer" ? 1.8 : 2.4;
      const hc = wpn === "pick" ? "#aeb6bf" : wpn === "hammer" ? "#7d848c" : "#cdd3dc";
      B(tipX + (s > 0 ? -hw * .35 : -hw * .65), tipY - hh / 2, hw, hh, hc);
      if (wpn === "pick") B(tipX + (s > 0 ? hw - 1.2 : -hw + .2), tipY - .45, 1, .9, "#aeb6bf");
      return;
    }
    switch (wpn) {
      case "sword":
        if (lv === 2) {
          g.strokeStyle = "#cdd3dc"; g.lineWidth = 1.5;
          g.beginPath(); g.moveTo(axx(px0 - .3), byy(wy - 3.2)); g.lineTo(axx(px0 + s * 5.2), byy(wy - 4.6)); g.stroke();
          this._px(g, Math.round(axx(px0 + s * 4.6) - 1), Math.round(byy(wy - 5.6)), 3, 3, "#eef2f8");
          B(px0 - .9 * s, wy - 3.6, 2, .8, "#6b4523");
        } else if (lv === 1) {
          g.strokeStyle = "#cdd3dc"; g.lineWidth = 1.5;
          g.beginPath(); g.moveTo(axx(px0), byy(wy - 4)); g.lineTo(axx(px0 - s * 1.2), byy(wy - 11.5)); g.stroke();
        } else {
          B(px0, wy - 5 + f, 1, 6, "#cdd3dc"); B(px0, wy - 5 + f, 1, 2, "#eef2f8"); B(px0 - .8 * s, wy + .5 + f, 2.6, .8, "#6b4523");
        } break;
      case "spear":
        if (lv === 2) {
          g.strokeStyle = "#6b4523"; g.lineWidth = 1.2;
          g.beginPath(); g.moveTo(axx(px0 - s * 2.2), byy(wy - 3.6)); g.lineTo(axx(px0 + s * 5.6), byy(wy - 3.2)); g.stroke();
          B(px0 + (s > 0 ? 5 : -6.2), wy - 3.7, 1.2, 1.2, "#cdd3dc");
        } else if (lv === 1) {
          B(px0 - s * .5, wy - 12, .7, 13, "#6b4523"); B(px0 - s * .65, wy - 13.4, 1.2, 2.2, "#cdd3dc");
        } else {
          B(px0 + .15, wy - 8, .7, 13, "#6b4523"); B(px0 - .1, wy - 9.4, 1.2, 2.2, "#cdd3dc");
        } break;
      case "bow": {
        const shift = lv === 1 ? -s * .9 : 0;
        const cx = axx(px0 + s * .6 + shift), cy = byy(wy - 1.4);
        g.strokeStyle = "#6b4523"; g.lineWidth = 1.6;
        g.beginPath(); g.arc(cx, cy, 4.6, s > 0 ? -1.25 : Math.PI - 1.25, s > 0 ? 1.25 : Math.PI + 1.25); g.stroke();
        g.strokeStyle = "#ddd"; g.lineWidth = 1;
        g.beginPath(); g.moveTo(cx, cy - 4.2);
        if (lv === 1) g.lineTo(cx - s * 1.7, cy);
        g.lineTo(cx, cy + 4.2); g.stroke();
        if (lv === 1) { B(px0 + (s > 0 ? -1.8 : -2.8), wy - 1.55, 3.6, .8, "#e8e2cf"); B(px0 + (s > 0 ? 1.4 : -2.6), wy - 1.85, 1, 1.4, "#cdd3dc"); }
        break;
      }
      case "xbow": {
        const dy = lv === 1 ? -1 : 0;
        B(px0 - (s > 0 ? 0 : 4), wy - 2 + dy, 4, 1, "#5c4326");
        g.strokeStyle = "#bbb"; g.lineWidth = 1;
        g.beginPath(); g.moveTo(axx(px0 + s * .4), byy(wy - 3 + dy));
        if (lv === 1) g.lineTo(axx(px0 + s * .4) - s * 2, byy(wy - 1 + dy));
        g.lineTo(axx(px0 + s * .4), byy(wy + 1 + dy)); g.stroke();
        if (lv === 1) B(px0 - (s > 0 ? .5 : 3.4), wy - 2.6 + dy, 3.8, .7, "#e8e2cf");
        break;
      }
      case "torch": B(px0 + .1, wy - .5, .8, 4, "#6b4523"); this._px(g, Math.round(axx(px0) - 2), Math.round(byy(wy - 3.5)), 5, 5, "#e8781f"); this._px(g, Math.round(axx(px0) - 1), Math.round(byy(wy - 3)), 3, 3, "#f5c542"); break;
      case "staff":
        if (lv === 1) { B(px0 + s * .6, wy - 11.5, .8, 8, "#6b4523"); this._px(g, Math.round(axx(px0 + s * .6) - 1), Math.round(byy(wy - 12)), 4, 4, "#f5d76e"); }
        else { B(px0 + .15, wy - 6.5, .8, 10, "#6b4523"); this._px(g, Math.round(axx(px0) - 1), Math.round(byy(wy - 8)), 3, 3, "#f5d76e"); }
        break;
    }
  },

  siege(sub, colorIdx) {
    return this._mem("s_" + sub + "_" + colorIdx, () => {
      const col = D.PCOLORS[colorIdx % D.PCOLORS.length];
      const c = cc(sub === "treb" ? 48 : 44, sub === "ram" ? 26 : 34), g = c.getContext("2d");
      const by = c.height - 2;
      g.fillStyle = "rgba(0,0,0,.32)"; g.beginPath(); g.ellipse(24, by, 18, 4, 0, 0, 7); g.fill();
      const rng = makeRng(sub);
      if (sub === "ram") {
        this._px(g, 6, by - 16, 32, 10, "#6b4523"); this._px(g, 6, by - 16, 32, 3, "#7d5530");
        this._px(g, 4, by - 18, 36, 3, "#4c3218");
        for (let i = 0; i < 3; i++) { g.fillStyle = "#3c2a14"; g.beginPath(); g.arc(11 + i * 11, by - 4, 4, 0, 7); g.fill(); g.fillStyle = "#6b4523"; g.beginPath(); g.arc(11 + i * 11, by - 4, 1.6, 0, 7); g.fill(); }
        this._px(g, 36, by - 13, 8, 3, shade(col, .8));
      } else if (sub === "mang") {
        this._px(g, 8, by - 8, 28, 6, "#5c4326"); this._px(g, 8, by - 8, 28, 2, "#7a5a35");
        g.save(); g.translate(22, by - 8); g.rotate(-.9); this._px(g, -2, -20, 4, 20, "#6b4523"); this._px(g, -3.5, -23, 7, 4, "#8a913c"); g.restore();
        this._px(g, 26, by - 12, 6, 6, "#3c352a");
      } else {
        this._px(g, 8, by - 6, 30, 5, "#5c4326");
        g.strokeStyle = "#6b4523"; g.lineWidth = 3; g.beginPath(); g.moveTo(14, by - 5); g.lineTo(22, by - 34); g.lineTo(30, by - 5); g.stroke();
        g.save(); g.translate(22, by - 33); g.rotate(.5); this._px(g, -1.4, -10, 2.8, 18, "#8a913c"); g.restore();
        this._px(g, 26, by - 46, 8, 7, col); this._px(g, 26, by - 46, 8, 2, shade(col, .75));
        this._px(g, 9, by - 10, 5, 5, "#8a8f96");
      }
      return c;
    });
  },

  proj(kind) {
    return this._mem("p_" + kind, () => {
      if (kind === "stone") { const c = cc(10, 10), g = c.getContext("2d"); g.fillStyle = "#9aa0a8"; g.beginPath(); g.arc(5, 5, 4, 0, 7); g.fill(); return c; }
      const c = cc(16, 6), g = c.getContext("2d");
      this._px(g, 2, 2, 11, 2, "#6b4523"); this._px(g, 12, 1, 4, 4, "#cdd3dc"); this._px(g, 0, 1, 3, 1, "#ddd"); this._px(g, 0, 4, 3, 1, "#ddd");
      return c;
    });
  },

  _isoPts(w, d) {
    return (dx, dy) => [((dx - dy) - (w - d) / 2) * HW, ((dx + dy) - (w + d) / 2) * HH];
  },

  building(typeId, colorIdx, stage) {
    const st = Math.round(clamp(stage, 0, 1) * 4);
    return this._mem("b_" + typeId + "_" + colorIdx + "_" + st, () => this._mkBuilding(typeId, colorIdx, st / 4, (hashStr(typeId) % 3)));
  },

  _mkBuilding(typeId, colorIdx, stage, variant) {
    const spec = D.BUILDS[typeId];
    const [w, d] = spec.fp, col = D.PCOLORS[colorIdx % D.PCOLORS.length];
    const style = spec.style || "hip";
    const wh = spec.wh || 16;
    const riseW = (w + d) * HW + 12, riseH = (w + d) * HH + wh + (style === "hip" || style === "ridge" ? 26 : 54) + 14;
    const c = cc(riseW, riseH), g = c.getContext("2d");
    g.__ax = riseW / 2; g.__by = riseH - 8;
    const P = this._isoPts(w, d);
    const px = (dx, dy) => [riseW / 2 + P(dx, dy)[0], riseH - 8 + P(dx, dy)[1]];
    const rng = makeRng("b" + typeId + colorIdx + stage);
    c._anchorX = riseW / 2; c._anchorY = riseH - 8;
    c._halfW = (w + d) * HW / 2 + 4; c._halfH = (w + d) * HH / 2 + 4;

    g.fillStyle = "rgba(40,32,16,.8)";
    this._poly(g, [px(0, 0), px(w, 0), px(w, d), px(0, d)], "rgba(46,36,18,.85)");
    g.fillStyle = "rgba(120,100,60,.5)";
    for (let i = 0; i < (w + d) * 3; i++) { const ax = rng() * w, ay = rng() * d; const [sx, sy] = px(ax, ay); this._px(g, sx, sy, 2, 1, "rgba(120,100,60,.5)"); }

    if (style === "field") {
      const pts = [px(.15, .15), px(w - .15, .15), px(w - .15, d - .15), px(.15, d - .15)];
      this._poly(g, pts, "#5a4526");
      const gcol = stage < .3 ? "#6f8f3a" : "#4c7a2e";
      for (let r = 0; r < d - 0.5; r += 0.5) {
        const l = px(.3, r + .25), rr = px(w - .3, r + .25);
        this._poly(g, [[l[0] - (w - .6) * HW * .5 + (w - .6) * HW * .0, l[1] - 2], [rr[0], rr[1] - 2], [rr[0], rr[1] + 3], [l[0], l[1] + 3]], gcol);
      }
      return c;
    }
    if (style === "dock") {
      this._poly(g, [px(.1, .1), px(w - .1, .1), px(w - .1, d - .1), px(.1, d - .1)], "#7a5a35");
      for (let i = 0; i < w * 2; i++) { const l = px(.2, (i + .5) / (w * 2) * d), rr = px(w - .2, (i + .5) / (w * 2) * d); g.strokeStyle = "#5c4326"; g.beginPath(); g.moveTo(l[0] - 20, l[1]); g.lineTo(rr[0] + 20, rr[1]); g.stroke(); }
      for (const [dx, dy] of [[.2, .2], [w - .3, .2], [.2, d - .3], [w - .3, d - .3]]) { const [sx, sy] = px(dx, dy); this._px(g, sx - 2, sy - 6, 4, 10, "#4c3218"); }
      return c;
    }

    const wallC = spec.wall || "#b8ae96", wallD = shade(wallC, .78), wallL = shade(wallC, 1.12);
    const hMul = stage < 1 ? (0.25 + 0.75 * stage) : 1;
    const bh = wh * hMul;
    const A = px(0, 0), B0 = px(w, 0), C0 = px(w, d), D0 = px(0, d);
    const Lf = [D0, C0, [C0[0], C0[1] - bh], [D0[0], D0[1] - bh]];
    const Rf = [B0, C0, [C0[0], C0[1] - bh], [B0[0], B0[1] - bh]];
    this._poly(g, Lf, wallD);
    this._poly(g, Rf, shade(wallC, .92));
    for (let i = 0; i < (w + d) * 6; i++) {
      const t = rng(), side = rng() < .5;
      const p1 = side ? [D0[0] + (C0[0] - D0[0]) * t, D0[1] + (C0[1] - D0[1]) * t - rng() * bh] : [B0[0] + (C0[0] - B0[0]) * t, B0[1] + (C0[1] - B0[1]) * t - rng() * bh];
      this._px(g, p1[0], p1[1], 2, 1, rng() < .5 ? "rgba(0,0,0,.12)" : "rgba(255,255,255,.1)");
    }
    g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(C0[0], C0[1]); g.lineTo(C0[0], C0[1] - bh); g.stroke();

    if (style === "field") return c;

    if (stage >= 1) {
      if (style === "flat") {
        const top = [A, B0, C0, D0].map(p => [p[0], p[1] - bh]);
        this._poly(g, top, shade(wallC, 1.18));
        const mer = (p1, p2, n) => { for (let i = 0; i < n; i++) { const t1 = (i + .15) / n, t2 = (i + .85) / n; const a = [lerp(p1[0], p2[0], t1), lerp(p1[1], p2[1], t1)], b = [lerp(p1[0], p2[0], t2), lerp(p1[1], p2[1], t2)]; this._poly(g, [a, b, [b[0], b[1] - 5], [a[0], a[1] - 5]], shade(wallC, 1.05)); } };
        mer(C0, B0, Math.max(2, w * 2)); mer(D0, C0, Math.max(2, d * 2));
      } else {
        const apex = [riseW / 2, riseH - 8 - bh - (wh < 20 ? 20 : 26)];
        const top = [A, B0, C0, D0].map(p => [p[0], p[1] - bh]);
        const rc = spec.roof || shade(col, .6);
        this._poly(g, [top[3], top[0], apex], shade(rc, 1.05));
        this._poly(g, [top[0], top[1], apex], shade(rc, 1.2));
        this._poly(g, [top[1], top[2], apex], shade(rc, .7));
        this._poly(g, [top[2], top[3], apex], shade(rc, .85));
        g.strokeStyle = "rgba(0,0,0,.3)"; g.beginPath(); g.moveTo(apex[0], apex[1]); g.lineTo(top[2][0], top[2][1]); g.stroke();
        if (style !== "tower") {
          this._px(g, apex[0], apex[1] - 10, 1.5, 10, "#4c3218");
          this._poly(g, [[apex[0] + 1, apex[1] - 10], [apex[0] + 9, apex[1] - 8], [apex[0] + 1, apex[1] - 4]], col);
        }
      }
    } else if (stage > 0) {
      g.strokeStyle = "#6b4523"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(C0[0], C0[1] - bh - 4); g.lineTo(C0[0], C0[1]); g.stroke();
      g.beginPath(); g.moveTo(C0[0] - 14, C0[1] - bh - 4); g.lineTo(C0[0] - 14, C0[1]); g.stroke();
      g.beginPath(); g.moveTo(C0[0] - 14, C0[1] - bh); g.lineTo(C0[0] + 4, C0[1] - bh); g.stroke();
    } else {
      g.strokeStyle = "rgba(220,200,120,.7)"; g.setLineDash([4, 3]); g.lineWidth = 2;
      g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B0[0], B0[1]); g.lineTo(C0[0], C0[1]); g.lineTo(D0[0], D0[1]); g.closePath(); g.stroke(); g.setLineDash([]);
    }

    const door = px(w / 2, d);
    this._poly(g, [[door[0] - 5, door[1]], [door[0] + 5, door[1]], [door[0] + 5, door[1] - 9], [door[0], door[1] - 12], [door[0] - 5, door[1] - 9]], "#2c2416");

    if (style !== "wall" && style !== "tower") {
      const winC = "#2c3a55";
      for (let i = 0; i < (variant % 2) + 1; i++) {
        const wp = px(w, d * (.3 + .4 * i));
        this._px(g, wp[0], wp[1] - bh * .7, 4, 5, winC);
        this._px(g, Lf[0][0] + (Lf[1][0] - Lf[0][0]) * .4, Lf[0][1] - bh * .7, 4, 5, winC);
      }
    }
    if (typeId === "mill") {
      g.save(); g.translate(riseW / 2, riseH - 8 - bh - 14);
      for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2 + .4); g.strokeStyle = "#6b4523"; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -14); g.stroke(); g.fillStyle = "#d8d0b0"; g.fillRect(-1, -14, 4, 8); }
      g.restore();
    }
    if (typeId === "market") {
      const aw = px(w * .5, d * .5);
      this._poly(g, [[aw[0] - 16, aw[1] - 8], [aw[0] + 16, aw[1] - 8], [aw[0] + 12, aw[1] - 16], [aw[0] - 12, aw[1] - 16]], "#c05a3a");
      this._poly(g, [[aw[0] - 16, aw[1] - 8], [aw[0] - 8, aw[1] - 8], [aw[0] - 6, aw[1] - 16], [aw[0] - 12, aw[1] - 16]], "#e0c890");
    }
    if (typeId === "monastery") {
      const dm = px(w / 2, d / 2);
      g.fillStyle = "#c8ccd4"; g.beginPath(); g.arc(dm[0], dm[1] - bh - (wh < 20 ? 20 : 26) + 6, 9, Math.PI, 0); g.fill();
      this._px(g, dm[0] - 1, dm[1] - bh - (wh < 20 ? 20 : 26) - 12, 2, 7, "#c8a24a"); this._px(g, dm[0] - 3, dm[1] - bh - (wh < 20 ? 20 : 26) - 10, 6, 2, "#c8a24a");
    }
    if (typeId === "castle") {
      for (const [tx, ty] of [[0, 0], [w, 0], [0, d], [w, d]]) {
        const p = px(tx, ty);
        this._poly(g, [[p[0] - 7, p[1]], [p[0] + 7, p[1]], [p[0] + 7, p[1] - bh - 20], [p[0], p[1] - bh - 26], [p[0] - 7, p[1] - bh - 20]], shade(wallC, .95));
        this._poly(g, [[p[0] - 7, p[1] - bh - 20], [p[0] + 7, p[1] - bh - 20], [p[0] + 5, p[1] - bh - 24], [p[0] - 5, p[1] - bh - 24]], shade(wallC, 1.15));
        this._px(g, p[0] - 1, p[1] - bh - 36, 1.5, 12, "#4c3218");
        this._poly(g, [[p[0] + 1, p[1] - bh - 36], [p[0] + 8, p[1] - bh - 33], [p[0] + 1, p[1] - bh - 30]], col);
      }
    }
    if (typeId === "wonder") {
      const dm = px(w / 2, d / 2);
      for (let i = 0; i < 3; i++) {
        const s2 = 16 - i * 4, yy = dm[1] - bh - i * 12;
        this._poly(g, [[dm[0] - s2, yy], [dm[0] + s2, yy], [dm[0] + s2 * .8, yy - 10], [dm[0] - s2 * .8, yy - 10]], i === 2 ? "#c8a24a" : "#b8ae96");
      }
      this._poly(g, [[dm[0], dm[1] - bh - 46], [dm[0] + 8, dm[1] - bh - 40], [dm[0] - 8, dm[1] - bh - 40]], "#d9a01f");
    }
    if (typeId === "barracks" || typeId === "archery" || typeId === "stable" || typeId === "siege") {
      const em = px(w / 2, d);
      g.fillStyle = col;
      g.fillRect(em[0] - 14, em[1] - bh + 2, 6, 7);
      g.fillStyle = "#fff"; g.font = "7px sans-serif";
    }
    return c;
  },

  portrait(typeId, colorIdx, big) {
    return this._mem("po_" + typeId + "_" + colorIdx + "_" + (big ? 1 : 0), () => {
      const c = cc(108, 108), g = c.getContext("2d");
      g.imageSmoothingEnabled = false;
      if (D.UNITS[typeId]) {
        const u = D.UNITS[typeId];
        const s = SPR.unit(u.spr, colorIdx, 1, 0, u.wpn);
        const sc = Math.min(56 / s.width, 90 / (s.height / 1.1));
        g.save(); g.translate(54, 102); g.scale(Math.max(1.4, sc), Math.max(1.4, sc)); g.drawImage(s, -s.width / 2, -s.height); g.restore();
      } else {
        const b = SPR.building(typeId, colorIdx, 1);
        const sc = Math.min(104 / b.width, 100 / b.height);
        g.save(); g.translate(54, 104); g.scale(sc, sc); g.drawImage(b, -b._anchorX, -b._anchorY); g.restore();
      }
      return c;
    });
  },

  menuIcon(id, colorIdx) {
    return this._mem("mi_" + id + "_" + colorIdx, () => {
      const c = cc(44, 30), g = c.getContext("2d");
      g.imageSmoothingEnabled = false;
      if (D.UNITS[id]) {
        const u = D.UNITS[id];
        const s = SPR.unit(u.spr, colorIdx, 1, 0, u.wpn);
        const sc = Math.min(40 / s.width, 34 / (s.height / 1.05));
        g.save(); g.translate(22, 30); g.scale(sc, sc); g.drawImage(s, -s.width / 2, -s.height); g.restore();
      } else if (D.BUILDS[id]) {
        const b = SPR.building(id, colorIdx, 1);
        const sc = Math.min(42 / b.width, 29 / b.height);
        g.save(); g.translate(22, 30); g.scale(sc, sc); g.drawImage(b, -b._anchorX, -b._anchorY); g.restore();
      } else {
        g.fillStyle = "#c8a24a"; g.font = "16px sans-serif"; g.textAlign = "center";
        g.fillText({ tech: "⚒", attack: "⚔", stop: "⏹", hold: "⏳", heal: "✚", build: "🏠", repair: "🔧", rally: "⚑", demolish: "✖", sell: "💰", buy: "💰", wonder: "🏛", age1: "⬆", age2: "⬆", age3: "⬆" }[id] || "⚔", 22, 20);
      }
      return c;
    });
  }
};
