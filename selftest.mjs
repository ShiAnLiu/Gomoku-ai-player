/**
 * 引擎自测：node selftest.mjs
 * 覆盖：增量计分一致性、必须堵四、必须成五、活三防守、大量对局不输
 */
import { Engine, N, BLACK, WHITE, other, fiveAt } from './engine.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log('  \x1b[32m✓\x1b[0m ' + msg); }
  else { fail++; console.log('  \x1b[31m✗\x1b[0m ' + msg); }
};
const I = (x, y) => x * N + y;
const cell = (i) => ({ x: (i / N) | 0, y: i % N });

/** 一步能连五的所有点 */
function winningMoves(bd, role) {
  const out = [];
  for (let i = 0; i < N * N; i++) {
    if (bd[i] !== 0) continue;
    bd[i] = role;
    if (fiveAt(bd, i / N | 0, i % N, role)) out.push(cell(i));
    bd[i] = 0;
  }
  return out;
}

/** 某方是否下一步就能造出“双威胁”（>=2 个连五点），即已形成必胜 */
function hasDoubleThreat(bd, role) {
  if (winningMoves(bd, role).length > 0) return true;
  for (let i = 0; i < N * N; i++) {
    if (bd[i] !== 0) continue;
    bd[i] = role;
    const w = fiveAt(bd, i / N | 0, i % N, role) || winningMoves(bd, role).length >= 2;
    bd[i] = 0;
    if (w) return true;
  }
  return false;
}

function fresh(limit = 800) {
  const e = new Engine();
  e.timeLimit = limit;
  return e;
}

/* ---------------------------------------------------------------- */
console.log('\n[1] 增量计分与撤销的一致性');
{
  const e = fresh();
  const moves = [[7, 7, BLACK], [7, 8, WHITE], [8, 7, BLACK], [6, 6, WHITE], [8, 8, BLACK], [6, 8, WHITE]];
  for (const [x, y, r] of moves) e.place(x, y, r);
  const e2 = fresh();
  for (const [x, y, r] of moves) e2.place(x, y, r);
  ok(Math.abs(e.total[BLACK] - e2.total[BLACK]) < 1e-9 && Math.abs(e.total[WHITE] - e2.total[WHITE]) < 1e-9,
    '落子后总分 = 重新计算的总分');

  e.remove(8, 8); e.remove(6, 8);
  const e3 = fresh();
  for (const [x, y, r] of moves.slice(0, 4)) e3.place(x, y, r);
  ok(Math.abs(e.total[BLACK] - e3.total[BLACK]) < 1e-9 && Math.abs(e.total[WHITE] - e3.total[WHITE]) < 1e-9,
    '撤销后总分回到中间状态（无残留）');
}

/* ---------------------------------------------------------------- */
console.log('\n[2] 对手已有四子，必须封堵');
{
  const e = fresh();
  [[0, 7, BLACK], [1, 7, BLACK], [2, 7, BLACK], [3, 7, BLACK], [7, 7, WHITE], [7, 8, WHITE]].forEach(([x, y, r]) => e.place(x, y, r));
  const mv = e.think(WHITE);
  ok(mv && mv.x === 4 && mv.y === 7, `堵四：期望 (4,7)，实得 (${mv && mv.x},${mv && mv.y})`);
}

/* ---------------------------------------------------------------- */
console.log('\n[3] 自己能成五，必须成五');
{
  const e = fresh();
  [[0, 7, WHITE], [1, 7, WHITE], [2, 7, WHITE], [3, 7, WHITE],
   [10, 10, BLACK], [11, 11, BLACK], [12, 12, BLACK], [13, 13, BLACK]].forEach(([x, y, r]) => e.place(x, y, r));
  const mv = e.think(WHITE);
  // 白棋有 (4,7) 成五；黑棋也有 (14,14) 成五，但轮到白棋，必须抢先连五
  ok(mv && mv.x === 4 && mv.y === 7, `抢先连五：期望 (4,7)，实得 (${mv && mv.x},${mv && mv.y})`);
}

/* ---------------------------------------------------------------- */
console.log('\n[4] 对手活三，必须化解（不能让其形成活四/双威胁）');
for (const gap of [0, 1]) {
  const e = fresh();
  if (gap === 0) [[5, 7, BLACK], [6, 7, BLACK], [7, 7, BLACK]].forEach(([x, y, r]) => e.place(x, y, r));
  else [[5, 7, BLACK], [6, 7, BLACK], [8, 7, BLACK]].forEach(([x, y, r]) => e.place(x, y, r)); // 跳活三
  e.place(9, 9, WHITE);
  const mv = e.think(WHITE);
  e.place(mv.x, mv.y, WHITE);
  const bad = hasDoubleThreat(e.bd, BLACK);
  ok(!bad, `${gap === 0 ? '连活三' : '跳活三'}：AI 走 (${mv.x},${mv.y}) 后，黑棋无必胜手段`);
  ok(Math.max(Math.abs(mv.x - 6), Math.abs(mv.y - 7)) <= 3, `${gap === 0 ? '连活三' : '跳活三'}：应对落在威胁附近`);
}

/* ---------------------------------------------------------------- */
console.log('\n[5] 对手冲四 + 活三 复合威胁，必须优先堵四');
{
  const e = fresh();
  // 黑：y=7 行上 1,2,3,5，唯一成五点是 (4,7)
  [[1, 7, BLACK], [2, 7, BLACK], [3, 7, BLACK], [5, 7, BLACK]].forEach(([x, y, r]) => e.place(x, y, r));
  // 黑：x=7 列上的活三
  [[7, 2, BLACK], [7, 3, BLACK], [7, 4, BLACK]].forEach(([x, y, r]) => e.place(x, y, r));
  e.place(0, 0, WHITE); e.place(14, 14, WHITE);
  const mv = e.think(WHITE);
  const w = winningMoves(e.bd, BLACK);
  ok(w.length === 1 && mv.x === w[0].x && mv.y === w[0].y,
    `复合威胁：唯一成五点 (${w.map(p => p.x + ',' + p.y).join(' / ')})，实得 (${mv.x},${mv.y})`);
}

/* ---------------------------------------------------------------- */
console.log('\n[6] 与“会堵四的贪心机器人”大量对局（AI 不能输）');
function greedy(e, role, rnd) {
  const w = winningMoves(e.bd, role);
  if (w.length) return w[0];
  const b = winningMoves(e.bd, other(role));
  if (b.length) return b[Math.floor(rnd() * b.length)];
  const cand = [];
  for (let i = 0; i < N * N; i++) {
    if (e.bd[i] !== 0 || e.neighbor[i] === 0) continue;
    cand.push(i);
  }
  if (!cand.length) return { x: 7, y: 7 };
  return cell(cand[Math.floor(rnd() * cand.length)]);
}
// 可复现的伪随机
let seed = 20240607;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const GAMES = Number(process.argv[2]) || 6;
let aiLosses = 0, aiWins = 0, draws = 0;
for (let g = 0; g < GAMES * 2; g++) {
  const aiFirst = g >= GAMES;
  const aiColor = aiFirst ? BLACK : WHITE;
  const e = fresh(Number(process.argv[3]) || 120);
  let turn = BLACK;
  let winner = 0;
  for (let step = 0; step < N * N; step++) {
    let mv;
    if (turn === aiColor) mv = e.think(aiColor);
    else mv = greedy(e, turn, rnd);
    if (!mv) { winner = 0; break; }
    e.place(mv.x, mv.y, turn);
    if (fiveAt(e.bd, mv.x, mv.y, turn)) { winner = turn; break; }
    turn = other(turn);
  }
  if (winner === aiColor) aiWins++;
  else if (winner === 0) draws++;
  else aiLosses++;
}
ok(aiLosses === 0, `共 ${GAMES * 2} 局：AI 胜 ${aiWins}，平 ${draws}，负 ${aiLosses}`);

/* ---------------------------------------------------------------- */
console.log('\n[7] 正式对局耗时');
{
  const e = fresh(1000);
  [[7, 7, BLACK]].forEach(([x, y, r]) => e.place(x, y, r));
  let t = 0;
  for (let k = 0; k < 3; k++) {
    const t0 = performance.now();
    const mv = e.think(WHITE);
    t += performance.now() - t0;
    e.place(mv.x, mv.y, WHITE);
    const b = greedy(e, BLACK, rnd);
    e.place(b.x, b.y, BLACK);
  }
  const avg = t / 3;
  ok(avg < 2500, `平均每步 ${avg.toFixed(0)}ms（限时 1000ms + 开销）`);
}

console.log(`\n结果：\x1b[32m${pass} 通过\x1b[0m，${fail ? '\x1b[31m' + fail + ' 失败\x1b[0m' : '0 失败'}\n`);
process.exit(fail ? 1 : 0);
