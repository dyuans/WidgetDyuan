# 切章 + 校验：把 raw.txt 拆成 81 章，检查章号连续、无遗漏
import json, re, sys

CN = "零一二三四五六七八九"
def cn2num(s):
    """把「八十一」「二十」「七」这类中文数字转成整数（限 1-99）"""
    if s.startswith("十"):
        s = "一" + s
    if "十" in s:
        a, _, b = s.partition("十")
        return CN.index(a) * 10 + (CN.index(b) if b else 0)
    return CN.index(s)

chapters = []
for line in open("/root/ddj/raw.txt", encoding="utf-8"):
    line = line.strip()
    if not line:
        continue
    m = re.match(r"^第([零一二三四五六七八九十]+)章\s*(.+)$", line)
    if not m:
        print("!! 无法解析的行:", line[:40]); sys.exit(1)
    n, text = cn2num(m.group(1)), m.group(2).strip()
    chapters.append({"chapter": n, "text": text})

# 校验
nums = [c["chapter"] for c in chapters]
assert nums == list(range(1, 82)), f"章号不连续: 共{len(nums)}章, 缺 {set(range(1,82))-set(nums)}"

han = lambda s: len(re.findall(r"[一-鿿]", s))
total = sum(han(c["text"]) for c in chapters)
lens = sorted(((han(c["text"]), c["chapter"]) for c in chapters), reverse=True)

print(f"章数: {len(chapters)}  总汉字: {total}")
print(f"平均: {total/81:.1f}  最长: 第{lens[0][1]}章 {lens[0][0]}字  最短: 第{lens[-1][1]}章 {lens[-1][0]}字")
print("最长五章:", [f"第{c}章 {n}字" for n, c in lens[:5]])
print("最短五章:", [f"第{c}章 {n}字" for n, c in lens[-5:]])
print()
print("≤80 字（组件可上全文）:", sum(1 for n, _ in lens if n <= 80), "章")
print(">80 字（组件退摘句）:", sum(1 for n, _ in lens if n > 80), "章")

# 标点是否已规范（不应再有小型变体符号）
bad = set(re.findall(r"[﹖﹕﹗﹑]", open("/root/ddj/raw.txt", encoding="utf-8").read()))
print("\n残留异体标点:", bad or "无")

json.dump(chapters, open("/root/ddj/chapters.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("已写入 chapters.json")
