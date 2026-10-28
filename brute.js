// stages.json の全ステージを検証する:  node brute.js
//  - 総当たり: ルールありなら「確実に安全なマスを開ける」だけで最後まで開けきれる
//  - 総当たり: ルールなしでは途中で詰まる(十字ステージは数え方自体がルールなので対象外)
//  - 推理ソルバー: 判定した難易度がステージの段階と一致する
const { fairByBrute, grade, scope } = require('./gen.js');
const stages = JSON.parse(require('fs').readFileSync(__dirname + '/stages.json'));
let allOK = true;
for (const s of stages) {
  const st = { ...s, mines: [...s.mines].map(Number) };
  st.num = st.mines.map((_, i) => scope(st, i).filter(j => st.mines[j]).length);
  const t = Date.now();
  const fair = fairByBrute(st, s.revealed, true);
  const needRule = s.cross ? '-' : !fairByBrute(st, s.revealed, false);
  const g = grade(st, s.revealed);
  const ok = fair && needRule !== false && g === s.level;
  if (!ok) allOK = false;
  console.log(`${s.key.padEnd(9)} Lv${s.level}  解ける:${fair}  ルール必須:${needRule}  判定レベル:${g}  ${ok ? 'OK' : 'NG'}  ${Date.now() - t}ms`);
}
console.log(allOK ? '全ステージOK' : 'NGあり');
