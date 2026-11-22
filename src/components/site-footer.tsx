import Link from "next/link";

/** 出典表記(§7.1・§7.4)と非公式・免責の表記(§9)。全画面に表示する */
export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-white/60">
      <div className="mx-auto grid max-w-5xl gap-3 px-4 py-8 text-xs leading-relaxed text-muted-foreground">
        <p>
          食品成分値は
          <a
            className="underline underline-offset-2"
            href="https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html"
            target="_blank"
            rel="noreferrer"
          >
            日本食品標準成分表（八訂）増補2023年
          </a>
          から引用(文部科学省、データ更新日 2026年3月27日、正誤表 令和8年3月27日適用)。
        </p>
        <p>
          市販品の商品データ:
          <a
            className="underline underline-offset-2"
            href="https://world.openfoodfacts.org/"
            target="_blank"
            rel="noreferrer"
          >
            Open Food Facts
          </a>
          (Open Database License に基づき利用)。基準値:厚生労働省「日本人の食事摂取基準(2025年版)」。
        </p>
        <p>
          本アプリは個人が制作した非公式のポートフォリオ作品で、特定の企業とは関係ありません。表示される分析は参考情報であり、医療に代わるものではありません。
        </p>
        <p>
          <Link href="/about" className="underline underline-offset-2">
            出典・クレジット・注意事項
          </Link>
        </p>
      </div>
    </footer>
  );
}
