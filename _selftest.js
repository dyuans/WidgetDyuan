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
const QUOTES = loaded["daily-restart"].quotes;
const MOODS = ["起身", "允许", "清醒", "距离", "有趣", "具体"];
console.log("   名言 %d 条 / 最小目标 %d 条 / 道德经 %d 章",
  QUOTES.length, loaded["daily-restart"].goals.length, loaded["daodejing"].chapters.length);

ok(QUOTES.length >= 300, "名言 ≥300 条");
ok(QUOTES.every((q) => q.text && q.src && q.mood), "每条都有正文、出处、情绪分类");
ok(QUOTES.every((q) => MOODS.indexOf(q.mood) >= 0), "mood 都在六类之内");
ok(new Set(QUOTES.map((q) => q.text)).size === QUOTES.length, "正文无重复");

const tooLong = QUOTES.filter((q) => q.text.length > 22);
ok(tooLong.length === 0, "正文都 ≤22 字" + (tooLong.length ? "（超长：" + tooLong[0].text + "）" : ""));

// 出处必须可考：不允许「网络流传」「改编」「自撰」这类含糊来源
const BANNED = ["网络", "流传", "改编", "意境", "自撰", "佚名", "格言", "心理学", "感悟"];
const vague = QUOTES.filter((q) => BANNED.some((b) => q.src.includes(b)));
ok(vague.length === 0, "没有含糊/杜撰的出处" + (vague.length ? "（如：" + vague[0].src + "）" : ""));

const moodCount = {};
QUOTES.forEach((q) => { moodCount[q.mood] = (moodCount[q.mood] || 0) + 1; });
ok(MOODS.every((m) => moodCount[m] >= 20), "六类每类都 ≥20 条：" + JSON.stringify(moodCount));

// ── 轮转覆盖：条目数超过 365 时，按年内天数取模会漏掉一批 ──
const N = QUOTES.length;
const newIdx = new Set(), oldIdx = new Set();
for (let i = 0; i < N; i++) {
  const d = new Date(2026, 11, 20 + i);
  newIdx.add(Core.absoluteDay(d) % N);
  oldIdx.add(Core.dayOfYear(d) % N);
}
ok(newIdx.size === N, `${N} 天内每条都会轮到，一条不漏`);
ok(oldIdx.size < N, `回归对照：旧的按年内天数取模只能覆盖 ${oldIdx.size}/${N} 条`);
ok(Core.absoluteDay(new Date(2027, 0, 1)) - Core.absoluteDay(new Date(2026, 11, 31)) === 1,
   "跨年时天数连续递增，不归零");

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
// 用相对当前时间的偏移，避免用例在一天中不同时刻跑出不同结果
const hoursFromNow = (h) => new Date(Date.now() + h * 3600 * 1000);
store.events = [
  { title: "已开完的周会", isAllDay: false, startDate: hoursFromNow(-2), endDate: hoursFromNow(-1) },
  { title: "还没到的牙医", isAllDay: false, startDate: hoursFromNow(1), endDate: hoursFromNow(2) },
  { title: "同事生日", isAllDay: true, startDate: todayAt(0), endDate: todayAt(23) },
];
res = await TaskStore.generateToday({ listName: LIST, pool, target: 3 });
ok(res.existing === 2, "全天事件不算名额，限时事件算（existing=" + res.existing + "）");
ok(res.added === 1, "已有 2 条 → 只补 1 条（实际 " + res.added + "）");

tasks = await TaskStore.readTodayTasks({ listName: LIST });
ok(tasks.length === 3 && tasks[0].kind === "主线" && tasks[2].kind === "支线",
   "主线（日历）排在前，支线（生成）排在后");
ok(tasks[0].done === true, "已经结束的会议自动标记为完成");
ok(tasks[1].done === false, "还没开始的日程不算完成");

// 场景 E：日历已排满 3 条 → 一条都不补
fs.rmSync(TMP, { recursive: true, force: true });
store.reminders = [];
store.events.push({ title: "晚上的健身", isAllDay: false, startDate: hoursFromNow(3), endDate: hoursFromNow(4) });
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

// ════════ 5. 道德经全本 81 章 ════════
console.log("\n【道德经全本】");
const CH = loaded["daodejing"].chapters;
const han = (s) => (s.match(/[一-鿿]/g) || []).length;

