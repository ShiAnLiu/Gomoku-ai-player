/**
 * ============================================================
 *  五子棋 AI 引擎（纯逻辑，无渲染依赖，浏览器 / Node 均可运行）
 * ------------------------------------------------------------
 *  设计目标：让程序尽可能“不可战胜”，核心由四层防线组成
 *
 *   第 1 层  直接成五：自己能连五立刻连五
 *   第 2 层  挡住成五：对手下一步能连五，必须堵
 *   第 3 层  棋型评估：活四 / 冲四 / 活三 / 眠三 … 全量打分，
 *            并采用“防守加权”（对手分数 ×1.15），宁可少攻不可漏防
 *   第 4 层  迭代加深 α-β 搜索：默认搜到 6~8 层，配合启发式着法排序，
 *            能在 1 秒内看穿“活三 → 活四 → 连五”等强制序列
 *
 *  另外做了两条工程优化，保证搜索够深：
 *   · 每条“线”（横/竖/斜/反斜）维护增量分数，落子只重算经过它的 4 条线
 *   · 9 格窗口查表（3^9 预计算）用于着法排序，O(1) 得到某点的棋型分
 * ============================================================
 */

export const N = 15;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

export const other = (r) => (r === BLACK ? WHITE : BLACK);

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

const INF = Infinity;
const WIN = 50000000;

/* ---------------- 棋型表（分数从高到低，1=己方 2=对方/墙 0=空） ------------- */
const PATTERNS = [
  ['11111', 10000000], // 连五
  ['011110', 1000000], // 活四
  ['011112', 100000],  // 冲四
  ['211110', 100000],
  ['11011', 100000],
  ['10111', 100000],
  ['11101', 100000],
  ['01110', 80000],    // 活三
  ['010110', 80000],
  ['011010', 80000],
  ['001112', 5000],    // 眠三
  ['211100', 5000],
  ['010112', 5000],
  ['211010', 5000],
  ['011012', 5000],
  ['210110', 5000],
  ['10011', 5000],
  ['11001', 5000],
  ['10101', 5000],
  ['001100', 3000],    // 活二
  ['001010', 3000],
  ['010100', 3000],
  ['000100', 200],     // 单子
  ['001000', 200],
];

function matchScore(s) {
  for (let i = 0; i < PATTERNS.length; i++) {
    if (s.indexOf(PATTERNS[i][0]) !== -1) return PATTERNS[i][1];
  }
  return 0;
}

/* ---------------- 3^9 窗口查表：给一个点的四个方向快速定棋型分 ------------- */
const POW3 = [1, 3, 9, 27, 81, 243, 729, 2187, 6561];
const WINDOW_TABLE = new Int32Array(19683);
const FOUR_TABLE = new Uint8Array(19683); // 在此点落子后，是否形成“四”（下一步可连五）

/** 窗口内是否还能补一子凑成五连（用于判定“这一手成四”） */
function hasFourCompletion(s) {
  for (let j = 0; j < 9; j++) {
    if (s[j] !== '0') continue;
    const t = s.substring(0, j) + '1' + s.substring(j + 1);
    if (t.indexOf('11111') !== -1) return true;
  }
  return false;
}

for (let code = 0; code < 19683; code++) {
  let s = '';
  for (let i = 0; i < 9; i++) {
    const d = Math.floor(code / POW3[i]) % 3;
    s += d === 0 ? '0' : d === 1 ? '1' : '2';
  }
  if (s[4] !== '1') continue; // 中心必定是刚落下的子，其它情况无需计算
  WINDOW_TABLE[code] = matchScore(s);
  FOUR_TABLE[code] = hasFourCompletion(s) ? 1 : 0;
}

/** 在 (x,y) 落 role 这一子，四个方向棋型分之和（用于着法排序） */
function pointScore(bd, x, y, role) {
  let total = 0;
  for (let d = 0; d < 4; d++) {
    const dx = DIRS[d][0];
    const dy = DIRS[d][1];
    let code = 0;
    for (let k = -4; k <= 4; k++) {
      let v;
      if (k === 0) {
        v = 1; // 中心就是假想落下的那颗子
      } else {
        const nx = x + dx * k;
        const ny = y + dy * k;
        if (nx < 0 || nx >= N || ny < 0 || ny >= N) {
          v = 2; // 出界视作被堵
        } else {
          const c = bd[nx * N + ny];
          v = c === role ? 1 : c === EMPTY ? 0 : 2;
        }
      }
      code += v * POW3[k + 4];
    }
    total += WINDOW_TABLE[code];
  }
  return total;
}

