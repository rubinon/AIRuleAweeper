ルールスイーパー(条件つきマインスイーパー試作)

rulesweeper.html … ゲーム本体。ダブルクリックでブラウザが開きます。
gen.js           … ステージ生成スクリプト(7ルール × 初級・中級・上級 = 21ステージ)。
brute.js         … 全ステージの検証スクリプト。
stages.json      … 生成されたステージデータ。
template.html    … ゲームのひな形(__STAGES__ の部分に stages.json を埋め込むと完成)。

■ 難易度の決め方(gen.js の推理ソルバー)
  初級: 1つの数字・1つのルールだけで決まるマスを順に開けていけば解ける
  中級: 2つの条件(数字どうし、数字と行など)を見比べる推理が必要
  上級: 「ここが地雷だと仮定すると矛盾する」という仮定の推理が必要
  「その段階の推理で解けて、1つ下の段階では解けない」盤面だけを採用しています。

■ brute.js が確認すること
  ・総当たりで、ルールありなら確実に安全なマスを開けるだけで最後まで解ける
  ・総当たりで、ルールなしでは途中で詰まる(=ルールが必要)
  ・推理ソルバーの判定レベルがステージの段階と一致する

■ ステージを作り直す手順(Node.js が必要)
  node gen.js 2026        ← 数字(シード値)を変えると別の盤面になる
  node brute.js           ← 「全ステージOK」と出れば合格
  node -e "const fs=require('fs');fs.writeFileSync('game.html','<!doctype html><meta charset=utf-8><meta name=viewport content=\'width=device-width,initial-scale=1\'>'+fs.readFileSync('template.html','utf8').replace('__STAGES__',fs.readFileSync('stages.json','utf8')))"

■ ルールを足すとき
  gen.js の ruleOK(完成形の判定)・ruleStep(1手の推理)・randomLayout(配置の作り方)・DEFS(盤面サイズ)と、
  template.html の GROUPS / ruleText に1つずつ書き足します。
