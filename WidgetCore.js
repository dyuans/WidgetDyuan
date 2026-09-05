// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: gray; icon-glyph: cubes;
// WidgetCore — 公共模块
// 职责：远程 JSON 加载 + 本地缓存兜底 + 每日轮转 + 按日种子随机 + 三种尺寸布局
// 用法：const Core = importModule("WidgetCore");
// 注意：本文件必须与主脚本放在同一个 Scriptable 脚本目录下。

// ════════════════════════════════════════════════════════════════
//  一、本地存储
// ════════════════════════════════════════════════════════════════

const CACHE_DIR = "widget-data-cache";

function cacheFilePath(name) {
  const fm = FileManager.local();
  const dir = fm.joinPath(fm.documentsDirectory(), CACHE_DIR);
  if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
  return fm.joinPath(dir, name + ".json");
}

/** 读本地 JSON，不存在或损坏都返回 null */
function loadLocal(name) {
  const fm = FileManager.local();
  const path = cacheFilePath(name);
  if (!fm.fileExists(path)) return null;
  try {
    return JSON.parse(fm.readString(path));
  } catch (e) {
    return null;
  }
}

/** 写本地 JSON，失败静默忽略（不能因为写不了缓存就渲染不出组件） */
function saveLocal(name, payload) {
  try {
    FileManager.local().writeString(cacheFilePath(name), JSON.stringify(payload));
    return true;
  } catch (e) {
    return false;
  }
}

// ════════════════════════════════════════════════════════════════
//  二、远程数据：新鲜期 → 网络 → 旧缓存 → 内置兜底
// ════════════════════════════════════════════════════════════════

/**
 * @param {string} url          远程 JSON 地址
 * @param {string} cacheName    缓存文件名（不含扩展名）
 * @param {object} fallback     网络与缓存都不可用时的内置数据
 * @param {number} maxAgeHours  缓存新鲜期，期内完全不发请求（默认 12 小时）
 * @param {number} timeout      请求超时秒数（默认 6，小组件不能久等）
 * @returns {Promise<{data: object, source: string}>}
 *          source: remote | cache | cache-stale | fallback
 */
async function loadData({ url, cacheName, fallback, maxAgeHours = 12, timeout = 6 }) {
  const now = Date.now();
  const cached = loadLocal(cacheName);

  if (cached && cached.fetchedAt && now - cached.fetchedAt < maxAgeHours * 3600 * 1000) {
    return { data: cached.data, source: "cache" };
  }

  try {
    const sep = url.indexOf("?") >= 0 ? "&" : "?";
    const req = new Request(url + sep + "_=" + now);
    req.timeoutInterval = timeout;
    const data = await req.loadJSON();
    if (!data || typeof data !== "object") throw new Error("bad payload");
    saveLocal(cacheName, { fetchedAt: now, data });
    return { data, source: "remote" };
  } catch (e) {
    if (cached && cached.data) return { data: cached.data, source: "cache-stale" };
    return { data: fallback, source: "fallback" };
  }
}

// ════════════════════════════════════════════════════════════════
//  三、日期与随机
// ════════════════════════════════════════════════════════════════

function dayOfYear(date) {
  const d = date || new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / (1000 * 60 * 60 * 24));
}

/**
 * 连续递增的「第几天」，跨年不归零。
 * 用 dayOfYear 取模会有两个毛病：条目数超过 365 时，多出来的永远轮不到；
 * 而且每年同一天显示同一条。用绝对天数就没有这两个问题。
 */
function absoluteDay(date) {
  const d = date || new Date();
  const localMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(localMidnight.getTime() / 86400000);
}

/** YYYY-MM-DD，用作「今天是否已生成」的标记 */
function dateKey(date) {
  const d = date || new Date();
  const p = (n) => (n < 10 ? "0" + n : "" + n);
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

/** 顺序轮转：每天前进一条，走完整个列表再从头开始，不漏条目 */
function pickOfDay(list, offset) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const i = (absoluteDay() + (offset || 0)) % list.length;
  return list[(i + list.length) % list.length]; // 防负数
}