/** 在 (x,y) 落 role 子后，是否形成“四”（对方必须应对的强制手） */
function makesFour(bd, x, y, role) {
  for (let d = 0; d < 4; d++) {
    const dx = DIRS[d][0];
    const dy = DIRS[d][1];
    let code = 0;
    for (let k = -4; k <= 4; k++) {
      let v;
      if (k === 0) v = 1;
      else {
        const nx = x + dx * k;
        const ny = y + dy * k;
        if (nx < 0 || nx >= N || ny < 0 || ny >= N) v = 2;
        else {
          const c = bd[nx * N + ny];
          v = c === role ? 1 : c === EMPTY ? 0 : 2;
        }
      }
      code += v * POW3[k + 4];
    }
    if (FOUR_TABLE[code]) return true;
  }
  return false;
}

/** 判断刚落下的 (x,y) 是否连成五子 */
export function fiveAt(bd, x, y, role) {
  for (let d = 0; d < 4; d++) {
    const dx = DIRS[d][0];
    const dy = DIRS[d][1];
    let cnt = 1;
    for (let s = 1; s < 5; s++) {
      const nx = x + dx * s;
      const ny = y + dy * s;
      if (nx < 0 || nx >= N || ny < 0 || ny >= N || bd[nx * N + ny] !== role) break;
      cnt++;
    }
    for (let s = 1; s < 5; s++) {
      const nx = x - dx * s;
      const ny = y - dy * s;
      if (nx < 0 || nx >= N || ny < 0 || ny >= N || bd[nx * N + ny] !== role) break;
      cnt++;
    }
    if (cnt >= 5) return true;
  }
  return false;
}

/** 返回构成五连的那几个点（用于画胜利连线），没有则 null */
export function fiveLine(bd, x, y, role) {
  for (let d = 0; d < 4; d++) {
    const dx = DIRS[d][0];
    const dy = DIRS[d][1];
    const cells = [{ x, y }];
    for (let s = 1; s < 5; s++) {
      const nx = x + dx * s;
      const ny = y + dy * s;
      if (nx < 0 || nx >= N || ny < 0 || ny >= N || bd[nx * N + ny] !== role) break;
      cells.push({ x: nx, y: ny });
    }
    for (let s = 1; s < 5; s++) {
      const nx = x - dx * s;
      const ny = y - dy * s;
      if (nx < 0 || nx >= N || ny < 0 || ny >= N || bd[nx * N + ny] !== role) break;
      cells.unshift({ x: nx, y: ny });
    }
    if (cells.length >= 5) return cells;
  }
  return null;
}

/* ------------------------------ 棋盘“线”的划分 ---------------------------- */
/* 横 15 条 + 竖 15 条 + 主对角 29 条 + 副对角 29 条 = 88 条线，
   每个交叉点恰好属于 4 条线，落子时只重算这 4 条线即可增量更新全局分 */
const LINES = [];
const CELL_LINES = Array.from({ length: N * N }, () => []);

function addLine(cells) {
  if (!cells.length) return;
  const id = LINES.length;
  LINES.push(cells);
  for (let i = 0; i < cells.length; i++) CELL_LINES[cells[i]].push(id);
}

(function buildLines() {
  for (let y = 0; y < N; y++) {
    const a = [];
    for (let x = 0; x < N; x++) a.push(x * N + y);
    addLine(a);
  }
  for (let x = 0; x < N; x++) {
    const a = [];
    for (let y = 0; y < N; y++) a.push(x * N + y);
    addLine(a);
  }
  for (let s = 0; s < 2 * N - 1; s++) {
    const a = [];
    for (let x = 0; x < N; x++) {
      const y = x - s;
      if (y >= 0 && y < N) a.push(x * N + y);
    }
    addLine(a);
  }
  for (let s = 0; s < 2 * N - 1; s++) {
    const a = [];
    for (let x = 0; x < N; x++) {
      const y = s - x;
      if (y >= 0 && y < N) a.push(x * N + y);
    }
    addLine(a);
  }
})();

const NUM_LINES = LINES.length;

/** 把一条线解码成字符串（两端补 '2' 当墙）后查棋型表 */
function scoreCode(code, len) {
  let s = '2';
  for (let i = len - 1; i >= 0; i--) {
    const d = Math.floor(code / POW3[i]) % 3;
    s += d === 0 ? '0' : d === 1 ? '1' : '2';
  }
  s += '2';
  return matchScore(s);
}

