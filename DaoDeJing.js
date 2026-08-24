// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: magic;
// 道德经 · 每日一句
// 内容来自远程 JSON，改内容不用动脚本。
// 依赖：同目录下的 WidgetCore.js

const Core = importModule("WidgetCore");

// ─── 数据源（改成你自己的仓库地址）──────────────────────────────
const DATA_URL =
  "https://raw.githubusercontent.com/YOUR_NAME/YOUR_REPO/main/data/daodejing.json";

// ─── 配色（墨底 · 青玉 + 朱砂印）────────────────────────────────
const THEME = {
  gradient: ["#15150f", "#0b0a07"],
  accent: "#a9c4a0",       // 青玉
  seal: "#c0563f",         // 朱砂，用于图标与章节标签
  textPrimary: "#efe9dd",
  textSecondary: "#9a958a",
  subtle: "#b9b09c",       // 拼音
  tagBg: "#161812",
  line: "#a9c4a0",
};

// ─── 内置兜底 ──────────────────────────────────────────────────
const FALLBACK = {
  verses: [
    {
      text: "上善若水。水善利万物而不争。",
      pinyin: "shàng shàn ruò shuǐ. shuǐ shàn lì wàn wù ér bù zhēng.",
      chapter: "第八章",
      explain: "最高的善像水。水滋养万物却不与之相争，甘居众人厌恶的低处，所以最接近于道。",
    },
    {
      text: "千里之行，始于足下。",
      pinyin: "qiān lǐ zhī xíng, shǐ yú zú xià.",
      chapter: "第六十四章",
      explain: "千里的远行，从脚下第一步开始。再宏大的目标，也要从眼前最小的行动做起。",
    },
  ],
};

// ─── 取数 ──────────────────────────────────────────────────────
const { data } = await Core.loadData({
  url: DATA_URL,
  cacheName: "daodejing",
  fallback: FALLBACK,
  maxAgeHours: 12,
});

const v = Core.pickOfDay(data.verses, 0) || FALLBACK.verses[0];

// ─── 字段映射 ──────────────────────────────────────────────────
const view = {
  icon: "☷",
  title: "道德经 · 每日一句",
  lockTitle: "道德经 · " + v.chapter,
  primary: "「" + v.text + "」",
  secondary: v.pinyin,
  detail: v.explain,
  tag: v.chapter,
  tagLabel: "出处",
  tagAccent: false,          // 章节用朱砂色
  lockBottom: v.pinyin,
};

// ─── 输出 ──────────────────────────────────────────────────────
const widget = new ListWidget();
widget.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000);

Core.render(widget, view, THEME, config.widgetFamily);

if (!config.runsInWidget) {
  await widget.presentMedium();
}
Script.setWidget(widget);
Script.complete();
