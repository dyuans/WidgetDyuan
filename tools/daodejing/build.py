# 合成 data/daodejing.json 并校验
import json, re, sys

chapters = json.load(open("/root/ddj/chapters.json", encoding="utf-8"))
meta = {}
for f in ("meta1.json", "meta2.json"):
    meta.update(json.load(open(f"/root/ddj/{f}", encoding="utf-8")))

HAN = re.compile(r"[一-鿿]")
bad = 0
def fail(m):
    global bad
    print("  ❌", m); bad += 1

out = []
for c in chapters:
    n = c["chapter"]
    m = meta.get(str(n))
    if not m:
        fail(f"第{n}章缺少 title/key/explain"); continue

    # 摘句必须真的出自本章原文
    if m["key"] not in c["text"]:
        fail(f"第{n}章摘句不是原文子串：{m['key']}")

    # 拼音音节数必须与汉字数一致
    nh = len(HAN.findall(c["text"]))
    # 标点是黏在音节后面的（如 "dào，"），所以直接抽取字母串来数
    npy = len(re.findall(r"[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüńňǹ]+", c["pinyin"]))
    if nh != npy:
        fail(f"第{n}章 汉字{nh} 音节{npy} 不匹配")

    out.append({
        "chapter": n,
        "title": m["title"],
        "text": c["text"],
        "pinyin": c["pinyin"],
        "explain": m["explain"],
        "key": m["key"],
    })

if len(out) != 81 or [x["chapter"] for x in out] != list(range(1, 82)):
    fail("章号不是 1-81 连续")

for x in out:
    if len(x["key"]) > 24:
        fail(f"第{x['chapter']}章摘句过长（{len(x['key'])}字）：{x['key']}")
    if not (20 <= len(x["explain"]) <= 130):
        fail(f"第{x['chapter']}章解释长度异常（{len(x['explain'])}字）")

if bad:
    print(f"\n❌ {bad} 处问题"); sys.exit(1)

lens = [len(HAN.findall(x["text"])) for x in out]
short = sum(1 for L in lens if L <= 80)
print(f"章数 {len(out)}  总汉字 {sum(lens)}")
print(f"组件可上全文（≤80字）{short} 章 / 退摘句 {81-short} 章")
print(f"摘句最长 {max(len(x['key']) for x in out)} 字，解释平均 {sum(len(x['explain']) for x in out)//81} 字")

doc = {
    "_comment": "《道德经》全本 81 章，一章一条。text=原文（用户提供的通行本底本，未作校改），pinyin=按 pypinyin 生成并叠加古读修正表，explain=白话解释（自撰，非抄录他处译文），key=该章摘句，组件放不下全文时显示。title 为传统章题。",
    "chapters": out,
}
json.dump(doc, open("/root/ddj/daodejing.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)
print("\n✅ 已写入 daodejing.json")
