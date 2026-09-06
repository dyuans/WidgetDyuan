# 生成 81 章全文拼音：pypinyin 打底 + 修正表覆盖
import json, re
from pypinyin import pinyin, Style

chapters = json.load(open("/root/ddj/chapters.json", encoding="utf-8"))
raw_fixes = json.load(open("/root/ddj/fixes.json", encoding="utf-8"))
# 过滤掉以 _ 开头的说明条目
FIXES = {k: v for k, v in raw_fixes.items() if not k.startswith("_")}

HAN = re.compile(r"[一-鿿]")

# 修正表自检：音节数必须与汉字数一致
for phrase, py in FIXES.items():
    if len(phrase) != len(py.split()):
        raise SystemExit(f"修正表有误：「{phrase}」{len(phrase)} 字，但给了 {len(py.split())} 个音节")

def annotate(text):
    """返回与原文逐字对齐的拼音串：汉字给音节，标点原样保留"""
    slots = []          # 每个汉字一个槽
    idx_of_char = []    # 原文位置 -> 槽号（非汉字为 None）
    hans = []
    for ch in text:
        if HAN.match(ch):
            idx_of_char.append(len(hans)); hans.append(ch)
        else:
            idx_of_char.append(None)

    base = pinyin("".join(hans), style=Style.TONE, heteronym=False)
    slots = [b[0] for b in base]

    # 覆盖：在原文中查找修正词组，替换对应槽位
    applied = []
    for phrase, py in FIXES.items():
        syl = py.split()
        start = 0
        while True:
            pos = text.find(phrase, start)
            if pos < 0:
                break
            slot_ids = [idx_of_char[pos + k] for k in range(len(phrase))]
            if all(s is not None for s in slot_ids):
                for k, s in enumerate(slot_ids):
                    slots[s] = syl[k]
                applied.append(phrase)
            start = pos + 1
    return slots, idx_of_char, applied

total_fixed = 0
used = set()
for c in chapters:
    slots, idx_of_char, applied = annotate(c["text"])
    used.update(applied)
    total_fixed += len(applied)

    # 拼回：汉字→音节（空格分隔），标点原样跟在后面
    out = []
    for pos, ch in enumerate(c["text"]):
        s = idx_of_char[pos]
        if s is None:
            if out and out[-1].endswith(" "):
                out[-1] = out[-1].rstrip()
            out.append(ch + " ")
        else:
            out.append(slots[s] + " ")
    c["pinyin"] = "".join(out).strip()

json.dump(chapters, open("/root/ddj/chapters.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

print(f"已注音 {len(chapters)} 章，应用修正 {total_fixed} 处")
unused = set(FIXES) - used
print(f"修正表 {len(FIXES)} 条，命中 {len(used)} 条")
if unused:
    print("未命中（原文里没找到，可能写错了）:", sorted(unused))
print()
for n in (1, 8, 33, 81):
    c = chapters[n - 1]
    print(f"第{n}章 {c['text']}")
    print(f"      {c['pinyin']}\n")