/** mulberry32：小而够用的确定性伪随机数生成器 */
function seededRandom(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 按「今天」为种子随机抽 n 条，当天多次调用结果完全一致，跨天才变。
 * 这正是小组件需要的：一天被唤醒几十次也不会变成老虎机。
 * @param {Array}  pool     候选池
 * @param {number} n        要抽几条
 * @param {Array}  exclude  近期已用过的标识，尽量避开
 * @param {function} keyOf  从条目取标识，默认取 item.text
 */
function pickRandomOfDay(pool, n, exclude, keyOf) {
  if (!Array.isArray(pool) || pool.length === 0) return [];
  const key = keyOf || ((x) => (x && x.text) || String(x));
  const avoid = new Set(exclude || []);
  const rand = seededRandom(absoluteDay());

  // Fisher-Yates，用同一个种子流
  const shuffled = pool.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = tmp;
  }

  const fresh = shuffled.filter((x) => !avoid.has(key(x)));
  const picked = fresh.slice(0, n);
  // 新鲜的不够就允许重复用旧的补齐
  if (picked.length < n) {
    for (const x of shuffled) {
      if (picked.length >= n) break;
      if (picked.indexOf(x) < 0) picked.push(x);
    }
  }
  return picked;
}

// ════════════════════════════════════════════════════════════════
//  四、渲染
// ════════════════════════════════════════════════════════════════

const THEME_DEFAULTS = {
  gradient: ["#111008", "#0a0a0a"],
  accent: "#f5c842",
  seal: null,               // 图标/角标色，留空跟随 accent
  textPrimary: "#f0ede8",
  textSecondary: "#a09890",
  subtle: "#a09890",
  tagBg: "#1a1508",
  line: "#f5c842",
  done: "#6b6459",          // 已完成任务的文字色
};

function color(hex, alpha) {
  return new Color(hex, alpha === undefined ? 1 : alpha);
}

function mergeTheme(theme) {
  const t = Object.assign({}, THEME_DEFAULTS, theme || {});
  if (!t.seal) t.seal = t.accent;
  return t;
}

function applyGradient(widget, t) {
  const g = new LinearGradient();
  g.colors = [color(t.gradient[0]), color(t.gradient[1])];
  g.locations = [0, 1];
  widget.backgroundGradient = g;
}

/** 全宽 1px 分隔线：宽度给 0 再塞 spacer 才能真正撑满 */
function addDivider(stack, t) {
  const line = stack.addStack();
  line.backgroundColor = color(t.line, 0.35);
  line.size = new Size(0, 1);
  line.addSpacer();
}

/** 一行任务：○ 未完成 / ✓ 已完成（用可着色的字符，不用 emoji） */
function addTaskRow(stack, task, t, fontSize) {
  const row = stack.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();

  const mark = row.addText(task.done ? "✓" : "○");
  mark.font = Font.boldSystemFont(fontSize);
  mark.textColor = color(task.done ? t.accent : t.textSecondary, task.done ? 1 : 0.75);

  row.addSpacer(5);

  const label = row.addText(task.title);
  label.font = Font.systemFont(fontSize);
  label.textColor = task.done ? color(t.done) : color(t.textPrimary);
  label.lineLimit = 1;
  label.minimumScaleFactor = 0.65;
}

function progressText(tasks) {
  if (!tasks || tasks.length === 0) return null;
  const done = tasks.filter((x) => x.done).length;
  return done + "/" + tasks.length;
}

