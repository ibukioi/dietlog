"""
成分表 第1章 表12「調理方法の概要および重量変化率表」から、食品番号ごとの重量変化率を抜き出す。

PDF のテキストは列が崩れるため、pdfplumber で単語の x 座標を使って
「食品番号列(x<50)」と「重量変化率列(x>=535)」を行の近さで対応づける。
出力は data/manual/table12_weight_change.csv(手作業での確認対象。コミットする)。

使い方(一度だけ実行する転記補助。アプリの実行には不要):
  python -I scripts/data/extract_table12.py <成分表PDF> data/manual/table12_weight_change.csv
"""
import csv
import re
import sys

import pdfplumber

pdf_path, out_path = sys.argv[1], sys.argv[2]
FOOD = re.compile(r"^\d{5}$")
NUM = re.compile(r"^\(?\d+(?:\.\d+)?\)?$")

rows = {}
with pdfplumber.open(pdf_path) as pdf:
    # 表12 は電子書籍 PDF の 39〜63 ページ付近。見出しで範囲を確認する
    for pno in range(36, 70):
        page = pdf.pages[pno]
        text = page.extract_text() or ""
        if "重量変化率" not in text:
            continue
        words = page.extract_words()
        foods = [w for w in words if w["x0"] < 50 and FOOD.match(w["text"])]
        rates = [w for w in words if w["x0"] >= 535 and NUM.match(w["text"])]
        for f in foods:
            near = sorted(
                (r for r in rates if abs(r["top"] - f["top"]) <= 12),
                key=lambda r: abs(r["top"] - f["top"]),
            )
            plain = [r for r in near if not r["text"].startswith("(")]
            batter = [r for r in rates if r["text"].startswith("(") and 0 <= r["top"] - f["top"] <= 20]
            if not plain:
                continue
            rows[f["text"]] = (
                plain[0]["text"],
                batter[0]["text"].strip("()") if batter else "",
                pno + 1,
            )

with open(out_path, "w", newline="", encoding="utf-8") as fp:
    w = csv.writer(fp)
    w.writerow(["food_no", "weight_change_rate", "weight_change_rate_with_batter", "pdf_page"])
    for k in sorted(rows):
        w.writerow([k, *rows[k]])
print(len(rows), "rows")
