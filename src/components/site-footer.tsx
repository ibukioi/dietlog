import Link from "next/link";

const linkClass = "underline underline-offset-2";

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className={linkClass} href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

/** 出典表記(§7.1・§7.4)と非公式・免責の表記(§9)。全画面に表示する */
export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-white/60">
      <div className="mx-auto grid max-w-5xl gap-3 px-4 py-8 text-xs leading-relaxed text-muted-foreground">
        <section className="grid gap-1.5" aria-labelledby="footer-sources">
          <h2 id="footer-sources" className="font-medium text-foreground">
            出典
          </h2>
          <ul className="grid list-disc gap-1 pl-4">
            <li>
              文部科学省 科学技術・学術審議会 資源調査分科会「
              <Ext href="https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html">
                日本食品標準成分表（八訂）増補2023年
              </Ext>
              」(データ更新日 2026年3月27日、正誤表
              令和8年3月27日適用)。食品成分値は同表から引用。調理後の重量変化率は同表 第1章 表12による。
            </li>
            <li>
              調理後データがない食材の補正値(重量変化率・吸油量・ビタミンとミネラルの残存率)は、本アプリが同表の調理前後の値から算出した食品群ごとの中央値(推計値)。
            </li>
            <li>
              外食を材料から推定するときの料理の大きさ(1
              人前の重さ)と味付け(塩・油)の量は、本アプリの推計値。食品の成分値は同表による。
            </li>
            <li>
              厚生労働省「
              <Ext href="https://www.mhlw.go.jp/stf/newpage_44138.html">日本人の食事摂取基準（2025年版）</Ext>
              」策定検討会報告書(令和6年10月)。1日の目標と栄養バランスの判定に使用。
            </li>
            <li>
              市販品の商品データ: <Ext href="https://world.openfoodfacts.org/">Open Food Facts</Ext>。
              <Ext href="https://opendatacommons.org/licenses/odbl/1-0/">Open Database License (ODbL)</Ext>
              に基づき利用。利用者が修正した値は元データと分けて保存。
            </li>
            <li>
              食品名の読みの推定: <Ext href="https://github.com/takuyaa/kuromoji.js">kuromoji.js</Ext>(Apache License
              2.0、辞書 IPAdic)。
            </li>
          </ul>
        </section>
        <p>
          本アプリは個人が制作した非公式のポートフォリオ作品で、特定の企業とは関係ありません。表示される分析は参考情報であり、医療に代わるものではありません。
        </p>
        <p>
          <Link href="/about" className={linkClass}>
            出典・クレジット・注意事項
          </Link>
        </p>
        <p className="border-t border-border pt-3">
          © 2026 dietlog · Made by <Ext href="https://github.com/ibukioi/dietlog">ibukioi</Ext> with Claude Code
        </p>
      </div>
    </footer>
  );
}
