# Scriptable 每日组件 · 名言 + 今日任务

名言与任务库都托管在 GitHub 上，改内容不用动脚本。
任务的**完成状态托管给苹果「提醒事项」**——在手机、手表、Mac 上勾，或者跟 Siri 说一声，都能完成并自动同步。

## 文件构成

```
仓库根目录/
├─ WidgetCore.js          公共模块：取数 + 缓存 + 每日轮转 + 按日种子随机 + 三种尺寸布局
├─ TaskStore.js           今日任务的读取与生成（对接提醒事项 / 日历）
├─ TaskGen.js             ★ 每日生成器，由快捷指令每天早上触发一次
├─ DailyRestart.js        ★ 组件一：名言 + 今日任务（只读，绝不写入）
├─ DaoDeJing.js           ★ 组件二：道德经每日一章，点开看整章
├─ _selftest.js           本地自检（node 跑，不用放进 Scriptable）
├─ data/
│  ├─ daily-restart.json  名言 405 条 + 最小目标 25 条
│  ├─ daodejing.json      道德经全本 81 章（原文 / 拼音 / 白话 / 摘句）
│  ├─ tasks-earth.json    地球Online 任务库 46 条
│  └─ tasks-evil.json     恶女Online 任务库 40 条
└─ tools/daodejing/       道德经数据的构建脚本与底本（见该目录的 README）
```

## 它是怎么运转的

```
每天早上 7:00
  快捷指令自动化  →  TaskGen.js
                      ├ 读今天的日历事件 + 今天到期的提醒事项
                      ├ 数一数够不够 3 条
                      ├ 不够就从任务库「按日随机」补齐
                      ├ 写进专用列表「地球Online」
                      └ 存一份本地快照

白天任意时刻
  你在提醒事项 / 手表 / Siri 上勾掉任务   ← 状态就存在这里

小组件被系统唤醒（一天几十次）
  DailyRestart.js  →  读名言（缓存优先）
                      读提醒事项拿最新勾选状态
                      读不到就用早上那份快照
                      画成一张图。它永远不写入。
```

**为什么写和读要分开？** iOS 16.1 之后 App Extension 不再自动继承主 App 的 EventKit 权限，小组件里读提醒事项有概率失败，而且授权弹窗根本弹不出来。另外小组件一天被唤醒几十次，如果在里面执行「不够就补」，很容易重复创建、或者把你手动删掉的任务一次次加回来。所以生成只发生一次，小组件保持只读。

---

## 部署步骤

### 1. 建仓库，拿 raw 地址

把 `data/` 传到一个 GitHub 仓库，打开任一 JSON → 点右上角 **Raw** → 复制 URL，形如：

```
https://raw.githubusercontent.com/dyuans/WidgetDyuan/main/data/daily-restart.json
```

三处地址已填好（`DailyRestart.js` 与 `DaoDeJing.js` 的 `DATA_URL`、`TaskGen.js` 的 `REPO`）。

> **仓库必须是 public**——私有仓库的 raw 链接不带 token 会 404，整套「改 JSON 就更新」会失效。

> 国内网络不稳可换 jsDelivr：`https://cdn.jsdelivr.net/gh/dyuans/WidgetDyuan@main/data/xxx.json`。代价是 CDN 缓存更久，改完生效更慢。

### 2. 放进 Scriptable

把 5 个 `.js` 放到 Scriptable 的脚本目录（iCloud Drive → Scriptable/）。
**必须在同一层目录**，否则 `importModule` 找不到。

### 3. ★ 先手动跑一次 TaskGen，把权限授出去

这一步不能跳。**授权弹窗只能在 App 前台弹出，小组件里弹不了。**

在 Scriptable 里打开 `TaskGen.js` → 点播放 → 依次允许「提醒事项」和「日历」访问 → 看到弹窗列出今天的 3 条任务就成功了。

如果误点了拒绝：设置 → 隐私与安全性 → 提醒事项 / 日历 → 把 Scriptable 打开，再跑一次。

### 4. 设置每天早上自动生成

打开「快捷指令」App → 底部**自动化** → 新建 → **时间**：

- 每天 07:00（自己挑，建议在你通常起床后）
- 操作里搜 **Scriptable** → 选「运行脚本」 → Script 选 `TaskGen`
- **关掉「运行前询问」**（这一步很关键，否则每天早上会弹确认框）

### 5. 添加小组件

长按桌面 → 添加小组件 → Scriptable → 选尺寸 → 组件设置里 Script 选 `DailyRestart`，
**Interaction 选 Run Script**（这样点一下能强制刷新）。锁屏组件选「矩形」那一档。

---

## 道德经组件

全本 81 章，每天一章，81 天一轮。数据结构是一章一条：

```jsonc
{
  "chapter": 8,
  "title": "若水",              // 传统章题
  "text": "上善若水。水善利万物而不争……",   // 整章原文
  "pinyin": "shàng shàn ruò shuǐ。 shuǐ shàn lì……",  // 全章注音
  "explain": "最高的善像水：滋养万物却不与之争……",   // 白话（自撰）
  "key": "上善若水"             // 摘句，组件放不下全文时显示
}
```

**组件上按长短自动切**：全书平均每章 65 字，62 章在 80 字以内会直接显示整章原文；
第 20、31、38、39、64 这几章上百字，放不下就退回摘句 + 一句白话。阈值在
`DaoDeJing.js` 顶部的 `FULL_TEXT_LIMIT`。

