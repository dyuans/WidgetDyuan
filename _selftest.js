// 本地自检：用假的 Scriptable / EventKit API 跑一遍全部逻辑。
// 电脑上执行 `node _selftest.js`，跟组件本身无关，不需要放进 Scriptable。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const TMP = "/tmp/sbtest";
fs.rmSync(TMP, { recursive: true, force: true });

// ════════ Scriptable API 桩 ════════
class Color { constructor(hex, a = 1) { this.hex = hex; this.a = a; } }
class Size { constructor(w, h) { this.w = w; this.h = h; } }
class LinearGradient { constructor() { this.colors = []; this.locations = []; } }
const Font = new Proxy({}, { get: () => (s) => ({ size: s }) });
class DateFormatter { constructor() { this.dateFormat = ""; } string() { return "8月24日"; } }

let drawn = [];
function makeStack() {
  return {
    layoutVertically() {}, layoutHorizontally() {}, centerAlignContent() {},
    setPadding() {}, addSpacer() {},
    addStack() { return makeStack(); },
    addText(t) { drawn.push(String(t)); return {}; },
  };
}
class ListWidget {
  constructor() { this.backgroundColor = null; }
  addStack() { return makeStack(); }
}
class FileManager {
  static local() {
    return {
      documentsDirectory: () => TMP,
      joinPath: (a, b) => path.join(a, b),
      fileExists: (p) => fs.existsSync(p),
      createDirectory: (p, r) => fs.mkdirSync(p, { recursive: !!r }),
      readString: (p) => fs.readFileSync(p, "utf8"),
      writeString: (p, s) => fs.writeFileSync(p, s),
    };
  }
}

// ════════ 假的 EventKit ════════
const store = { reminders: [], events: [], calendars: {}, denied: false };
function guard() { if (store.denied) throw new Error("Access to reminders is not granted"); }
function sameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
class Calendar {
  constructor(title) { this.title = title; }
  static async findOrCreateForReminders(title) {
    guard();
    if (!store.calendars[title]) store.calendars[title] = new Calendar(title);
    return store.calendars[title];
  }
}
class CalendarEvent {
  static async today() { guard(); return store.events; }
}
class Reminder {
  constructor() {
    this.title = ""; this.notes = ""; this.isCompleted = false;
    this.dueDate = null; this.calendar = null; this.dueDateIncludesTime = true;
  }
  save() { if (store.reminders.indexOf(this) < 0) store.reminders.push(this); }
  remove() { const i = store.reminders.indexOf(this); if (i >= 0) store.reminders.splice(i, 1); }
  static _filter(cals, pred) {
    return store.reminders.filter(
      (r) => pred(r) && (!cals || cals.length === 0 || cals.indexOf(r.calendar) >= 0)
    );
  }
  static async allDueToday(cals) { guard(); return Reminder._filter(cals, (r) => sameDay(r.dueDate, new Date())); }
  static async allIncomplete(cals) { guard(); return Reminder._filter(cals, (r) => !r.isCompleted); }
}

// ════════ 模块加载 ════════
const modules = {};
function loadModule(name) {
  if (modules[name]) return modules[name];
  const sandbox = {
    Color, Size, LinearGradient, Font, DateFormatter, ListWidget, FileManager,
    Calendar, CalendarEvent, Reminder,
    importModule: loadModule,
    module: { exports: {} }, console, Date, Math, JSON, Object, Array, String, Number, Set, Promise,
  };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, name + ".js"), "utf8"), sandbox);
  modules[name] = sandbox.module.exports;
  return modules[name];
}
const Core = loadModule("WidgetCore");
const TaskStore = loadModule("TaskStore");

const ok = (cond, msg) => {
  if (!cond) { console.error("❌ " + msg); process.exitCode = 1; }
  else console.log("   ✓ " + msg);
};

