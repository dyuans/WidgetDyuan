// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: magic;
// DailyRestart — 每日重启（名言 + 今日任务）
// 名言来自远程 JSON；任务状态托管在「提醒事项」里，可在任何设备上勾选。
// 本脚本只读，绝不写入提醒事项——写入由 TaskGen.js 每天早上跑一次。
//
// 依赖：WidgetCore.js、TaskStore.js（同目录）

const Core = importModule("WidgetCore");
const TaskStore = importModule("TaskStore");

// ─── 配置 ──────────────────────────────────────────────────────
const DATA_URL =
  "https://raw.githubusercontent.com/YOUR_NAME/YOUR_REPO/main/data/daily-restart.json";

const LIST_NAME = "地球Online";  // 必须与 TaskGen.js 里的一致
const SHOW_TASKS = true;          // 想只看名言就改成 false

const THEME = {
  gradient: ["#111008", "#0a0a0a"],
  accent: "#f5c842",       // 金黄
  textPrimary: "#f0ede8",
  textSecondary: "#a09890",
  subtle: "#a09890",
  tagBg: "#1a1508",
  line: "#f5c842",
  done: "#6b6459",         // 已完成任务的文字色
};

// ─── 内置兜底 ──────────────────────────────────────────────────
const FALLBACK = {
  quotes: [
    { text: "慢慢来，比较快。", src: "吴念真" },
    { text: "你不必强大，你只需要今天继续。", src: "心理学" },
    { text: "往前走，哪怕只是一小步。", src: "村上春树" },
  ],
  goals: ["🥤 今天多喝一杯水", "🌤 抬头看一次天空", "🧘 闭眼深呼吸，数到十"],
};

// ─── 名言 ──────────────────────────────────────────────────────
const { data } = await Core.loadData({
  url: DATA_URL,
  cacheName: "daily-restart",
  fallback: FALLBACK,
  maxAgeHours: 12,
});

const quote = Core.pickOfDay(data.quotes, 0) || FALLBACK.quotes[0];

// ─── 今日任务 ──────────────────────────────────────────────────
// 优先读提醒事项拿到最新勾选状态；权限异常时退回今早生成器留下的快照。
let tasks = [];
if (SHOW_TASKS) {
  const res = await TaskStore.readForWidget({ listName: LIST_NAME });
  tasks = res.tasks || [];
}

// ─── 字段映射 ──────────────────────────────────────────────────
const view = {
  icon: "✦",
  title: "每日重启",
  primary: quote.text,
  secondary: quote.src ? "— " + quote.src : null,
};

if (tasks.length > 0) {
  view.tasks = tasks.slice(0, 3);
} else {
  // 一条任务都没有时，退回老样子：显示今日最小目标
  const goal = Core.pickOfDay(data.goals, 7) || FALLBACK.goals[0];
  view.tag = goal;
  view.tagLabel = "今日目标";
  view.lockBottom = goal;
  view.lockBottomAccent = true;
}

// ─── 输出 ──────────────────────────────────────────────────────
const widget = new ListWidget();
widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000); // 勾选后早点反映出来

Core.render(widget, view, THEME, config.widgetFamily);

if (!config.runsInWidget) {
  await widget.presentMedium(); // 预览：可改 presentSmall() / presentAccessoryRectangular()
}
Script.setWidget(widget);
Script.complete();
