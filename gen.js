// ルールスイーパー: ステージ生成 + 難易度判定
//
// 使い方:  node gen.js [シード値]      → stages.json を作り直す
//
// 難易度は「人間がどの程度の推理を必要とするか」を、段階つきの推理ソルバーで判定する。
//   レベル1(初級): 1つの数字・1つのルールだけで決まるマスを順に開けていけば解ける
//   レベル2(中級): 2つの条件(数字どうし・数字と行など)を比べる推理が必要
//   レベル3(上級): 「ここが地雷だと仮定すると矛盾する」という仮定の推理が必要
// ソルバーは推理で確定したマスを開け、新しく見えた数字も使って進む(実際のプレイと同じ)。
// さらに、ルールなしでは答えが2通り以上あること(=ルールが本当に必要なこと)を総当たりで確認する。

let seed = +process.argv[2] || 2026;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const N8 = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const N4 = [[-1,0],[1,0],[0,-1],[0,1]];

function neighbors(W, H, i, dirs) {
  const x = i % W, y = (i / W) | 0, out = [];
  for (const [dy, dx] of dirs) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H) out.push(ny * W + nx); }
  return out;
}
const scope = (st, i) => neighbors(st.W, st.H, i, st.cross ? N4 : N8);
const mirror = (st, i) => ((i / st.W) | 0) * st.W + (st.W - 1 - (i % st.W));

// ---------- ルール判定(完成した配置) ----------
function ruleOK(st, m) {
  const { W, H, rules } = st;
  for (const r of rules) {
    if (r === 'noadj') {
      for (let i = 0; i < W * H; i++) if (m[i]) for (const j of neighbors(W, H, i, N8)) if (m[j]) return false;
    } else if (r === 'rowcol') {
      for (let y = 0; y < H; y++) { let c = 0; for (let x = 0; x < W; x++) c += m[y * W + x]; if (c !== 1) return false; }
      for (let x = 0; x < W; x++) { let c = 0; for (let y = 0; y < H; y++) c += m[y * W + x]; if (c !== 1) return false; }
    } else if (r === 'sym') {
      for (let i = 0; i < W * H; i++) if (m[i] !== m[mirror(st, i)]) return false;
    } else if (r === 'region') {
      const cnt = {}; for (let i = 0; i < W * H; i++) if (m[i]) cnt[st.regions[i]] = (cnt[st.regions[i]] || 0) + 1;
      for (const id of new Set(st.regions)) if ((cnt[id] || 0) !== st.perRegion) return false;
    } else if (r === 'connected') {
      const cells = []; for (let i = 0; i < W * H; i++) if (m[i]) cells.push(i);
      if (!cells.length) return false;
      const seen = new Set([cells[0]]), q = [cells[0]];
      while (q.length) { const c = q.pop(); for (const j of neighbors(W, H, c, N4)) if (m[j] && !seen.has(j)) { seen.add(j); q.push(j); } }
      if (seen.size !== cells.length) return false;
    }
  }
  return true;
}

