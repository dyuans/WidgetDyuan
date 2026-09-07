// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: gray; icon-glyph: tasks;
// TaskStore — 今日任务的读取与生成
// 状态托管给「提醒事项」App：勾选在手机 / 手表 / Mac / Siri 上都能完成并自动同步。
// 读：小组件用（只读，绝不写入）
// 写：只由 TaskGen.js 在每天早上通过「快捷指令」自动化触发一次

const Core = importModule("WidgetCore");

const SNAPSHOT = "today-tasks";   // 本地快照，权限异常时的兜底
const HISTORY_MAX = 40;           // 记住最近用过的任务，避免短期重复

// ════════════════════════════════════════════════════════════════
//  读：拼出今日任务清单
// ════════════════════════════════════════════════════════════════

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * 读今天的任务。日历事件与提醒事项都算数（占名额），我们自己生成的排在后面。
 * 任何一步失败（最常见是小组件里拿不到 EventKit 权限）都返回 null，
 * 由调用方退回本地快照。
 *
 * @returns {Promise<Array<{title,done,kind}>|null>}
 */
async function readTodayTasks({ listName, includeCalendar = true } = {}) {
  try {
    const items = [];
    const now = new Date();

    // ① 日历：今天的限时事件。已经结束的算作已完成。
    if (includeCalendar) {
      const events = await CalendarEvent.today([]);
      events
        .filter((e) => !e.isAllDay && e.title)
        .sort((a, b) => a.startDate - b.startDate)
        .forEach((e) => {
          items.push({ title: e.title, done: e.endDate < now, kind: "主线" });
        });
    }

    // ② 提醒事项：今天到期的全部（含已完成——数据一直在，只是 App 界面默认隐藏）
    const reminders = await Reminder.allDueToday();
    const mine = [];
    reminders.forEach((r) => {
      const own = r.calendar && r.calendar.title === listName;
      const row = { title: r.title, done: r.isCompleted, kind: own ? "支线" : "主线" };
      if (own) mine.push(row);
      else items.push(row);
    });

    // 自己生成的排在别人的安排后面
    return items.concat(mine);
  } catch (e) {
    return null;
  }
}

/** 权限异常时的兜底：读今天早上生成器留下的快照 */
function readSnapshot() {
  const snap = Core.loadLocal(SNAPSHOT);
  if (!snap || snap.date !== Core.dateKey()) return null;
  return snap.tasks || null;
}

/** 小组件用这个：先试实时数据，拿不到就用快照 */
async function readForWidget(opts) {
  const live = await readTodayTasks(opts);
  if (live && live.length > 0) return { tasks: live, source: "live" };
  if (live && live.length === 0) return { tasks: [], source: "live" };
  const snap = readSnapshot();
  if (snap) return { tasks: snap, source: "snapshot" };
  return { tasks: [], source: "none" };
}

// ════════════════════════════════════════════════════════════════
//  写：每天生成一次
// ════════════════════════════════════════════════════════════════

/**
 * 生成今日任务。
 * 1) 今天已生成过就直接返回（除非 force），避免你手动删掉的任务被加回来
 * 2) 清理自己列表里过期未完成的旧任务
 * 3) 数今天已有的安排（日历 + 别的列表的提醒事项）
 * 4) 不够 target 条就从任务库按「日种子随机」补齐，写进专用列表
 * 5) 存快照供小组件兜底
 *
 * @param {string} listName 专用提醒事项列表名
 * @param {Array}  pool     任务库，条目形如 {text,type,rarity,tag}
 * @param {number} target   今日任务总数（默认 3）
 * @param {bool}   force    忽略「今天已生成」标记，强制重来
 */
async function generateToday({ listName, pool, target = 3, force = false, includeCalendar = true }) {
  const today = Core.dateKey();
  const snap = Core.loadLocal(SNAPSHOT) || { history: [] };

  if (!force && snap.date === today) {
    return { status: "already", tasks: snap.tasks || [], added: 0 };
  }

  const cal = await Calendar.findOrCreateForReminders(listName);

  // ── 清理：自己列表里昨天及更早、仍未完成的，删掉 ──
  let cleaned = 0;
  const stale = await Reminder.allIncomplete([cal]);
  const dayStart = startOfToday();
  stale.forEach((r) => {
    if (r.dueDate && r.dueDate < dayStart) {
      r.remove();
      cleaned++;
    }
  });

  // ── force 重跑：先把今天已生成的清掉，否则会越堆越多 ──
  // 下面统计「已有安排」时特意排除了本列表，所以不清就会重复补满 TARGET。
  let replaced = 0;
  if (force) {
    const mineToday = await Reminder.allDueToday([cal]);
    mineToday.forEach((r) => { r.remove(); replaced++; });
  }

  // ── 数已有的：日历事件 + 不属于本列表的今日提醒事项 ──
  let existing = 0;
  if (includeCalendar) {
    const events = await CalendarEvent.today([]);
    existing += events.filter((e) => !e.isAllDay && e.title).length;
  }
  const dueToday = await Reminder.allDueToday();
  existing += dueToday.filter((r) => !(r.calendar && r.calendar.title === listName)).length;

  const need = Math.max(0, target - existing);

  // ── 补齐 ──
  const history = snap.history || [];
  const picked = need > 0 ? Core.pickRandomOfDay(pool, need, history) : [];

  const due = new Date();
  due.setHours(20, 0, 0, 0);

  picked.forEach((task) => {
    const r = new Reminder();
    r.title = task.text;
    r.notes = [task.type, task.rarity, task.tag].filter(Boolean).join(" · ");
    r.calendar = cal;
    r.dueDate = due;
    r.dueDateIncludesTime = false; // 只标日期，不弹时间提醒
    r.save();
  });

  // ── 存快照 ──
  const tasks = (await readTodayTasks({ listName, includeCalendar })) || [];
  const newHistory = picked.map((t) => t.text).concat(history).slice(0, HISTORY_MAX);
  Core.saveLocal(SNAPSHOT, { date: today, tasks, history: newHistory });

  return { status: "generated", tasks, added: picked.length, existing, cleaned, replaced };
}

module.exports = { readTodayTasks, readSnapshot, readForWidget, generateToday, SNAPSHOT };