(async () => {

// ════════ 1. 数据文件 ════════
console.log("\n【数据文件】");
const files = {
  "daily-restart": "data/daily-restart.json",
  "daodejing": "data/daodejing.json",
  "tasks-earth": "data/tasks-earth.json",
  "tasks-evil": "data/tasks-evil.json",
};
const loaded = {};
for (const [k, f] of Object.entries(files)) {
  loaded[k] = JSON.parse(fs.readFileSync(path.join(__dirname, f), "utf8"));
}
ok(loaded["daily-restart"].quotes.length === 30, "名言 30 条");
ok(loaded["daily-restart"].goals.length === 25, "最小目标 25 条");
ok(loaded["daodejing"].verses.length === 36, "道德经 36 条");

const pool = loaded["tasks-earth"].tasks.concat(loaded["tasks-evil"].tasks);
console.log("   地球Online %d 条 / 恶女Online %d 条 / 合计 %d 条",
  loaded["tasks-earth"].tasks.length, loaded["tasks-evil"].tasks.length, pool.length);

pool.forEach((t, i) => {
  if (!t.text || !t.type || !t.rarity || !t.tag) throw new Error("任务 " + i + " 字段缺失");
});
ok(new Set(pool.map((t) => t.text)).size === pool.length, "任务文案无重复");
ok(pool.every((t) => t.text.length <= 24), "任务文案都 ≤24 字（一行放得下）");

// ════════ 2. 按日种子随机 ════════
console.log("\n【随机抽取】");
const a = Core.pickRandomOfDay(pool, 3, []);
const b = Core.pickRandomOfDay(pool, 3, []);
ok(JSON.stringify(a) === JSON.stringify(b), "同一天多次调用结果完全一致（不会变成老虎机）");
ok(new Set(a.map((x) => x.text)).size === 3, "一次抽 3 条互不重复");

const avoid = a.map((x) => x.text);
const c = Core.pickRandomOfDay(pool, 3, avoid);
ok(c.every((x) => avoid.indexOf(x.text) < 0), "近期用过的会被避开");

// 换一天：直接验证种子函数对不同 day 产出不同序列
const r1 = Core.seededRandom(2026 * 1000 + 236)();
const r2 = Core.seededRandom(2026 * 1000 + 237)();
ok(r1 !== r2, "跨天种子不同，抽取会变");

// ════════ 3. 生成器 ════════
console.log("\n【每日生成器】");
const LIST = "地球Online";
const todayAt = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d; };

// 场景 A：日历空 → 补满 3 条
let res = await TaskStore.generateToday({ listName: LIST, pool, target: 3 });
ok(res.status === "generated" && res.added === 3, "日历空 → 补 3 条（实际 " + res.added + "）");
ok(store.reminders.length === 3, "确实写进了提醒事项");
ok(store.reminders.every((r) => r.calendar.title === LIST), "只写进专用列表");
ok(store.reminders.every((r) => r.dueDateIncludesTime === false), "只标日期，不弹时间提醒");

// 场景 B：同一天再跑 → 不重复生成
res = await TaskStore.generateToday({ listName: LIST, pool, target: 3 });
ok(res.status === "already" && store.reminders.length === 3, "同一天再跑不会重复创建");

// 场景 C：勾选状态能读回来（这就是「完成后不会消失」的验证）
store.reminders[0].isCompleted = true;
let tasks = await TaskStore.readTodayTasks({ listName: LIST });
ok(tasks.length === 3, "已完成的任务仍然读得到，没有消失");
ok(tasks.filter((t) => t.done).length === 1, "已完成 1 条，状态正确");

// 场景 D：日历已有 2 个安排 → 只补 1 条
fs.rmSync(TMP, { recursive: true, force: true });
store.reminders = [];
store.events = [
  { title: "10:00 部门周会", isAllDay: false, startDate: todayAt(10), endDate: todayAt(11) },
  { title: "19:00 牙医", isAllDay: false, startDate: todayAt(19), endDate: todayAt(20) },
  { title: "同事生日", isAllDay: true, startDate: todayAt(0), endDate: todayAt(23) },
];
res = await TaskStore.generateToday({ listName: LIST, pool, target: 3 });
ok(res.existing === 2, "全天事件不算名额，限时事件算（existing=" + res.existing + "）");
ok(res.added === 1, "已有 2 条 → 只补 1 条（实际 " + res.added + "）");

tasks = await TaskStore.readTodayTasks({ listName: LIST });
ok(tasks.length === 3 && tasks[0].kind === "主线" && tasks[2].kind === "支线",
   "主线（日历）排在前，支线（生成）排在后");
ok(tasks[0].done === true, "已经结束的会议自动标记为完成");

// 场景 E：日历已排满 3 条 → 一条都不补
fs.rmSync(TMP, { recursive: true, force: true });
store.reminders = [];
store.events.push({ title: "21:00 健身", isAllDay: false, startDate: todayAt(21), endDate: todayAt(22) });
res = await TaskStore.generateToday({ listName: LIST, pool, target: 3 });
ok(res.added === 0, "今天已经够忙 → 不再发任务");

// 场景 F：过期任务清理
fs.rmSync(TMP, { recursive: true, force: true });
store.events = [];
const old = new Reminder();
old.title = "昨天没做完的"; old.calendar = store.calendars[LIST];
old.dueDate = new Date(Date.now() - 36 * 3600 * 1000);
old.save();
res = await TaskStore.generateToday({ listName: LIST, pool, target: 3 });
ok(res.cleaned === 1, "昨天遗留的未完成任务被清掉");
ok(store.reminders.every((r) => r.title !== "昨天没做完的"), "确认已删除");

// 场景 G：权限被拒 → 退回快照
store.denied = true;
const fallbackRes = await TaskStore.readForWidget({ listName: LIST });
ok(fallbackRes.source === "snapshot" && fallbackRes.tasks.length === 3,
   "权限异常时退回今早的快照，组件不会开天窗");
store.denied = false;

// ════════ 4. 渲染 ════════
console.log("\n【渲染】");
const view = {
  icon: "✦", title: "每日重启",
  primary: "慢慢来，比较快。", secondary: "— 吴念真",
  tasks: [
    { title: "10:00 部门周会", done: true, kind: "主线" },
    { title: "喝完一整杯水", done: false, kind: "支线" },
    { title: "今天有一次不解释理由", done: false, kind: "支线" },
  ],
};
["accessoryRectangular", "small", "medium", undefined].forEach((family) => {
  drawn = [];
  Core.render(new ListWidget(), view, { accent: "#f5c842" }, family);
  const marks = drawn.filter((x) => x === "✓" || x === "○").length;
  console.log("   render(%s) → %d 节点，%d 个勾选框，进度 %s",
    family || "preview", drawn.length, marks, drawn.indexOf("1/3") >= 0 ? "1/3 ✓" : "—");
});

drawn = [];
Core.render(new ListWidget(), view, {}, "medium");
ok(drawn.indexOf("✓") >= 0 && drawn.indexOf("○") >= 0, "已完成 ✓ 与未完成 ○ 同时出现");
ok(drawn.indexOf("1/3") >= 0, "中号组件显示进度 1/3");

// 全部完成 → 锁屏改显示名言
drawn = [];
Core.render(new ListWidget(), Object.assign({}, view, {
  tasks: view.tasks.map((t) => Object.assign({}, t, { done: true })),
}), {}, "accessoryRectangular");
ok(drawn.indexOf("慢慢来，比较快。") >= 0, "任务全部完成时，锁屏把名言作为奖励显示出来");

// 无任务 → 退回老版「今日目标」
drawn = [];
Core.render(new ListWidget(), {
  icon: "✦", title: "每日重启", primary: "慢慢来，比较快。",
  tag: "🥤 今天多喝一杯水", tagLabel: "今日目标",
}, {}, "medium");
ok(drawn.indexOf("🥤 今天多喝一杯水") >= 0, "一条任务都没有时，优雅退回「今日目标」");

// ════════ 5. 回归：道德经组件没改过，但依赖被重写的 WidgetCore ════════
console.log("\n【道德经组件回归】");
const v = loaded["daodejing"].verses.reduce((a, b) => (b.pinyin.length > a.pinyin.length ? b : a));
console.log("   用最长的一条测：%s（拼音 %d 字符）", v.chapter, v.pinyin.length);

const ddView = {
  icon: "☷", title: "道德经 · 每日一句", lockTitle: "道德经 · " + v.chapter,
  primary: "「" + v.text + "」", secondary: v.pinyin, detail: v.explain,
  tag: v.chapter, tagLabel: "出处", tagAccent: false, lockBottom: v.pinyin,
};
const DD_THEME = { accent: "#a9c4a0", seal: "#c0563f" };

["accessoryRectangular", "small", "medium"].forEach((family) => {
  drawn = [];
  Core.render(new ListWidget(), ddView, DD_THEME, family);
  const hasText = drawn.some((x) => x.indexOf(v.text) >= 0);
  const hasPinyin = drawn.indexOf(v.pinyin) >= 0;
  ok(hasText && hasPinyin, family + "：原文与拼音都在");
});

drawn = [];
Core.render(new ListWidget(), ddView, DD_THEME, "medium");
ok(drawn.indexOf(v.explain) >= 0, "medium：白话解释仍然显示");
ok(drawn.indexOf("出处  ") >= 0, "medium：章节标签仍然显示");
ok(drawn.every((x) => x !== "○" && x !== "✓"), "没有 tasks 时不会冒出勾选框");

console.log(process.exitCode ? "\n❌ 有用例失败" : "\n✅ 全部通过");
})();