ok(CH.length === 81, "共 81 章");
ok(CH.map((c) => c.chapter).join() === Array.from({ length: 81 }, (_, i) => i + 1).join(),
   "章号 1-81 连续无缺");
ok(CH.every((c) => c.title && c.text && c.pinyin && c.explain && c.key),
   "每章都有 章题/原文/拼音/白话/摘句");

const total = CH.reduce((s, c) => s + han(c.text), 0);
ok(total > 5000 && total < 5600, `全书 ${total} 字，与「五千言」相符`);

// 摘句必须真出自本章原文——否则组件上会显示一句书里没有的话
const fake = CH.filter((c) => c.text.indexOf(c.key) < 0);
ok(fake.length === 0, "摘句都是本章原文的子串" + (fake.length ? `（第${fake[0].chapter}章除外）` : ""));

// 拼音音节数必须与汉字数一一对应
const PY = /[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüńňǹ]+/g;
const mis = CH.filter((c) => han(c.text) !== (c.pinyin.match(PY) || []).length);
ok(mis.length === 0, "逐章拼音音节数 = 汉字数" +
   (mis.length ? `（第${mis[0].chapter}章 ${han(mis[0].text)}字 vs ${(mis[0].pinyin.match(PY)||[]).length}音节）` : ""));

const shortCh = CH.filter((c) => han(c.text) <= 80).length;
console.log("   ≤80字 %d 章（组件上全文）/ >80字 %d 章（退摘句）", shortCh, 81 - shortCh);
ok(shortCh > 40, "多数章节短到能在组件上完整显示");

// ── 渲染：短章上全文，长章退摘句 ──
const DD_THEME = { accent: "#a9c4a0", seal: "#c0563f" };
const mkView = (c) => {
  const isShort = han(c.text) <= 80;
  return {
    icon: "☷", title: "道德经 · 第" + c.chapter + "章",
    lockTitle: "道德经 · 第" + c.chapter + "章",
    primary: isShort ? c.text : c.key,
    primaryFont: isShort ? 12 : 15, primaryLines: isShort ? 5 : 2,
    primaryFontSmall: isShort ? 9.5 : 12.5, primaryLinesSmall: isShort ? 7 : 3,
    detail: c.explain, tag: c.title, tagLabel: "第" + c.chapter + "章", tagAccent: false,
    lockBottom: isShort ? null : c.explain,
  };
};

const shortest = CH.reduce((a, b) => (han(b.text) < han(a.text) ? b : a)); // 第40章 21字
const longest = CH.reduce((a, b) => (han(b.text) > han(a.text) ? b : a));  // 第39章 134字
console.log("   短章样本：第%d章 %d字 / 长章样本：第%d章 %d字",
  shortest.chapter, han(shortest.text), longest.chapter, han(longest.text));

drawn = [];
Core.render(new ListWidget(), mkView(shortest), DD_THEME, "medium");
ok(drawn.indexOf(shortest.text) >= 0, `短章（第${shortest.chapter}章）在组件上显示整章原文`);
ok(drawn.indexOf(shortest.explain) >= 0, "短章同时显示白话解释");

drawn = [];
Core.render(new ListWidget(), mkView(longest), DD_THEME, "medium");
ok(drawn.indexOf(longest.key) >= 0 && drawn.indexOf(longest.text) < 0,
   `长章（第${longest.chapter}章 ${han(longest.text)}字）自动退回摘句，不塞全文`);

["accessoryRectangular", "small", "medium"].forEach((family) => {
  drawn = [];
  Core.render(new ListWidget(), mkView(shortest), DD_THEME, family);
  ok(drawn.length > 0 && drawn.every((x) => x !== "○" && x !== "✓"),
     family + "：正常渲染且不会冒出任务勾选框");
});

// 轮转：81 章 81 天走完一轮，一章不漏
const seen81 = new Set();
for (let i = 0; i < 81; i++) seen81.add(Core.absoluteDay(new Date(2026, 8, 1 + i)) % 81);
ok(seen81.size === 81, "81 天内 81 章全部轮到");

console.log(process.exitCode ? "\n❌ 有用例失败" : "\n✅ 全部通过");
})();
