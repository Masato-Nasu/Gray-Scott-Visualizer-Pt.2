# PWA Drop-in Kit for Reaction–Diffusion (Imperfect Turing Patterns)

この ZIP は **既存の Reaction–Diffusion アプリに PWA 機能を追加**するための「差し込みキット」です。オフライン対応・ホーム画面インストール・確実な更新（キャッシュバスティング）を実現します。

---

## ✅ すぐにやること（既存の index.html に差し込み）

1. **ファイルを配置**
   - `manifest.json`, `sw.js`, `register-sw.js`, `icon-192.png`, `icon-512.png` を RD アプリのルートに置く。

2. **`index.html` の `<head>` に追記**
   ```html
   <meta name="theme-color" content="#111111">
   <link rel="manifest" href="./manifest.json?v=202511081446">
   <link rel="icon" href="./icon-192.png?v=202511081446">
   ```

3. **`index.html` の末尾（`</body>` 直前）に追記**
   ```html
   <script src="./register-sw.js?v=202511081446"></script>
   ```

> 以上で、**インストール（ホーム画面追加）** と **オフライン起動** が有効化されます。

---

## 🔄 更新が確実に反映されない場合

- `manifest.json` / `sw.js` / `register-sw.js` / `index.html` の参照に付けている `?v=202511081446` を、  新しい日付文字列に更新してください（例：`?v=20251108T1` → `?v=20251108T2`）。
- `sw.js` 内のバージョン `CACHE` 名も自動でユニーク化されるため、**再読み込みで確実に更新**されます。

---

## 🧪 サンプル（不要なら削除OK）

- `index.html` は **PWA組み込み例** です。既存アプリの `index.html` に上記 2 箇所を追加するだけでOK。

---

## ℹ️ 仕様メモ

- **Display:** `standalone`（URLバー非表示）
- **Start URL:** `index.html?v=202511081446`（キャッシュバスター）
- **SW戦略:** オフライン・コアアセットは `install` 時にプリキャッシュ、同一オリジン GET は stale-while-revalidate。
- **即時更新:** 新 SW が `installed` になったら自動 reload（`register-sw.js` 内）。
- **アイコン:** 192/512 の PNG（マスカブル対応）。後で差し替え可。

---

## 👇 よくある質問

- **Q. 既存コードに干渉しますか？**  A. いいえ。`<head>` と `</body>` 前に 1 行ずつ追加するだけです。

- **Q. GPU/WebGL 未対応でも大丈夫？**  A. PWA 自体は問題ありません。RD の描画は、これまで通り CPU フォールバックで動作します。

---

© 2025 RD PWA Kit
