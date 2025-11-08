# Reaction–Diffusion (Safe WebGL Fallbacks)

このサンプルは、**FBO incomplete**, **getProgramParameter: invalid parameter name**, **drawBuffers: BACK or NONE**, **texImage2D ArrayBufferView type mismatch** といった典型的な WebGL エラーを避けるため、以下の対策を入れた堅牢な実装です。

## 対策ポイント

- **WebGL2 前提 + 安全フォールバック**
  - 浮動小数点レンダーターゲットが使える場合は `RGBA16F + HALF_FLOAT`（`EXT_color_buffer_float` あり）、使えない環境では **自動で** `RGBA8 + UNSIGNED_BYTE` に切替。
  - `texImage2D(..., null)` で確保し、**型不一致**（`UNSIGNED_BYTE なのに Float32Array` など）を回避。`texSubImage2D` 時は **配列型を切替**。

- **MRT 未使用（単一アタッチメントのみ）**
  - `drawBuffers` は **単一の `COLOR_ATTACHMENT0` の場合のみ呼び出し**。WebGL1 互換の不要呼び出しを避けます。

- **FBO 完全性チェック**
  - `checkFramebufferStatus` で `FRAMEBUFFER_COMPLETE` を強制確認。失敗時は詳細メッセージを出力。

- **Safe mode**
  - UI のチェックボックス、または `?safe=1` で **FBO を使わない表示モード**に切替（環境依存の問題切り分けに有効）。

## 使い方

1. 任意の静的サーバ（例: VS Code Live Server, `python -m http.server`）でルートをホスト。
2. ブラウザで `index.html` を開く。
3. 右側の UI でパラメータを調整（Feed / Kill / Δt）。
4. もし黒画面やエラーが出る場合は、ページ右の **Safe mode** をオン、または URL に `?safe=1` を付与して再読み込み。

## ディレクトリ

```
/
  index.html
  styles.css
  main.js
  /glsl
    vert.glsl
    sim.frag
    render.frag
```

## よくあるエラーと本実装での回避

- **FBO incomplete**
  - 内部フォーマットとタイプの組み合わせが非対応だと発生。本実装は `EXT_color_buffer_float` の有無を判定して、`RGBA16F/HALF_FLOAT` or `RGBA8/UNSIGNED_BYTE` を自動選択。

- **getProgramParameter: invalid parameter name**
  - WebGL1/2 の定数取り違えで発生。本実装は `LINK_STATUS` のみを参照し、コンパイル／リンクログを詳細出力。

- **drawBuffers: BACK or NONE**
  - 単一アタッチメントで不要な `drawBuffers` を呼ぶと出る。本実装は **単一時のみ `COLOR_ATTACHMENT0` を指定**、MRT を使っていません。

- **texImage2D: UNSIGNED_BYTE but ArrayBufferView not Uint8Array**
  - `UNSIGNED_BYTE` へ `Float32Array` を突っ込むと出る。本実装は **確保は null で行い、`texSubImage2D` では型を切替**。

## 既知の制約

- モバイルや企業管理下の GPU/ドライバでは float のレンダーターゲットが禁止の場合あり。その場合は自動的に `RGBA8` に落ちます。
- さらに厳しい環境では **Safe mode** をオンにしてください（FBO を使わず表示のみ）。

---

© 2025