// ---------- 総当たりで解の数を数える(上限 cap) ----------
// force: { セル番号: 0 or 1 } で値を固定して探す(revealed は数字が見えている安全マス)
function countSolutions(st, revealed, useRule, cap = 2, force = {}) {
  const { W, H, total } = st, n = W * H;
  const m = new Array(n).fill(0), assigned = new Array(n).fill(false);
  for (const i of revealed) assigned[i] = true;
  const pre = Object.entries(force).map(([i, v]) => [+i, v]).filter(([i]) => !assigned[i]);
  const nums = [...revealed].map(i => ({ need: scope(st, i).filter(j => st.mines[j]).length, nb: scope(st, i) }));
  const cellNums = Array.from({ length: n }, () => []);
  nums.forEach((c, k) => c.nb.forEach(j => cellNums[j].push(k)));
  const have = nums.map(() => 0), open = nums.map(c => c.nb.filter(j => !assigned[j]).length);
  const order = []; for (let i = 0; i < n; i++) if (!assigned[i]) order.push(i);
  order.sort((a, b) => cellNums[b].length - cellNums[a].length);
  // 行・列・区画のように「この範囲にちょうど k 個」というルールは、範囲ごとに数えて枝刈りする
  const groups = [];
  if (useRule && st.rules.includes('rowcol')) for (let k = 0; k < W; k++) {
    groups.push({ cells: [...Array(W).keys()].map(x => k * W + x), need: 1 });
    groups.push({ cells: [...Array(H).keys()].map(y => y * W + k), need: 1 });
  }
  if (useRule && st.rules.includes('region')) for (const id of new Set(st.regions)) groups.push({ cells: st.regions.map((r, i) => r === id ? i : -1).filter(i => i >= 0), need: st.perRegion });
  const groupsOf = Array.from({ length: n }, () => []);
  groups.forEach((g, k) => { g.have = 0; g.open = g.cells.filter(j => !assigned[j]).length; g.cells.forEach(j => groupsOf[j].push(k)); });
  let mines = 0, remaining = order.length, found = 0;
  const set = (i, v) => { assigned[i] = true; m[i] = v; for (const k of cellNums[i]) { open[k]--; have[k] += v; } for (const k of groupsOf[i]) { groups[k].open--; groups[k].have += v; } mines += v; remaining--; };
  const unset = i => { const v = m[i]; for (const k of cellNums[i]) { open[k]++; have[k] -= v; } for (const k of groupsOf[i]) { groups[k].open++; groups[k].have -= v; } mines -= v; remaining++; assigned[i] = false; m[i] = 0; };
  const ok = i => cellNums[i].every(k => have[k] <= nums[k].need && have[k] + open[k] >= nums[k].need);
  const ruleLocal = i => {
    if (!useRule) return true;
    for (const k of groupsOf[i]) { const g = groups[k]; if (g.have > g.need || g.have + g.open < g.need) return false; }
    if (st.rules.includes('sym')) { const j = mirror(st, i); if (assigned[j] && m[j] !== m[i]) return false; }
    if (m[i] && st.rules.includes('noadj') && neighbors(W, H, i, N8).some(j => assigned[j] && m[j])) return false;
    return true;
  };
  for (const [i, v] of pre) { order.splice(order.indexOf(i), 1); set(i, v); if (!ok(i) || !ruleLocal(i)) return 0; }
  (function rec(d) {
    if (found >= cap || mines > total || mines + remaining < total) return;
    if (d === order.length) {
      if (nums.some((c, k) => have[k] !== c.need)) return;
      if (useRule && !ruleOK(st, m)) return;
      found++; return;
    }
    const i = order[d];
    for (const v of [0, 1]) { set(i, v); if (ok(i) && ruleLocal(i)) rec(d + 1); unset(i); }
  })(0);
  return found;
}

// 総当たりでのプレイ再現: 「どの解でも安全なマス」を開け続けて、最後まで開けきれるか。
// 推理ソルバーとは独立した検証。useRule=false で詰まれば「ルールが必要」と言える。
function fairByBrute(st, revealed, useRule) {
  const n = st.W * st.H, shown = new Set(revealed), mines = {};
  for (;;) {
    const unknown = []; for (let i = 0; i < n; i++) if (!shown.has(i) && !(i in mines)) unknown.push(i);
    if (unknown.every(i => st.mines[i])) return true;
    let progressed = false;
    for (const i of unknown) {
      if (countSolutions(st, shown, useRule, 1, { ...mines, [i]: 1 }) === 0) { shown.add(i); progressed = true; }
      else if (countSolutions(st, shown, useRule, 1, { ...mines, [i]: 0 }) === 0) { mines[i] = 1; progressed = true; }
    }
    if (!progressed) return false;
  }
}

// ---------- 段階つき推理ソルバー ----------
// val[i]: -1 未確定 / 0 安全 / 1 地雷。shown[i]: 数字が見えている(開いた安全マス)。
const CONTRA = Symbol('contradiction');

