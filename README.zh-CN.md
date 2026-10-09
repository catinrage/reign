<div align="center">

# 👑 Reign

**在浏览器里，于一座手工打造的体素小岛上开拓、交易与建设。**

[English](README.md) · [Русский](README.ru.md) · **简体中文** · [Deutsch](README.de.md)

[![试玩人机演示](https://img.shields.io/badge/%E8%AF%95%E7%8E%A9-%E4%BA%BA%E6%9C%BA%E6%BC%94%E7%A4%BA-f5b301?style=for-the-badge)](https://reign-khaki.vercel.app)

![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white)
![Svelte](https://img.shields.io/badge/Svelte-5-ff3e00?logo=svelte&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-r180-000000?logo=threedotjs&logoColor=white)
![Node](https://img.shields.io/badge/Node-%E2%89%A520-339933?logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169e1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&logoColor=white)

<img src="docs/screenshots/home.jpg" alt="Reign 主菜单，桌上摆着体素小岛" width="100%">

</div>

Reign 是一款多人在线游戏，重新演绎了经典的“开拓、交易、建设”桌游。它由微型体素构建，直接在浏览器中运行。
每一块地形、每一枚棋子、骰子、卡牌堆，以及桌边温馨的房间，全都由细小的体素组成并在运行时实时生成网格。
你可以与好友或机器人玩完整的经典规则，也可以切换到 **Reign Extended**：带技能的角色、事件牌堆、新建筑，
以及任意形状和大小的岛屿。

> **立即试玩：** [reign-khaki.vercel.app](https://reign-khaki.vercel.app) 提供纯人机版本，
> 无需注册，无需安装。

> 游戏界面目前为英文，因此下文中的技能、事件和按钮名称保留游戏内的英文写法。

## 目录

- [亮点](#亮点)
- [截图](#截图)
- [游戏模式](#游戏模式)
- [一起玩](#一起玩)
- [快速开始](#快速开始)
- [运行 Reign](#运行-reign)
- [配置](#配置)
- [操作](#操作)
- [开发作弊面板](#开发作弊面板)
- [技术架构](#技术架构)
- [添加内容](#添加内容)
- [测试](#测试)

## 亮点

- 🎲 **完整的基础游戏。** 随机生成的 19 格岛屿和港口、蛇形顺序的开局摆放、掷骰产出、强盗、发展卡、
  最长道路与最大骑士团、与银行、港口和玩家之间的交易，先到 10 分者获胜。
- 🧱 **生机勃勃的体素世界。** 随风摇曳的庄稼、吃草的羊群、浅滩上的浪花、真实滚动的骰子、
  从地块飞进手牌的卡牌，以及环绕牌桌的温暖酒馆。
- 🏰 **Reign Extended。** 16 名拥有特性与技能的角色、角色轮选、13 张事件牌、作坊、石板路和仓库，
  以及 12 到 240 格的岛屿，最多 8 名玩家。
- 🧑‍🤝‍🧑 **为好友而生。** 带体素头像的账号、好友与在线状态、邀请、对局历史、观战、
  私密的信鸽传书，以及重新加入你离开的对局。
- 🤖 **精通所有规则的机器人。** 可以填补任何空位；它们会交易、建造、使用角色技能并应对事件。
- 🛡️ **服务器权威。** 规则由服务器执行，每位玩家只会收到自己有权看到的信息，
  他人手牌、牌堆和骰子种子始终保密。
- 📚 **内置教程。** 两种模式的完整图文规则书，可从主菜单或游戏内菜单打开。

## 截图

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/table.jpg" alt="进行中的对局和界面"><br><sub><b>牌桌上。</b> 你的地块与收入、编年史、每位玩家的名牌以及建造菜单。</sub></td>
    <td width="50%"><img src="docs/screenshots/closeup.jpg" alt="体素岛屿特写"><br><sub><b>特写。</b> 每一块地形都是一座微缩景观，这里有仓库、强盗和羊群。</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/lobby.jpg" alt="Reign Extended 大厅"><br><sub><b>大厅。</b> 房主设置模式、岛屿、角色、建筑、事件、胜利分数和回合计时。</sub></td>
    <td><img src="docs/screenshots/draft.jpg" alt="角色轮选"><br><sub><b>角色轮选。</b> 十六名角色，各有一项特性和一项技能；最先摆放的玩家最后选。</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/events.jpg" alt="翻开一张事件牌"><br><sub><b>事件牌堆。</b> 每轮一张新牌，带来节庆、风暴、彗星和盗匪。</sub></td>
    <td><img src="docs/screenshots/islands.jpg" alt="选择岛屿"><br><sub><b>岛屿。</b> 预设地图、地图编辑器和带种子的随机岛屿生成器。</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/screenshots/eight-players.jpg" alt="大岛上的八人对局"><br><sub><b>大型牌桌。</b> 大岛最多可容纳八名玩家，银行和牌堆也随之扩大。</sub></td>
  </tr>
</table>

## 游戏模式

房主在大厅中选择模式，下面的每一项都是由房主控制的开关。

### Classic（经典）

标准游戏，与以往完全一致：随机的 19 格岛屿、标准规则、2 到 4 名玩家、10 分获胜。

### Reign Extended（扩展）

包含 Classic 的全部内容，另外还有：

| 功能 | 内容 |
| --- | --- |
| **角色** | 16 名角色，每人有一项改变某条规则的特性，例如 3:1 银行交易、更便宜的城市或一次偷两张牌。房主可以轮选角色、排除部分角色、允许重复或关闭角色。 |
| **技能** | 每名角色还有一项价值约等于一张发展卡的技能：Market Day、Foresight、Hex、Blessing、Mischief 等。每局一次，或每 4 轮、6 轮充能一次。 |
| **事件牌堆** | 13 张事件牌，每轮或每两轮翻开一张：Harvest Festival、Comet、Earthquake、Royal Decree、Plague of Rats、Bandit Uprising 等。房主可以移除任意一张。 |
| **建筑** | **作坊**（所在地块为你产出时多得 1 张牌）、**石板路**（在最长道路中算作两段）和**仓库**（3 张牌不受强盗和事件影响）。 |
| **岛屿** | 六种预设形状，从经典小岛到 37 格的王国；自制岛屿的地图编辑器；以及随机生成器（12 到 240 格；圆形、狭长、参差或相连的群岛，可带湖泊）。 |
| **大型牌桌** | 每五格岛屿可容纳一名玩家，4 到 8 人，共八种颜色。银行和牌堆随牌桌扩大。 |
| **自定义规则** | 胜利分数 3 到 30（受岛屿和人数限制）、掷出 7 时的手牌上限 3 到 20，以及 30 秒到 3 分钟的回合计时。 |

## 一起玩

- **账号。** 使用用户名、昵称、密码和十二种体素头像之一登录，之后都可以修改。
- **好友。** 通过用户名添加好友，查看谁在线、在牌桌上或正在游戏，并邀请他们进入你的大厅。
- **对局历史。** 每局游戏都会记录角色和结果，你和好友的都能查看。
- **邀请链接。** 创建房间后分享链接或房间代码即可。
- **观战。** 输入正在进行的对局代码即可观战，但看不到任何人的手牌。
- **信鸽传书。** 用信鸽给另一名玩家送私密纸条，只有你们两人能读到。
- **离开与重返。** 玩家离开期间由机器人代打，直到其回来。只有所有人都离开时对局才会取消。
- **暂停。** 与机器人对战时，打开菜单即可暂停牌桌。

## 快速开始

需要 **Node 20+** 和 **pnpm**（`corepack enable` 会提供正确的版本）。

```bash
pnpm install
pnpm dev          # 游戏服务器在 :8787，Vite 在 :5173
```

打开 <http://localhost:5173>，创建账号，然后点击 **Play vs bots** 或 **Create a room** 并分享邀请链接。
若要在局域网内和他人一起玩，请通过电脑的局域网地址打开游戏（例如 `http://192.168.1.20:5173`），
这样邀请链接才会指向那里。

无需配置数据库：未设置 `DATABASE_URL` 时，服务器会在自身进程内运行 [PGlite](https://pglite.dev)
（编译为 WebAssembly 的 Postgres），数据保存在 `./data/db`。删除该文件夹即可从头开始。

## 运行 Reign

### 生产构建

```bash
pnpm build
pnpm start        # 单个进程在 http://localhost:8787 提供页面、/api 和 WebSocket
```

### Docker

```bash
docker compose up -d --build        # 游戏 + Postgres，地址 http://localhost:8787
docker compose down                 # 停止
```

镜像会构建客户端，并以非 root 用户在一个小巧的容器中运行生产服务器，健康检查位于 `/health`。
Compose 还会启动 Postgres 17，数据存放在 `db` 卷中。

不使用 compose：

```bash
docker build -t reign .
docker run -p 8787:8787 -e DATABASE_URL=postgres://user:pass@host:5432/reign reign
```

不设置 `DATABASE_URL` 时，容器会用 PGlite 把数据保存在自身内部（删除容器后数据会丢失）。

如果不想安装 Node 来开发，`docker compose --profile dev up --build` 会在你的工作副本中运行 `pnpm dev`，
并在 <http://localhost:5173> 提供热重载。

### 在自己的服务器上启用 HTTPS

1. 将 `.env.example` 复制为 `.env`。
2. 设置一个真正的 `POSTGRES_PASSWORD`（字母和数字，例如 `openssl rand -hex 24`）。
3. 设置 `DOMAIN`，并将其 DNS A 记录指向服务器。
4. 设置 `BIND=127.0.0.1`，让 8787 端口只在本机响应，玩家通过 HTTPS 访问。

```bash
docker compose --profile https up -d --build   # 游戏 + Postgres + Caddy，使用 80 和 443 端口
```

Caddy 会自动申请并续期 Let's Encrypt 证书，并把页面、`/api` 和 WebSocket 转发给游戏。
没有域名时，不要启用该 profile，直接访问 `http://<服务器 IP>:8787` 即可。

### 离线构建（仅机器人）

```bash
pnpm build:offline      # 静态站点输出到 dist/offline
pnpm dev:offline        # 同上，带热重载，地址 http://localhost:5173
```

离线版本不需要服务器和账号：规则和机器人直接在页面中运行，使用与服务器相同的 `Room`，
通过一个替身 WebSocket 连接。你可以在任一模式下以本地玩家身份对战机器人，昵称、头像和保存的地图都存于浏览器中。
`vercel.json` 构建的就是这个版本，因此仓库可以原样部署到 Vercel 或任何静态托管服务。

### Render

`render.yaml` 会把游戏部署为 Node Web 服务，并附带一个免费的 Render Postgres 数据库。
同一个 Docker 镜像也能运行在任何支持 WebSocket 的平台上，例如 Fly.io、Railway 或 VPS。

## 配置

| 变量 | 默认值 | 使用者 | 含义 |
| --- | --- | --- | --- |
| `PORT` | `8787` | 服务器、compose | 游戏监听的端口。 |
| `DATABASE_URL` | *（空）* | 服务器 | `postgres://` 连接地址。留空则使用内置 PGlite，数据在 `./data/db`。 |
| `NODE_ENV` | | 服务器 | 设为 `production` 时永远不会开启开发作弊。 |
| `POSTGRES_PASSWORD` | `change-me` | compose | 内置 Postgres 的密码，需在首次启动前设置。 |
| `BIND` | `0.0.0.0` | compose | 游戏端口对外发布的地址。 |
| `DOMAIN` | `localhost` | compose（`https`） | Caddy 为其申请证书的域名。 |

## 操作

| 输入 | 动作 |
| --- | --- |
| 拖动 | 旋转牌桌 |
| 右键拖动或双指 | 平移 |
| 滚轮或双指缩放 | 缩放 |
| 悬停后点击 | 在发光的宝石和光环处预览棋子，然后放置 |
| `Esc` | 取消建造模式、关闭交易面板或打开游戏菜单 |
| `` ` `` | 打开作弊面板（仅开发服务器） |

在开局摆放和移动强盗时，棋盘会高亮所有可用位置。

## 开发作弊面板

`pnpm dev` 会以 `--dev` 参数启动服务器，每局游戏都会有一个作弊面板：按 `` ` `` 或点击菜单按钮下方的锤子。
它可以给任意玩家发牌或一张可立即使用的发展卡、操控下一次掷骰、翻开指定事件、完成开局摆放、加速机器人，
或直接获胜。每次使用都会在编年史中留下一行 `[cheat]`。`pnpm start`、Docker 以及任何设置了
`NODE_ENV=production` 的环境都不会开启它，服务器也会拒绝相应的消息。

## 技术架构

```
src/shared/   规则引擎、棋盘几何、机器人和网络协议（不依赖 DOM 和 Three.js）
  board/        六边形数学、拓扑、预设地图、随机岛屿
  rules/        配置、引擎、查询、视图脱敏、机器人、角色、事件、建筑
src/server/   Node HTTP + WebSocket 服务器：房间、大厅、座位、重连、机器人、静态文件、
              账号与数据库（db.ts、accounts.ts、api.ts）、在线状态与邀请（hub.ts）
src/client/   基于 Vite + Svelte 5 的界面，构建在 Three.js 场景之上
  scene/        体素引擎（烘焙 AO 的网格生成器、倒角体素着色器）、岛屿地形、棋子、
                房间、光照、相机、骰子、粒子、后期处理、角色肖像
  ui/           主菜单、大厅、HUD、交易、对话框、教程、账号、信鸽传书
  offline/      仅机器人版本使用的页内服务器
tests/        引擎、房间、账号、扩展内容以及完整的机器人模拟对局
scripts/      截图、端到端测试和开发辅助脚本
```

- **服务器是权威。** 客户端只发送动作，服务器用共享引擎校验后，向每位玩家发送脱敏后的视图。
  他人手牌只显示数量，牌堆和骰子种子从不发送。
- **引擎是纯函数。** `applyAction(state, player, action)` 返回新的状态和事件，
  事件驱动动画、音效和编年史。
- **地图即数据。** `Board` 只是六边形格（地形和数字）加上港口，拓扑由此推导，因此任何形状都能用。
- **内容即数据。** 资源、地形、费用和发展卡牌堆位于 `src/shared/rules/config.ts`；
  角色、事件和建筑各有独立的文件。
- **经典保持经典。** 所有新内容都只在 `state.mode === 'extended'` 时启用，并有测试确保 Classic 对局不变。

## 添加内容

- **角色：** `rules/characters.ts`。特性通过 `rules/queries.ts` 中的 `costOf`、`tradeRatios`、
  `discardLimit` 和 `longestRoadMin` 接入；技能通过 `usePower` 动作实现，机器人需要在 `bot.ts` 中添加规则。
  肖像是 `scene/portraits.ts` 中的体素半身像。
- **事件：** 卡牌及其效果位于 `rules/events.ts`。
- **建筑：** `rules/buildings.ts` 列出房主开关；模型位于 `scene/board/`。
- **资源和地块：** 扩展 `config.ts`，再在 `scene/board/terrain.ts` 中添加地形、在 `scene/board/models.ts` 中添加模型。
- **地图：** 预设地图以文本形式绘制在 `board/maps.ts` 中；`generateBoard(tiles, rng)` 可为任意形状发牌。
- **教程：** 每个扩展功能都在 `ui/tutorial/` 中有一页，并在 `chapters.ts` 中有一行。

## 测试

```bash
pnpm test         # 规则引擎、房间、账号以及完整的机器人模拟对局
pnpm check        # Svelte 和 TypeScript 检查
node scripts/e2e.mjs http://localhost:8787 test-results/e2e 300   # 针对运行中服务器的浏览器冒烟测试
```

设置 `TEST_DATABASE_URL` 后，账号测试还会在真实的 Postgres 上运行。

<div align="center">
<sub>用体素、骰子和许多羊打造。🐑</sub>
</div>
