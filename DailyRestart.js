// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: magic;
// DailyRestart — 每日重启（照片背景 + 名言 + 今日任务）
//
// 背景照片每天换一张，由 TaskGen 在早上处理好存盘，本脚本只读成品图。
// 任务状态托管在「提醒事项」，本脚本只读，绝不写入。
//
// 依赖：WidgetCore.js、TaskStore.js（同目录）

const Core = importModule("WidgetCore");
const TaskStore = importModule("TaskStore");

// ─── 配置 ──────────────────────────────────────────────────────
const DATA_URL =
  "https://raw.githubusercontent.com/dyuans/WidgetDyuan/main/data/daily-restart.json";

const LIST_NAME = "地球Online";   // 必须与 TaskGen.js 一致
const SHOW_TASKS = true;
const USE_PHOTO = true;            // 关掉就回到纯色渐变

// ─── 配色 ──────────────────────────────────────────────────────
// 照片背景下用白色体系；没有照片时退回原来的金黄配色
const THEME = {
  gradient: ["#111008", "#0a0a0a"],
  accent: "#f5c842",        // 进度数字与 ✓ 标记
  textPrimary: "#ffffff",
  textSecondary: "#a09890",
  subtle: "#a09890",
  tagBg: "#1a1508",
  line: "#f5c842",
  done: "#8d8880",          // 已完成任务的文字色
  panelBg: "#090b10",       // 任务面板底色
  panelAlpha: 0.69,
};

// ─── 内置兜底 ──────────────────────────────────────────────────
const FALLBACK = {
  quotes: [
    { text: "行到水穷处，坐看云起时。", src: "王维《终南别业》" },
    { text: "此心安处是吾乡。", src: "苏轼《定风波》" },
    { text: "偷得浮生半日闲。", src: "李涉《题鹤林寺僧舍》" },
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
let tasks = [];
if (SHOW_TASKS) {
  const res = await TaskStore.readForWidget({ listName: LIST_NAME });
  tasks = res.tasks || [];
}

// ─── 背景照片（读现成的，组件里不做任何图像处理）────────────────
const bg = USE_PHOTO ? Core.loadImage("bg") : null;

// ─── 字段映射 ──────────────────────────────────────────────────
const view = {
  icon: "✦",
  title: "每日重启",
  primary: quote.text,
  secondary: quote.src ? "— " + quote.src : null,
  backgroundImage: bg,        // 没有就是 null，自动回到渐变
  taskPanel: !!bg,            // 照片背景下任务套面板保可读
};

if (tasks.length > 0) {
  view.tasks = tasks.slice(0, 3);
} else {
  // 一条任务都没有时，退回显示今日最小目标
  const goal = Core.pickOfDay(data.goals, 7) || FALLBACK.goals[0];
  view.tag = goal;
  view.tagLabel = "今日目标";
  view.lockBottom = goal;
  view.lockBottomAccent = true;
}

// ─── 输出 ──────────────────────────────────────────────────────
const widget = new ListWidget();
widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

Core.render(widget, view, THEME, config.widgetFamily);

if (!config.runsInWidget) {
  await widget.presentMedium();
}
Script.setWidget(widget);
Script.complete();
