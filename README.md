🧬 Imperfect Turing Patterns

Gray–Scott + diffusiophoresis + hard spheres

“美しく不完全な模様は、拡散と衝突のあいだに生まれる。”

🔗 実行ページ

👉 https://masato-nasu.github.io/Imperfect-Turing-Patterns/

（Chrome / Edge / Safari 推奨）
スマートフォンでは「ホーム画面に追加」で PWA版 としてインストールできます。

🎯 目的と背景

本作は、2025年10月に Matter 誌で報告された
Colorado Boulder 大学の研究
「Imperfect Turing patterns: Diffusiophoretic assembly of hard spheres via reaction–diffusion instabilities」
を参照し、自然界に見られる “美しく不完全な模様” を数理的に再現する試みです。

従来の Gray–Scott 反応拡散に以下の要素を追加しています：

要素	物理的意味	効果
拡散泳動（diffusiophoresis）	拡散中の粒子が他の濃度勾配に引かれる効果	輪郭が立ち、六角や蜂の巣状パターンが出やすい
硬球近似（hard sphere crowding）	細胞サイズのばらつき・衝突による詰まり	模様が寸断され、粒状の“ゆらぎ”が生まれる
半径分布 R	画素ごとに異なる“粒径”	線の太さや間隔が不均一になり、自然さが出る

これにより、
ヒョウの斑点、ハコフグの六角模様、魚の網目のような
秩序と不完全さの共存を表現します。

📂 ファイル構成
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

⚙️ パラメータ一覧
名称	内容	推奨範囲
feed (F) / kill (k)	反応源・抑制項（Gray–Scott基本）	0.02–0.06
du, dv	拡散係数	0.05–0.2
dt	時間ステップ	0.5–1.2
alphaDP	拡散泳動強度（輪郭・六角化）	0.3–1.5
lambdaR	半径による拡散低下	0.5–1.5
betaHS	crowding強度（寸断・粒状）	0.4–0.8
t0HS, t1HS	crowding閾値	0.3〜1.0
noiseAmt	微小ノイズ	0.001〜0.005
🎨 操作のコツ

alphaDP=0, lambdaR=0, betaHS=0 で従来Gray–Scottの安定確認

alphaDP を上げて輪郭をシャープに

lambdaR で線幅や濃淡のばらつきを出す

betaHS を上げて寸断・粒状化を強める

不安定な場合は dt / du / dv を下げる

🧩 プリセット
名前	特徴
Leopard	斑点・輪郭明瞭。α中程度、β中程度
Pufferfish Hex	六角状。α強め、λ強め
Zebra	縞中心、αやや弱
Mosaic	粒状・寸断。β強め
🧠 数理モデル要約
∂
𝑈
∂
𝑡
=
𝐷
𝑈
∇
2
𝑈
−
𝑈
𝑉
2
+
𝐹
(
1
−
𝑈
)
−
𝛼
∇
⋅
(
𝑈
∇
𝑉
)
∂t
∂U
	​

=D
U
	​

∇
2
U−UV
2
+F(1−U)−α∇⋅(U∇V)
∂
𝑉
∂
𝑡
=
𝐷
𝑉
∇
2
𝑉
+
𝑈
𝑉
2
−
(
𝐹
+
𝑘
)
𝑉
∂t
∂V
	​

=D
V
	​

∇
2
V+UV
2
−(F+k)V

ここに、

𝐷
𝑈
,
𝐷
𝑉
D
U
	​

,D
V
	​

 を半径 
𝑅
(
𝑥
,
𝑦
)
R(x,y) で空間的に変調

反応項を crowding 関数で減衰

小ノイズを付加

することで、模様のゆらぎが自発的に現れます。

📱 PWA 利用方法

スマートフォンで実行ページを開く

ブラウザの共有メニューから「ホーム画面に追加」

オフラインでも動作します
（キャッシュ更新時は「全キャッシュ削除」を実行 → 再読み込み）

🧾 引用

Imperfect Turing patterns: Diffusiophoretic assembly of hard spheres via reaction–diffusion instabilities
Matter, 2025年10月号, DOI: 10.1016/j.matt.2025.102513

University of Colorado Boulder News Release
“How animals really get their perfectly imperfect spots and stripes” (2025)

🪶 作者

Masato Nasu & ChatGPT5
