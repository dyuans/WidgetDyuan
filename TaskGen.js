// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: dice;
// TaskGen — 每日任务生成器
// 由「快捷指令」个人自动化每天早上触发一次（见 README）。
// 第一次务必在 Scriptable 里手动运行一遍，把提醒事项 / 日历权限授出去，
// 否则小组件里拿不到权限，也弹不出授权框。
//
// 依赖：WidgetCore.js、TaskStore.js（同目录）

const Core = importModule("WidgetCore");
const TaskStore = importModule("TaskStore");

// ─── 配置 ──────────────────────────────────────────────────────
const REPO = "https://raw.githubusercontent.com/YOUR_NAME/YOUR_REPO/main/data/";

const LIST_NAME = "地球Online";   // 专用提醒事项列表，跟你真正的待办隔离
const TARGET = 3;                  // 今日任务总数（含日历已有的安排）
const INCLUDE_CALENDAR = true;     // 日历事件是否占名额

// 想只用一种风格，把不要的那行删掉即可
const FLAVORS = [
  { key: "earth", file: "tasks-earth.json" },
  { key: "evil", file: "tasks-evil.json" },
];

// ─── 兜底任务（远程和缓存都没有时才用）──────────────────────────
const FALLBACK = {
  tasks: [
    { text: "喝完一整杯水", type: "日常", rarity: "N", tag: "身体" },
    { text: "把桌上最碍眼的那样东西放回原位", type: "日常", rarity: "N", tag: "环境" },
    { text: "今天有一次不解释理由", type: "支线", rarity: "R", tag: "边界" },
  ],
};

// ─── 加载任务库 ────────────────────────────────────────────────
let pool = [];
for (const flavor of FLAVORS) {
  const { data } = await Core.loadData({
    url: REPO + flavor.file,
    cacheName: "tasks-" + flavor.key,
    fallback: FALLBACK,
    maxAgeHours: 24,
  });
  if (data && Array.isArray(data.tasks)) {
    pool = pool.concat(data.tasks.map((t) => Object.assign({ flavor: flavor.key }, t)));
  }
}
if (pool.length === 0) pool = FALLBACK.tasks;

// ─── 生成 ──────────────────────────────────────────────────────
// 在 Scriptable 里手动运行时强制重来，方便你调试；自动化触发时按标记走。
const force = config.runsInApp;

let result;
try {
  result = await TaskStore.generateToday({
    listName: LIST_NAME,
    pool,
    target: TARGET,
    force,
    includeCalendar: INCLUDE_CALENDAR,
  });
} catch (e) {
  result = { status: "error", error: String(e), tasks: [] };
}

// ─── 反馈 ──────────────────────────────────────────────────────
if (config.runsInApp) {
  const a = new Alert();
  if (result.status === "error") {
    a.title = "生成失败";
    a.message =
      String(result.error) +
      "\n\n如果提示权限相关，去「设置 → 隐私与安全性 → 提醒事项 / 日历」把 Scriptable 打开。";
  } else {
    a.title = result.status === "already" ? "今天已经生成过了" : "今日任务已就绪";
    const lines = (result.tasks || []).map(
      (t) => (t.done ? "✓ " : "○ ") + t.title + "（" + t.kind + "）"
    );
    a.message =
      lines.join("\n") +
      "\n\n已有安排 " + (result.existing === undefined ? "—" : result.existing) +
      " 条，补充 " + result.added +
      " 条" + (result.cleaned ? "，清理过期 " + result.cleaned + " 条" : "") +
      "\n任务库共 " + pool.length + " 条";
  }
  a.addAction("好");
  await a.present();
} else {
  // 从快捷指令触发时，把结果回传给快捷指令（可选，用于调试）
  Script.setShortcutOutput(
    result.status + " / added=" + result.added + " / total=" + (result.tasks || []).length
  );
}

Script.complete();