function buildEqs(st, val, shown) {
  const n = st.W * st.H, eqs = [];
  const add = (cellsAll, count) => {
    const cells = []; let c = count;
    for (const j of cellsAll) { if (val[j] === 1) c--; else if (val[j] === -1) cells.push(j); }
    if (c < 0 || c > cells.length) throw CONTRA;
    if (cells.length) eqs.push({ cells, count: c });
  };
  for (let i = 0; i < n; i++) if (shown[i]) add(scope(st, i), st.num[i]);
  add([...Array(n).keys()], st.total);
  if (st.rules.includes('rowcol')) for (let k = 0; k < st.W; k++) {
    add([...Array(st.W).keys()].map(x => k * st.W + x), 1);
    add([...Array(st.H).keys()].map(y => y * st.W + k), 1);
  }
  if (st.rules.includes('region')) for (const id of new Set(st.regions)) add(st.regions.map((r, i) => r === id ? i : -1).filter(i => i >= 0), st.perRegion);
  return eqs;
}

function setVal(val, i, v, changed) {
  if (val[i] === v) return;
  if (val[i] !== -1) throw CONTRA;
  val[i] = v; changed.push(i);
}

// ルール固有の1手推理(レベル1扱い)
function ruleStep(st, val, changed) {
  const n = st.W * st.H;
  for (const r of st.rules) {
    if (r === 'noadj') for (let i = 0; i < n; i++) if (val[i] === 1) for (const j of neighbors(st.W, st.H, i, N8)) setVal(val, j, 0, changed);
    if (r === 'sym') for (let i = 0; i < n; i++) if (val[i] !== -1) setVal(val, mirror(st, i), val[i], changed);
    if (r === 'connected') {
      const known = []; for (let i = 0; i < n; i++) if (val[i] === 1) known.push(i);
      if (!known.length) continue;
      const remain = st.total - known.length;
      const dist = new Array(n).fill(Infinity), q = [];
      for (const i of known) { dist[i] = 0; q.push(i); }
      for (let h = 0; h < q.length; h++) for (const j of neighbors(st.W, st.H, q[h], N4)) if (val[j] !== 0 && dist[j] === Infinity) { dist[j] = dist[q[h]] + 1; q.push(j); }
      // 既知の地雷どうしが、地雷になりうるマスを通ってつながれないなら矛盾
      const seen = new Set([known[0]]), qq = [known[0]];
      while (qq.length) for (const j of neighbors(st.W, st.H, qq.pop(), N4)) if (val[j] !== 0 && !seen.has(j)) { seen.add(j); qq.push(j); }
      if (known.some(i => !seen.has(i))) throw CONTRA;
      for (let i = 0; i < n; i++) if (val[i] === -1 && dist[i] > remain) setVal(val, i, 0, changed);
    }
  }
}

// level 1/2 の推理を、進まなくなるまで繰り返す
function propagate(st, val, shown, level, reveal) {
  for (;;) {
    const changed = [];
    const eqs = buildEqs(st, val, shown);
    for (const e of eqs) {
      if (e.count === 0) e.cells.forEach(i => setVal(val, i, 0, changed));
      else if (e.count === e.cells.length) e.cells.forEach(i => setVal(val, i, 1, changed));
    }
    ruleStep(st, val, changed);
    if (!changed.length && level >= 2) {
      // 2つの条件を比べる: A の数 - B の数 = |A だけのマス| なら、A だけ = 全部地雷、B だけ = 全部安全
      outer: for (let a = 0; a < eqs.length; a++) for (let b = 0; b < eqs.length; b++) {
        if (a === b) continue;
        const A = eqs[a], B = eqs[b], Bs = new Set(B.cells);
        if (!A.cells.some(i => Bs.has(i))) continue;
        const As = new Set(A.cells);
        const onlyA = A.cells.filter(i => !Bs.has(i)), onlyB = B.cells.filter(i => !As.has(i));
        if (A.count - B.count === onlyA.length && (onlyA.length || onlyB.length)) {
          onlyA.forEach(i => setVal(val, i, 1, changed)); onlyB.forEach(i => setVal(val, i, 0, changed));
          if (changed.length) break outer;
        }
      }
    }
    if (!changed.length) return;
    if (reveal) for (const i of changed) if (val[i] === 0) shown[i] = 1;
  }
}

