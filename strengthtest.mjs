import { Engine, N, BLACK, WHITE, other, fiveAt } from './engine.js';
const log = [];
function playGame(blackNodes, whiteNodes) {
  const e = new Engine();
  e.timeLimit = 60000;
  let turn = BLACK;
  for (let step = 0; step < N*N; step++) {
    e.nodeLimit = turn === BLACK ? blackNodes : whiteNodes;
    const mv = e.think(turn);
    if (!mv) return 0;
    e.place(mv.x, mv.y, turn);
    if (fiveAt(e.bd, mv.x, mv.y, turn)) return turn;
    turn = other(turn);
  }
  return 0;
}
const STRONG = Number(process.argv[2]) || 40000;
const WEAK = Number(process.argv[3]) || 6000;
let sw = 0, sl = 0, d = 0;
for (let r = 0; r < 3; r++) {
  let w = playGame(WEAK, STRONG);
  console.log(`  [${r}] 强方执白 → ${w === BLACK ? '负' : w === WHITE ? '胜' : '平'}`);
  if (w === BLACK) sl++; else if (w === WHITE) sw++; else d++;
  w = playGame(STRONG, WEAK);
  console.log(`  [${r}] 强方执黑 → ${w === WHITE ? '负' : w === BLACK ? '胜' : '平'}`);
  if (w === WHITE) sl++; else if (w === BLACK) sw++; else d++;
}
console.log(`\n强方(${STRONG}节点) vs 弱方(${WEAK}节点)：胜 ${sw} 平 ${d} 负 ${sl}`);
