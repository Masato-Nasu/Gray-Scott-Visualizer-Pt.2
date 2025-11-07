# Imperfect Turing Patterns (Gray–Scott + diffusiophoresis + hard spheres)

**目的**  
Colorado Boulder の 2025年『Matter』掲載研究の要点を取り入れ、
従来の Gray–Scott 反応拡散に **拡散泳動（diffusiophoresis）** と
**粒径ばらつきを持つ硬球近似（crowding）** を加え、
“美しく不完全”な自然模様（輪郭のシャープさ＋サイズばらつき／寸断／粒状）を再現します。

- U 式に \(-\alpha \nabla\cdot(U\nabla V)\) を追加（輪郭が立つ、六角模様が出やすい）
- 画素ごと半径 R を与え、 \(D_U, D_V\) や反応項を **R で空間変調**（太さの不均一、詰まりで寸断）

## ファイル構成

```
index.html
main.js
manifest.json
sw.js
shaders/
  ├─ pass.vert
  ├─ sim.frag
  └─ vis.frag
icons/
  ├─ icon-192.png
  └─ icon-512.png
```

## 実行方法（ローカル）

1. 任意のローカルHTTPサーバで配信（PWAは file:// では動きません）  
   例: Python
   ```bash
   python3 -m http.server -d . 8080
   # → http://localhost:8080/
   ```

2. ブラウザで開く（WebGL2 が必要）。右上の「PWA インストール」か、ブラウザの「ホーム画面に追加」。

## GitHub Pages への配置

この一式をそのままリポジトリに置き、Pages のルートを `/` に設定してください。  
**確実更新**のため、`sw.js` 内の `CACHE` 文字列（バージョン）を更新する運用がおすすめです。

## パラメータ

- **feed (F), kill (k), du, dv, dt** … Gray–Scott 基本
- **alphaDP** … 拡散泳動（輪郭のシャープ化、六角化）
- **lambdaR** … 半径 R による拡散低下の強さ（太さ不均一）
- **betaHS** … crowding（硬球近似）強度（寸断・粒状感）
- **t0HS, t1HS** … crowding 閾値レンジ
- **noiseAmt** … 自然ゆらぎ（0.001〜0.005 程度）

## 操作のコツ

1. まずは **alphaDP=0, lambdaR=0, betaHS=0** で従来のパターンが安定するか確認
2. **alphaDP** を少しずつ上げて輪郭を立てる
3. **lambdaR** を上げて線の太さの不均一を出す
4. **betaHS** を上げて寸断や粒状感を足す
5. 発散する場合は **dt/du/dv** を少し下げる

## プリセット
- **Leopard** … 斑点＋輪郭。alphaDP控えめ、betaHS中程度
- **Pufferfish Hex** … 六角傾向。alphaDP強、lambdaRやや強
- **Zebra** … 縞中心
- **Mosaic** … 粒状・寸断を強めたモザイク調

## 既存 Gray-Scott-Visualizer への組み込み方（概要）

- `uRadius` テクスチャを**固定場**として追加し、シミュレーションのフラグメント側で
  `DUeff, DVeff, reactAtten` を R により空間変調します。
- U 式に `-alphaDP * div(U ∇V)` を追加（`∇` は中央差分）。
- 新しい uniform（alphaDP, lambdaR, betaHS, t0HS, t1HS, noiseAmt）を追加し、
  0 にすれば従来挙動にフォールバックできます。

---

© 2025
