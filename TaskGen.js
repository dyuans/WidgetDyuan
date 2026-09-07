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
const REPO = "https://raw.githubusercontent.com/dyuans/WidgetDyuan/main/data/";

const LIST_NAME = "地球Online";   // 专用提醒事项列表，跟你真正的待办隔离
const TARGET = 3;                  // 今日任务总数（含日历已有的安排）
const INCLUDE_CALENDAR = true;     // 日历事件是否占名额

// ─── 背景照片 ──────────────────────────────────────────────────
// 照片由「快捷指令」从相册取好后传进来（见 README）。
// 这里做全部加工：裁切 → 模糊 → 压暗 → 存盘，组件只读成品。
const BG_ENABLED = true;
const BG_BLUR = 150;    // 缩到多少像素宽再放大。越小越糊；150 能认出是哪张照片
const BG_DARKEN = 0.45; // 压暗程度 0~1。觉得太暗就调到 0.35
// 快捷指令若用「存储文件」方式，把照片存到 iCloud/Scriptable 下的这个名字
const BG_DROP_FILE = "widget-bg-source.jpg";

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

// ─── 背景照片 ──────────────────────────────────────────────────
async function grabSourceImage() {
  // ① 快捷指令用「运行脚本」动作直接把图片当输入传进来
  if (args.images && args.images.length > 0) return args.images[0];

  // ② 或者快捷指令用「存储文件」放到 iCloud/Scriptable/ 下
  try {
    const fm = FileManager.iCloud();
    const p = fm.joinPath(fm.documentsDirectory(), BG_DROP_FILE);
    if (fm.fileExists(p)) {
      if (!fm.isFileDownloaded(p)) await fm.downloadFileFromiCloud(p);
      return fm.readImage(p);
    }
  } catch (e) { /* iCloud 不可用就算了 */ }

  // ③ 手动在 App 里跑、且还没有任何背景时，让你挑一张试效果
  if (config.runsInApp && !Core.loadImage("bg")) {
    const a = new Alert();
    a.title = "还没有背景照片";
    a.message = "从相册挑一张试试效果？正式使用时由快捷指令自动提供。";
    a.addAction("挑一张"); a.addCancelAction("跳过");
    if ((await a.presentAlert()) === 0) return await Photos.fromLibrary();
  }
  return null;
}

let bgNote = "";
if (BG_ENABLED) {
  try {
    const src = await grabSourceImage();
    if (src) {
      Core.saveImage("bg", Core.makeBackground(src, BG_BLUR, BG_DARKEN));
      bgNote = "背景已更新";
    } else {
      bgNote = Core.loadImage("bg") ? "背景沿用上次" : "暂无背景（用渐变）";
    }
  } catch (e) {
    bgNote = "背景处理失败：" + e;
  }
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
      "\n任务库共 " + pool.length + " 条" +
      (bgNote ? "\n" + bgNote : "");
  }
  a.addAction("好");
  await a.present();
} else {
  // 从快捷指令触发时，把结果回传给快捷指令（可选，用于调试）
  Script.setShortcutOutput(
    result.status + " / added=" + result.added +
      " / total=" + (result.tasks || []).length + " / " + bgNote
  );
}

Script.complete();
