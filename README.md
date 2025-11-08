# Gray‑Scott Visualizer — Imperfect (Mobile)
スマホで**実行画面が見えない/重い**を解消した最小構成。

- `100svh` と `sticky` でキャンバスを常に最上部に表示
- 端末では内部解像度を `384×384` に落として**まず確実に描画**
- 起動直後 2.5s の **FastFill** で一気に画面を埋める
- 音声RMSは **内蔵実装**（Meyda不要）
- UIは**等幅ボタン**のみを縦並び。曲名はLCDで右→左スクロール
- PWA/Service Workerは同梱しない（キャッシュ起因の不具合を回避）

## 使い方
1. 解凍して `index.html` を開く
2. **SELECT MUSIC FOLDER / FILES** で音源を選択（iOSはフォルダ不可・複数可）
3. PLAY で再生。タップでAudioContextが解放され、模様が音に反応します