/** 底部胶囊标签（没有任务清单时才用） */
function addTag(stack, view, t, fontSize) {
  const tag = stack.addStack();
  tag.layoutHorizontally();
  tag.centerAlignContent();
  tag.backgroundColor = color(t.tagBg);
  tag.cornerRadius = 6;
  tag.setPadding(4, 8, 4, 8);

  if (view.tagLabel) {
    const label = tag.addText(view.tagLabel + "  ");
    label.font = Font.boldSystemFont(fontSize - 1);
    label.textColor = color(t.textSecondary);
  }
  const text = tag.addText(view.tag);
  text.font = Font.mediumSystemFont(fontSize);
  text.textColor = color(view.tagAccent === false ? t.seal : t.accent);
  text.lineLimit = 1;
  text.minimumScaleFactor = 0.7;
}

// ─── 锁屏矩形（AccessoryRectangular）─────────────────────────────
function buildLockscreen(widget, view, t) {
  widget.backgroundColor = new Color("#000000", 0); // 锁屏必须透明底

  const stack = widget.addStack();
  stack.layoutVertically();
  stack.spacing = 1;

  // 顶部：标题 + 进度
  const head = stack.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();
  if (view.icon) {
    const ic = head.addText(view.icon);
    ic.font = Font.systemFont(8);
    ic.textColor = color(t.seal);
    head.addSpacer(3);
  }
  const label = head.addText(view.lockTitle || view.title);
  label.font = Font.boldSystemFont(8);
  label.textColor = color(t.accent);

  const prog = progressText(view.tasks);
  if (prog) {
    head.addSpacer(4);
    const p = head.addText(prog);
    p.font = Font.boldSystemFont(8);
    p.textColor = color(t.textSecondary);
  }

  stack.addSpacer(2);

  if (view.tasks && view.tasks.length > 0) {
    const pending = view.tasks.filter((x) => !x.done);
    if (pending.length === 0) {
      // 全部完成 → 把名言当作奖励显示出来
      const done = stack.addText(view.primary);
      done.font = Font.systemFont(10.5);
      done.textColor = color(t.textPrimary);
      done.lineLimit = 2;
      done.minimumScaleFactor = 0.6;
    } else {
      pending.slice(0, 2).forEach((task) => addTaskRow(stack, task, t, 10));
    }
    return;
  }

  // 没有任务清单时，退回「名言 + 底行」的老样子
  const primary = stack.addText(view.primary);
  primary.font = Font.systemFont(11.5);
  primary.textColor = color(t.textPrimary);
  primary.lineLimit = 2;
  primary.minimumScaleFactor = 0.6;

  const bottom = view.lockBottom !== undefined ? view.lockBottom
               : (view.secondary || view.tag);
  if (bottom) {
    stack.addSpacer(3);
    const line = stack.addText(bottom);
    line.font = Font.systemFont(9);
    line.textColor = color(view.lockBottomAccent === true ? t.accent : t.subtle);
    line.lineLimit = 1;
    line.minimumScaleFactor = 0.6;
  }
}

// ─── 桌面小号（Small）───────────────────────────────────────────
function buildSmall(widget, view, t) {
  widget.backgroundColor = color(t.gradient[1]);
  applyGradient(widget, t);

  const main = widget.addStack();
  main.layoutVertically();
  main.setPadding(12, 12, 12, 12);
  main.spacing = 4;

  const head = main.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();
  if (view.icon) {
    const ic = head.addText(view.icon);
    ic.font = Font.boldSystemFont(9);
    ic.textColor = color(t.seal);
    head.addSpacer(4);
  }
  const title = head.addText(view.title);
  title.font = Font.boldSystemFont(9);
  title.textColor = color(t.accent);

  const prog = progressText(view.tasks);
  if (prog) {
    head.addSpacer();
    const p = head.addText(prog);
    p.font = Font.boldSystemFont(9);
    p.textColor = color(t.textSecondary);
  }

  main.addSpacer(2);

  const hasTasks = view.tasks && view.tasks.length > 0;

  const q = main.addText(view.primary);
  q.font = Font.systemFont(hasTasks ? 11 : 12.5);
  q.textColor = color(t.textPrimary);
  q.lineLimit = hasTasks ? 2 : 3;
  q.minimumScaleFactor = 0.6;

  if (!hasTasks && view.secondary) {
    const s = main.addText(view.secondary);
    s.font = Font.systemFont(8);
    s.textColor = color(t.subtle);
    s.lineLimit = 2;
    s.minimumScaleFactor = 0.6;
  }

  main.addSpacer();

  if (hasTasks) {
    view.tasks.slice(0, 3).forEach((task) => addTaskRow(main, task, t, 9.5));
  } else if (view.tag) {
    addTag(main, { tag: view.tag, tagAccent: view.tagAccent }, t, 9);
  }
}

