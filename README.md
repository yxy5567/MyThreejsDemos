# MyThreejsDemos

用 Three.js / Canvas 做的几个可直接在浏览器打开的网页小游戏。

| 目录 | 游戏 | 说明 |
| --- | --- | --- |
| [`emberspire/game/`](emberspire/game/) | 余烬尖塔 | 卡牌 + 爬塔（HD-2D：3D 场景 + 像素精灵） |
| [`holdem/dist/`](holdem/dist/) | 午夜德州 · Hold'em | 德州扑克 |
| [`midnighthand/release/`](midnighthand/release/) | 午夜之手 · Midnight Hand | 卡牌 |
| [`vampiresurvival/dist/`](vampiresurvival/dist/) | 夜幕幸存者 | 幸存者类 Roguelike |

## 目录约定

- `emberspire/game/`、`holdem/dist/`、`midnighthand/release/`、`vampiresurvival/dist/`：各游戏入口、代码和正式资源，均纳入 Git。
- `emberspire/tools/`：素材处理脚本，纳入 Git。
- `emberspire/work/`、`holdem/scratch/`、`vampiresurvival/scratch/`、旧的 `_pl/`：临时素材、截图和备份，仅保留在本地，不纳入 Git。
- Git 不记录空目录；克隆后临时目录可能不存在，可在需要时创建。

## 运行

纯静态页面，无需构建。直接双击上表目录中的 `index.html`，或在仓库根目录起一个本地服务器：

```bash
python -m http.server 8000
```

然后访问 <http://localhost:8000/>。