/* ================================ 引擎 =================================== */
const TIME_LIMIT = 1000; // 每步思考上限（毫秒，可在实例上调整）
const ROOT_WIDTH = 18;   // 根节点候选数
const MAX_DEPTH = 8;     // 迭代加深最大深度

function widthForDepth(depth) {
  if (depth >= 5) return 8;
  if (depth >= 3) return 12;
  return 16;
}

export class Engine {
  constructor() {
    this.bd = new Int8Array(N * N);
    this.neighbor = new Int8Array(N * N); // 邻域内（切比雪夫距离≤2）有多少子
    this.ls = new Int32Array(NUM_LINES * 2); // 每条线两个角色的分数
    this.total = new Float64Array(3); // 双方总分
    this.lcache = new Map();
    this.stoneCount = 0;

    this.nodes = 0;
    this.deadline = 0;
    this.aborted = false;
    this.lastValue = 0;
    this.lastDepth = 0;
    this.timeLimit = TIME_LIMIT;
    this.nodeLimit = 0; // >0 时改用“节点数上限”代替时间上限（便于确定性测试）

    // VCF（连续冲四）搜索状态
    this.vcfNodes = 0;
    this.vcfBudget = 0;
    this.vcfAborted = false;
    this.vcfMove = null;
  }

  reset() {
    this.bd.fill(0);
    this.neighbor.fill(0);
    this.ls.fill(0);
    this.total.fill(0);
    this.lcache.clear();
    this.stoneCount = 0;
    this.lastValue = 0;
  }

  /* ------------------------------ 落子 / 撤销 ----------------------------- */
  place(x, y, role) {
    const i = x * N + y;
    this.bd[i] = role;
    this.stoneCount++;
    this.updateNeighbor(i, 1);
    this.updateLines(i);
  }

  remove(x, y) {
    const i = x * N + y;
    this.bd[i] = EMPTY;
    this.stoneCount--;
    this.updateNeighbor(i, -1);
    this.updateLines(i);
  }

