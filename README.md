# Reaction–Diffusion (Gray–Scott) — Safe

堅牢な WebGL2 実装に、**Safe（RG8）** と **CPU フォールバック**を搭載した反応拡散デモです。  
「Initializing…」のまま止まる環境でも、**Safe** または **CPU** ボタンで確実に動きます。

## 使い方

1. ローカルに展開して、できれば**ローカルサーバ**で `index.html` を開きます。  
   例）Python: `python -m http.server 8080` → `http://localhost:8080/`
2. 画面右の **Seed** で初期スポットを追加、**Reset** で初期化。
3. **Safe** … WebGL2 の RG8（整数テクスチャ）固定モード。FBO 周りの互換性問題を回避。  
   **CPU** … JavaScript の純 CPU 実装（遅いが確実）。
4. F/k, Du/Dv を調整するとパターンが変わります。

## 仕様

- WebGL2 が使えれば、RG8 テクスチャ + 2枚の Ping-Pong FBO で Gray–Scott をシミュレート
- 失敗時は例外を拾って **CPU フォールバック**（キャンバスに ImageData 描画）
- 典型的な落とし穴（`drawBuffers`/MRT 前提、float テクスチャ非対応、FBO incomplete など）を回避
- クエリで `?safe=1` または `?cpu=1` も指定可能

## よくある質問

- **「Initializing…」のまま動かない**  
  → 右側の **Safe** か **CPU** を押してください。GPU/ドライバの制限が強い端末でも動作します。
- **ローカルファイルで開くと動かない**  
  → ブラウザのセキュリティ設定によってはブロックされます。ローカルサーバ経由で開いてください。

## ライセンス

MIT