**点一下看全章**：组件设置里 Interaction 选 **Run Script**，点击会弹出一个阅读页，
整章原文 + 逐字拼音 + 白话解释都在那里——拼音不上组件，是因为一整章的注音怎么排都塞不下。

改文字或注音走 `tools/daodejing/`，不要直接编辑 `data/daodejing.json`（会被重新生成覆盖）。

## 关于「完成后会不会消失」

**不会。** 提醒事项 App 只是把已完成项从列表里隐藏了（列表右上角 ⋯ 菜单里有「显示已完成」可以打开），数据一直都在。

Scriptable 的 API 也证明了这一点——`Reminder.completedDueToday()` 这个方法存在，说明已完成的提醒事项依然可以被查询到，每条上还有 `isCompleted` 和 `completionDate`。

所以小组件能自己画出两种状态：

- `○ 喝完一整杯水` —— 未完成，正常亮度
- `✓ 10:00 部门周会` —— 已完成，文字变暗

一个小限制：Scriptable 的文字不支持删除线，所以用「✓ + 文字调暗」来表达划掉，不能真的划一道线。

另外**勾完组件不会立刻变**——受刷新配额限制，可能要等几十分钟。想马上看到，点一下组件（Interaction 设成 Run Script）。

---

## 名额规则

今日任务总数是 **3 条**，日历上已有的安排**占名额**：

| 今天日历/提醒事项已有 | 补充游戏任务 | 结果 |
|---|---|---|
| 0 条 | 3 条 | 3 条全是游戏任务 |
| 2 条 | 1 条 | 2 主线 + 1 支线 |
| 3 条及以上 | 0 条 | 忙的时候不再加码 |

- **全天事件不算**（生日、纪念日这类不是任务），只算限时事件
- **已经结束的日历事件自动标记为完成**——开完的会自带一个 ✓
- 显示顺序：日历事件 → 别的列表的提醒事项 → 自己生成的任务

想改数量或不让日历占名额，改 `TaskGen.js` 顶部的 `TARGET` 和 `INCLUDE_CALENDAR`。

---

## 任务库怎么维护

在 GitHub 网页上直接编辑 `data/tasks-*.json`：

```jsonc
{ "text": "喝完一整杯水", "type": "日常", "rarity": "N", "tag": "身体" }
```

- `text` —— 任务本身。**建议不超过 24 字**，超了在小组件里会被压缩或截断
- `type` —— 日常 / 支线 / 主线
- `rarity` —— N / R / SR / SSR，目前只是标记（写进提醒事项的备注里），不影响抽取概率
- `tag` —— 分类，方便你自己筛选

**写任务的标准**（照这个来，库才好用）：30 秒到 5 分钟能做完、完成与否一眼可判、做完确实有用。
「保持好心情」不合格，「把水杯洗了」合格。

想只用一种风格，改 `TaskGen.js` 顶部的 `FLAVORS`，把不要的那行删掉。

## 轮转与抽取

两套机制，都以**不跨年归零的绝对天数**为准（`Core.absoluteDay()`）：

**名言、道德经——顺序轮转**（`pickOfDay`）。每天前进一条，走完整个列表再从头。
用绝对天数而不是「今年第几天」，是因为 dayOfYear 最大 365：条目一旦超过 365
（名言正好 405 条），多出来的永远轮不到，而且每年同一天必定重复同一条。

**任务——按日种子随机**（`pickRandomOfDay`，mulberry32）：

- **当天多次调用结果完全一致**——一天被唤醒几十次也不会变成老虎机
- **跨天才变**，不是顺序轮转，有抽卡感
- 最近用过的 40 条会被避开，短期内不重复
- 增删任务不会导致整个序列错位

## 排错

| 现象 | 原因 |
|---|---|
| 组件显示「今日目标」而不是任务 | 一条任务都没读到——先手动跑一次 TaskGen 授权 |
| 早上没自动生成 | 快捷指令自动化的「运行前询问」没关 |
| 任务重复出现 | 快照被清了。删 `TaskGen.js` 里的判断没必要，在 App 里手动跑会强制重来（`force = config.runsInApp`） |
| 提醒事项里堆了一堆过期任务 | 正常，每天早上生成时会自动清理昨天及更早的未完成项 |
| 改了 JSON 组件没变 | 缓存新鲜期 12 小时。把 `maxAgeHours` 临时改成 0 跑一次 |

## 想加第三个主题？

复制 `DaoDeJing.js`，改三处：`DATA_URL`、`THEME` 配色、`view` 字段映射。布局全在 `WidgetCore.js` 里。

`view` 支持的字段：

| 字段 | 说明 | 出现在 |
|---|---|---|
| `icon` / `title` | 顶部图标与标题 | 全部尺寸 |
| `lockTitle` | 锁屏专用标题 | 锁屏 |
| `primary` | 主文案（名言 / 原文） | 全部尺寸 |
| `secondary` | 次行小字（出处 / 拼音） | Small、Medium |
| `detail` | 长说明 | 仅 Medium |
| `primaryFont` / `primaryLines` | 正文字号与行数（整章原文要多行时用） | Medium |
| `primaryFontSmall` / `primaryLinesSmall` | 同上，Small 尺寸 | Small |
| `tasks` | `[{title, done, kind}]`，**传了就渲染成勾选清单** | 全部尺寸 |
| `tag` / `tagLabel` | 底部胶囊标签（没有 tasks 时才显示） | Small、Medium |
| `lockBottom` / `lockBottomAccent` | 锁屏底行 | 锁屏 |
