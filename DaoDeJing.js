// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: magic;
// 道德经 · 每日一章
// 全本 81 章，每天一章，81 天一轮。
// 组件上：短章（≤80 字）直接上全文，长章退回摘句。
// 点一下组件（Interaction 设为 Run Script）→ 弹出整章原文 + 拼音 + 白话解释。
//
// 依赖：WidgetCore.js（同目录）

const Core = importModule("WidgetCore");

// ─── 配置 ──────────────────────────────────────────────────────
const DATA_URL =
  "https://raw.githubusercontent.com/dyuans/WidgetDyuan/main/data/daodejing.json";

const FULL_TEXT_LIMIT = 80; // 汉字数不超过这个值就在组件上显示全文

// ─── 配色（墨底 · 青玉 + 朱砂印）────────────────────────────────
const THEME = {
  gradient: ["#15150f", "#0b0a07"],
  accent: "#a9c4a0",       // 青玉
  seal: "#c0563f",         // 朱砂
  textPrimary: "#efe9dd",
  textSecondary: "#9a958a",
  subtle: "#b9b09c",
  tagBg: "#161812",
  line: "#a9c4a0",
};

// ─── 内置兜底 ──────────────────────────────────────────────────
const FALLBACK = {
  chapters: [
    {
      chapter: 8,
      title: "若水",
      text: "上善若水。水善利万物而不争，处众人之所恶，故几于道。",
      pinyin: "shàng shàn ruò shuǐ。 shuǐ shàn lì wàn wù ér bù zhēng， chǔ zhòng rén zhī suǒ wù， gù jī yú dào。",
      explain: "最高的善像水：滋养万物却不与之争，甘居众人厌恶的低处，所以最接近道。",
      key: "上善若水",
    },
  ],
};

// ─── 取数 ──────────────────────────────────────────────────────
const { data } = await Core.loadData({
  url: DATA_URL,
  cacheName: "daodejing",
  fallback: FALLBACK,
  maxAgeHours: 24, // 经文不会变，一天查一次足够
});

const chapters = (data && data.chapters) || FALLBACK.chapters;
const c = Core.pickOfDay(chapters, 0) || chapters[0];

const hanCount = (s) => (s.match(/[一-鿿]/g) || []).length;
const isShort = hanCount(c.text) <= FULL_TEXT_LIMIT;

// ─── 组件 ──────────────────────────────────────────────────────
const view = {
  icon: "☷",
  title: "道德经 · 第" + c.chapter + "章",
  lockTitle: "道德经 · 第" + c.chapter + "章",
  // 短章上全文，长章退摘句
  primary: isShort ? c.text : c.key,
  primaryFont: isShort ? 12 : 15,
  primaryLines: isShort ? 5 : 2,
  primaryFontSmall: isShort ? 9.5 : 12.5,
  primaryLinesSmall: isShort ? 7 : 3,
  detail: c.explain,
  tag: c.title,
  tagLabel: "第" + c.chapter + "章",
  tagAccent: false,
  lockBottom: isShort ? null : c.explain, // 锁屏太窄，长章给一句大意
};

const widget = new ListWidget();
widget.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000);

Core.render(widget, view, THEME, config.widgetFamily);
Script.setWidget(widget);

// ─── 点开：整章阅读 ────────────────────────────────────────────
// 组件设置里 Interaction 选 Run Script，点一下就会走到这里。
if (!config.runsInWidget) {
  await presentChapter(c);
}
Script.complete();

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function presentChapter(ch) {
  const html = `
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; padding: 28px 22px 60px;
    background: linear-gradient(${THEME.gradient[0]}, ${THEME.gradient[1]}) fixed;
    color: ${THEME.textPrimary};
    font: 400 17px/1.9 "Songti SC", "Georgia", serif;
    -webkit-text-size-adjust: 100%;
  }
  header { display:flex; align-items:baseline; gap:8px; margin-bottom:6px; }
  .seal { color:${THEME.seal}; font-size:15px; }
  h1 { margin:0; font-size:16px; font-weight:600; color:${THEME.accent}; letter-spacing:.04em; }
  .title { margin-left:auto; font-size:13px; color:${THEME.seal}; }
  hr { border:0; border-top:1px solid ${THEME.accent}59; margin:14px 0 20px; }
  .text { font-size:19px; line-height:2.05; letter-spacing:.02em; }
  .pinyin {
    margin-top:18px; font: 400 12.5px/1.85 -apple-system, sans-serif;
    color:${THEME.subtle}; word-break:break-word;
  }
  .label {
    margin:26px 0 8px; font: 600 11px/1 -apple-system, sans-serif;
    color:${THEME.textSecondary}; letter-spacing:.18em;
  }
  .explain {
    font: 400 15px/1.85 -apple-system, sans-serif; color:${THEME.textSecondary};
  }
  footer {
    margin-top:34px; padding-top:14px; border-top:1px solid ${THEME.accent}26;
    font: 400 11px/1.6 -apple-system, sans-serif; color:${THEME.textSecondary}80;
  }
</style>
<header>
  <span class="seal">☷</span>
  <h1>道德经 · 第${ch.chapter}章</h1>
  <span class="title">${esc(ch.title)}</span>
</header>
<hr>
<div class="text">${esc(ch.text)}</div>
<div class="pinyin">${esc(ch.pinyin)}</div>
<div class="label">白 话</div>
<div class="explain">${esc(ch.explain)}</div>
<footer>原文为通行本；拼音按今音标注，古读处已作修正；白话为自撰。</footer>
`;
  const wv = new WebView();
  await wv.loadHTML(html);
  await wv.present(true);
}