  updateNeighbor(i, delta) {
    const x = (i / N) | 0;
    const y = i % N;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;
        this.neighbor[nx * N + ny] += delta;
      }
    }
  }

  updateLines(i) {
    const ids = CELL_LINES[i];
    for (let k = 0; k < ids.length; k++) {
      const id = ids[k];
      const b = id * 2;
      const oldB = this.ls[b];
      const oldW = this.ls[b + 1];
      const nb = this.lineScore(id, BLACK);
      const nw = this.lineScore(id, WHITE);
      this.ls[b] = nb;
      this.ls[b + 1] = nw;
      this.total[BLACK] += nb - oldB;
      this.total[WHITE] += nw - oldW;
    }
  }

  lineScore(id, role) {
    const cells = LINES[id];
    const len = cells.length;
    let code = 0;
    for (let k = 0; k < len; k++) {
      const v = this.bd[cells[k]];
      code = code * 3 + (v === EMPTY ? 0 : v === role ? 1 : 2);
    }
    const key = code * 16 + len;
    let s = this.lcache.get(key);
    if (s === undefined) {
      s = scoreCode(code, len);
      if (this.lcache.size > 400000) this.lcache.clear();
      this.lcache.set(key, s);
    }
    return s;
  }

  /* ------------------------------- 评估函数 ------------------------------ */
  evaluate(role) {
    const my = this.total[role];
    const op = this.total[other(role)];
    // 防守加权：宁可稍微少进攻，也绝不漏掉对手的威胁
    // 取整是为了避免浮点噪声让根节点把“被剪枝的边界值”误当成更好的着法
    return Math.round(my - op * 1.15);
  }

  /* ------------------------------- 着法生成 ------------------------------ */
  genMoves(role, limit) {
    const opp = other(role);
    const bd = this.bd;
    const nb = this.neighbor;
    const list = [];
    for (let i = 0; i < N * N; i++) {
      if (bd[i] !== EMPTY || nb[i] === 0) continue;
      const x = (i / N) | 0;
      const y = i % N;
      const s = pointScore(bd, x, y, role) + pointScore(bd, x, y, opp) * 0.9;
      list.push({ i, x, y, s });
    }
    list.sort((a, b) => b.s - a.s);
    return list.length > limit ? list.slice(0, limit) : list;
  }

  /** 找出 role 一步就能连五的点 */
  findFive(role) {
    const w = this.winPoints(role);
    return w.length ? w[0] : null;
  }

  /** 全盘扫描：所有能让 role 立刻连五的空点 */
  winPoints(role) {
    const bd = this.bd;
    const out = [];
    for (let i = 0; i < N * N; i++) {
      if (bd[i] !== EMPTY || this.neighbor[i] === 0) continue;
      const x = (i / N) | 0;
      const y = i % N;
      bd[i] = role;
      const ok = fiveAt(bd, x, y, role);
      bd[i] = EMPTY;
      if (ok) out.push({ x, y, i });
    }
    return out;
  }

  /** 刚落下的 (x,y) 还有哪些点可以补成五（只扫经过它的 4 条线，足够快） */
  completions(role, x, y) {
    const bd = this.bd;
    const out = [];
    for (let d = 0; d < 4; d++) {
      const dx = DIRS[d][0];
      const dy = DIRS[d][1];
      for (let k = -4; k <= 4; k++) {
        if (k === 0) continue;
        const nx = x + dx * k;
        const ny = y + dy * k;
        if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;
        const i = nx * N + ny;
        if (bd[i] !== EMPTY) continue;
        bd[i] = role;
        const ok = fiveAt(bd, nx, ny, role);
        bd[i] = EMPTY;
        if (!ok) continue;
        let dup = false;
        for (let t = 0; t < out.length; t++) {
          if (out[t].i === i) { dup = true; break; }
        }
        if (!dup) out.push({ x: nx, y: ny, i });
      }
    }
    return out;
  }

  /** 所有“落子即成四”的强制手，按威胁大小排序 */
  fourMoves(role) {
    const bd = this.bd;
    const out = [];
    for (let i = 0; i < N * N; i++) {
      if (bd[i] !== EMPTY || this.neighbor[i] === 0) continue;
      const x = (i / N) | 0;
      const y = i % N;
      if (makesFour(bd, x, y, role)) {
        out.push({ x, y, i, s: pointScore(bd, x, y, role) });
      }
    }
    out.sort((a, b) => b.s - a.s);
    return out;
  }

  /* ---------------- VCF：连续冲四（含活四）必胜搜索 ---------------- */
  /**
   * role 能否用“连续冲四”的方式强行取胜
   * 进攻方只下四（对方必须应），防守方每步只有唯一解，分支极小，因此能搜得很深
   * @returns {boolean} 能找到必胜手段返回 true，结果放在 this.vcfMove
   */
  vcf(role, maxDepth, budget = 4000) {
    const opp = other(role);
    this.vcfNodes = 0;
    this.vcfBudget = budget;
    this.vcfAborted = false;
    this.vcfMove = null;

    const w = this.winPoints(role);
    if (w.length) { this.vcfMove = w[0]; return true; }
    if (this.winPoints(opp).length) return false; // 对方已有一手成五，冲四来不及

    return this.vcfSearch(role, maxDepth, true);
  }

  vcfSearch(role, depth, isRoot) {
    if (++this.vcfNodes > this.vcfBudget) { this.vcfAborted = true; return false; }
    if ((this.vcfNodes & 127) === 0 && this.nodeLimit === 0 && performance.now() > this.deadline) { this.vcfAborted = true; return false; }
    if (depth <= 0) return false;

    const opp = other(role);
    const moves = this.fourMoves(role);

    for (let mi = 0; mi < moves.length; mi++) {
      const c = moves[mi];
      this.place(c.x, c.y, role);

      const comp = this.completions(role, c.x, c.y);
      if (comp.length >= 2) {
        // 活四：两个成五点，对方堵不住
        this.remove(c.x, c.y);
        if (isRoot) this.vcfMove = c;
        return true;
      }
      if (comp.length === 0) {
        this.remove(c.x, c.y);
        continue;
      }
      // 对方能不能先自己连五
      if (this.winPoints(opp).length > 0) {
        this.remove(c.x, c.y);
        continue;
      }
      // 对方只能堵这一个点
      const blk = comp[0];
      this.place(blk.x, blk.y, opp);
      const ok = this.vcfSearch(role, depth - 1, false);
      this.remove(blk.x, blk.y);
      this.remove(c.x, c.y);

      if (ok) {
        if (isRoot) this.vcfMove = c;
        return true;
      }
      if (this.vcfAborted) return false;
    }
    return false;
  }

  /* ------------------------------- 搜索核心 ------------------------------ */
  alphabeta(depth, alpha, beta, role) {
    this.nodes++;
    if (this.nodeLimit > 0 && this.nodes > this.nodeLimit) this.aborted = true;
    else if ((this.nodes & 511) === 0 && this.nodeLimit === 0 && performance.now() > this.deadline) this.aborted = true;
    if (this.aborted) return 0;
    if (depth <= 0) return this.evaluate(role);

    const moves = this.genMoves(role, widthForDepth(depth));
    if (moves.length === 0) return this.evaluate(role);

    const opp = other(role);
    let best = -INF;
    for (let k = 0; k < moves.length; k++) {
      const mv = moves[k];
      this.place(mv.x, mv.y, role);
      let val;
      if (fiveAt(this.bd, mv.x, mv.y, role)) {
        val = WIN - (10 - depth); // 越早赢分越高
      } else {
        val = -this.alphabeta(depth - 1, -beta, -alpha, opp);
      }
      this.remove(mv.x, mv.y);
      if (this.aborted) return 0;
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break; // α-β 剪枝
    }
    return best;
  }

  rootSearch(depth, role, moves) {
    const opp = other(role);
    if (!moves) moves = this.genMoves(role, ROOT_WIDTH);
    let alpha = -INF;
    let bestVal = -INF;
    let bestMove = null;
    const results = [];
    for (let k = 0; k < moves.length; k++) {
      const mv = moves[k];
      this.place(mv.x, mv.y, role);
      let val;
      if (fiveAt(this.bd, mv.x, mv.y, role)) val = WIN;
      else val = -this.alphabeta(depth - 1, -INF, -alpha, opp);
      this.remove(mv.x, mv.y);
      if (this.aborted) break;
      results.push({ mv, val });
      if (val > bestVal) {
        bestVal = val;
        bestMove = mv;
      }
      if (val > alpha) alpha = val;
    }
    results.sort((a, b) => b.val - a.val);
    this.rootResults = results; // 供后续“安全校验”按优劣顺序逐个检查
    return { move: bestMove, value: bestVal };
  }

  /* ------------------------------- 对外接口 ------------------------------ */
  /**
   * 计算 role 的最佳着法
   * @returns {{x:number,y:number}|null}
   */
  think(role) {
    if (this.stoneCount === 0) return { x: 7, y: 7 }; // 空盘走天元

    const opp = other(role);

    // 1) 自己能连五，直接赢
    const win = this.findFive(role);
    if (win) return { x: win.x, y: win.y };

    // 2) 对手能连五，必须堵
    const blk = this.findFive(opp);
    if (blk) return { x: blk.x, y: blk.y };

    const start = performance.now();
    const totalDeadline = start + this.timeLimit;
    this.nodes = 0;
    this.aborted = false;
    this.lastDepth = 0;

    // 3) 进攻：自己有没有“连续冲四”的必胜杀招
    this.deadline = Math.min(totalDeadline, start + this.timeLimit * 0.25);
    if (this.vcf(role, 8, 5000) && this.vcfMove) {
      return { x: this.vcfMove.x, y: this.vcfMove.y };
    }

    // 4) 主搜索：迭代加深，越搜越深，超时就停，保留上一层最优着
    this.deadline = Math.min(totalDeadline, start + this.timeLimit * 0.72);
    const rootMoves = this.genMoves(role, ROOT_WIDTH);
    let best = rootMoves.length ? rootMoves[0] : null;
    this.rootResults = null;
    let bestResults = null; // 只采用“完整搜完的那一层”的结果
    for (let d = 2; d <= MAX_DEPTH; d += 2) {
      const r = this.rootSearch(d, role, rootMoves);
      if (this.aborted) break;
      if (r.move) {
        best = r.move;
        bestResults = this.rootResults;
        this.lastValue = r.value;
        this.lastDepth = d;
      }
      if (r.value >= WIN - 100000) break; // 已算出必胜，收工
      if (performance.now() > this.deadline) break;
    }

    // 5) 安全校验（“不会输”的关键保险）：
    //    按优劣顺序检查候选着法，排除“下完之后对手能连续冲四取胜”的点
    if (bestResults && bestResults.length) {
      this.deadline = totalDeadline;
      const n = Math.min(bestResults.length, 6);
      for (let i = 0; i < n; i++) {
        const mv = bestResults[i].mv;
        this.place(mv.x, mv.y, role);
        const danger = this.vcf(opp, 8, 2500);
        this.remove(mv.x, mv.y);
        if (!danger) return { x: mv.x, y: mv.y };
        if (performance.now() > this.deadline) break;
      }
    }

    return best ? { x: best.x, y: best.y } : null;
  }
}