// 盤面を指定レベルの推理だけで最後まで解けるか。stats に各レベルの使用回数を記録
function solvable(st, revealed, level, stats) {
  const n = st.W * st.H, val = new Array(n).fill(-1), shown = new Array(n).fill(0);
  for (const i of revealed) { val[i] = 0; shown[i] = 1; }
  try {
    for (;;) {
      const before = val.filter(v => v !== -1).length;
      propagate(st, val, shown, Math.min(level, 2), true);
      if (stats) stats.steps++;
      if (val.every(v => v !== -1)) return val.every((v, i) => v === st.mines[i]);
      if (level < 3) return false;
      // 仮定の推理: あるマスを地雷(または安全)と仮定して、矛盾が出たら逆が確定
      let progressed = false;
      for (let i = 0; i < n && !progressed; i++) {
        if (val[i] !== -1) continue;
        for (const v of [1, 0]) {
          const tv = val.slice(), ts = shown.slice();
          tv[i] = v;
          try { propagate(st, tv, ts, 2, false); } catch (e) { if (e !== CONTRA) throw e; val[i] = 1 - v; if (val[i] === 0) shown[i] = 1; progressed = true; if (stats) stats.trials++; break; }
        }
      }
      if (!progressed) return false;
      if (val.filter(v => v !== -1).length === before) return false;
    }
  } catch (e) { if (e === CONTRA) return false; throw e; }
}

function grade(st, revealed) {
  for (let L = 1; L <= 3; L++) if (solvable(st, revealed, L)) return L;
  return 4;
}

// ---------- 地雷配置と区画 ----------
function randomLayout(st) {
  const { W, H, total, rules } = st, n = W * H;
  for (let t = 0; t < 500000; t++) {
    const m = new Array(n).fill(0);
    if (rules.includes('rowcol')) {
      shuffle([...Array(W).keys()]).forEach((x, y) => m[y * W + x] = 1);
    } else if (rules.includes('sym')) {
      const half = []; for (let y = 0; y < H; y++) for (let x = 0; x < Math.ceil(W / 2); x++) half.push(y * W + x);
      shuffle(half); let c = 0;
      for (const i of half) { const mi = mirror(st, i), add = mi === i ? 1 : 2; if (c + add <= total) { m[i] = 1; m[mi] = 1; c += add; } if (c === total) break; }
    } else if (rules.includes('connected')) {
      m[Math.floor(rnd() * n)] = 1; let c = 1;
      while (c < total) { const f = []; for (let i = 0; i < n; i++) if (m[i]) for (const j of neighbors(W, H, i, N4)) if (!m[j]) f.push(j); m[f[Math.floor(rnd() * f.length)]] = 1; c++; }
    } else if (rules.includes('region')) {
      for (const id of new Set(st.regions)) shuffle(st.regions.map((r, i) => r === id ? i : -1).filter(i => i >= 0)).slice(0, st.perRegion).forEach(i => m[i] = 1);
    } else if (rules.includes('noadj')) {
      // 隣接なしは、ランダムな順に置けるマスへ置いていく
      let c = 0;
      for (const i of shuffle([...Array(n).keys()])) { if (c === total) break; if (!neighbors(W, H, i, N8).some(j => m[j])) { m[i] = 1; c++; } }
    } else {
      shuffle([...Array(n).keys()]).slice(0, total).forEach(i => m[i] = 1);
    }
    if (m.reduce((a, b) => a + b, 0) === total && ruleOK(st, m)) return m;
  }
  throw new Error('配置が作れません: ' + st.key);
}

function makeRegions(W, H, k) {
  const n = W * H, target = n / k;
  for (;;) {
    const reg = new Array(n).fill(-1), size = new Array(k).fill(1);
    shuffle([...Array(n).keys()]).slice(0, k).forEach((s, id) => reg[s] = id);
    let left = n - k, stuck = 0;
    while (left > 0 && stuck < 5000) {
      const id = Math.floor(rnd() * k); if (size[id] >= Math.ceil(target)) { stuck++; continue; }
      const f = []; for (let i = 0; i < n; i++) if (reg[i] === id) for (const j of neighbors(W, H, i, N4)) if (reg[j] < 0) f.push(j);
      if (!f.length) { stuck++; continue; }
      reg[f[Math.floor(rnd() * f.length)]] = id; size[id]++; left--;
    }
    if (left === 0) return reg;
  }
}