// ─── 桌面中号（Medium）──────────────────────────────────────────
function buildMedium(widget, view, t) {
  widget.backgroundColor = color(t.gradient[1]);
  applyGradient(widget, t);

  const main = widget.addStack();
  main.layoutVertically();
  main.setPadding(14, 16, 14, 16);
  main.spacing = 5;

  const head = main.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();
  if (view.icon) {
    const ic = head.addText(view.icon);
    ic.font = Font.boldSystemFont(11);
    ic.textColor = color(t.seal);
    head.addSpacer(5);
  }
  const title = head.addText(view.title);
  title.font = Font.boldSystemFont(11);
  title.textColor = color(t.accent);

  head.addSpacer();

  const prog = progressText(view.tasks);
  if (prog) {
    const p = head.addText(prog);
    p.font = Font.boldSystemFont(10);
    p.textColor = color(t.accent);
    head.addSpacer(6);
  }

  const df = new DateFormatter();
  df.dateFormat = "M月d日";
  const date = head.addText(df.string(new Date()));
  date.font = Font.systemFont(10);
  date.textColor = color(t.textSecondary);

  addDivider(main, t);
  main.addSpacer(1);

  const hasTasks = view.tasks && view.tasks.length > 0;

  const q = main.addText(view.primary);
  q.font = Font.systemFont(hasTasks ? 13 : 15);
  q.textColor = color(t.textPrimary);
  q.lineLimit = 2;
  q.minimumScaleFactor = 0.7;

  if (view.secondary) {
    const s = main.addText(view.secondary);
    s.font = Font.systemFont(hasTasks ? 9 : 9.5);
    s.textColor = color(t.subtle);
    s.lineLimit = hasTasks ? 1 : 2; // 有任务时让位给清单，没任务时给长拼音留两行
    s.minimumScaleFactor = 0.7;
  }

  if (view.detail) {
    main.addSpacer(2);
    const d = main.addText(view.detail);
    d.font = Font.systemFont(10.5);
    d.textColor = color(t.textSecondary);
    d.lineLimit = hasTasks ? 1 : 3;
    d.minimumScaleFactor = 0.8;
  }

  main.addSpacer();

  if (hasTasks) {
    view.tasks.slice(0, 3).forEach((task) => addTaskRow(main, task, t, 11));
  } else if (view.tag) {
    addTag(main, view, t, 10);
  }
}

/**
 * 按当前小组件尺寸渲染。
 * @param {ListWidget} widget
 * @param {object} view   {icon,title,primary,secondary,detail,tag,tagLabel,tasks,
 *                         lockTitle,lockBottom,lockBottomAccent}
 *                        tasks: [{title:string, done:bool, kind?:string}]
 * @param {object} theme  见 THEME_DEFAULTS
 * @param {string} family config.widgetFamily
 */
function render(widget, view, theme, family) {
  const t = mergeTheme(theme);
  if (family === "accessoryRectangular") {
    buildLockscreen(widget, view, t);
  } else if (family === "small") {
    buildSmall(widget, view, t);
  } else {
    buildMedium(widget, view, t);
  }
}

module.exports = {
  loadData, loadLocal, saveLocal,
  dayOfYear, absoluteDay, dateKey, pickOfDay, pickRandomOfDay, seededRandom,
  render, THEME_DEFAULTS,
};