// ---------- ステージ1つを作る ----------
// 目標レベル L: 「レベル L で解ける」を保ったままヒントを減らし、
// 最後に「レベル L-1 では解けない」「ルールなしでは答えが複数」を満たせば採用。
function build(def) {
  const st = { ...def };
  for (let attempt = 0; attempt < 3000; attempt++) {
    if (st.rules.includes('region') && attempt % 20 === 0) st.regions = makeRegions(st.W, st.H, st.regionCount);
    st.mines = randomLayout(st);
    st.num = st.mines.map((_, i) => scope(st, i).filter(j => st.mines[j]).length);
    const safe = []; for (let i = 0; i < st.W * st.H; i++) if (!st.mines[i]) safe.push(i);
    const rev = new Set(safe);
    // ヒントは削りすぎない(最初に数字が1つしかない、などを避ける)
    const floor = Math.round(st.W * st.H * [0, 0.2, 0.14, 0.09][st.level]);
    for (const i of shuffle(safe.slice())) { if (rev.size <= floor) break; rev.delete(i); if (!solvable(st, rev, st.level)) rev.add(i); }
    if (st.level > 1 && solvable(st, rev, st.level - 1)) continue;
    if (!st.cross && fairByBrute(st, rev, false)) continue;          // ルールなしでも解けるなら不採用
    const stats = { steps: 0, trials: 0 };
    solvable(st, rev, st.level, stats);
    // 上級は、仮定の推理が1回だけで終わる盤面より、何度か必要な盤面を優先
    if (st.level === 3 && stats.trials < 2 && attempt < 1500) continue;
    return {
      key: st.key, level: st.level, rules: st.rules, W: st.W, H: st.H, total: st.total, cross: !!st.cross,
      perRegion: st.perRegion, regions: st.regions,
      mines: st.mines.join(''), revealed: [...rev].sort((a, b) => a - b),
      info: { hints: rev.size, trials: stats.trials, attempts: attempt + 1 },
    };
  }
  throw new Error('作れませんでした: ' + def.key + ' Lv' + def.level);
}

// ---------- ステージ定義: ルール × 3段階 ----------
const DEFS = [
  { key: 'noadj', rules: ['noadj'], sizes: [[5, 5, 5], [6, 6, 7], [7, 7, 10]] },
  { key: 'rowcol', rules: ['rowcol'], sizes: [[5, 5, 5], [6, 6, 6], [7, 7, 7]] },
  { key: 'sym', rules: ['sym'], sizes: [[5, 5, 6], [6, 6, 8], [7, 7, 11]] },
  { key: 'region', rules: ['region'], sizes: [[6, 6, 8, 4], [7, 7, 10, 5], [8, 8, 12, 6]], perRegion: 2 },
  { key: 'cross', rules: [], cross: true, sizes: [[5, 5, 5], [6, 6, 8], [7, 7, 11]] },
  { key: 'connected', rules: ['connected'], sizes: [[5, 5, 5], [6, 6, 8], [7, 7, 10]] },
  { key: 'combo', rules: ['noadj', 'rowcol'], sizes: [[6, 6, 6], [7, 7, 7], [8, 8, 8]] },
];

if (require.main === module) {
  const out = [];
  for (const d of DEFS) for (let L = 1; L <= 3; L++) {
    const [W, H, total, regionCount] = d.sizes[L - 1];
    const t = Date.now();
    const s = build({ key: d.key, level: L, rules: d.rules, cross: d.cross, W, H, total, regionCount, perRegion: d.perRegion });
    out.push(s);
    console.error(`${d.key.padEnd(9)} Lv${L} ${W}x${H} 地雷${total} ヒント${s.info.hints} 仮定${s.info.trials} 試行${s.info.attempts} ${Date.now() - t}ms`);
  }
  require('fs').writeFileSync(__dirname + '/stages.json', JSON.stringify(out));
}

module.exports = { countSolutions, fairByBrute, solvable, grade, scope };
