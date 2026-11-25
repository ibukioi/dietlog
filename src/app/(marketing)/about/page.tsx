import type { Metadata } from "next";

import { Wordmark } from "@/components/wordmark";

import { SiteFooter } from "@/components/site-footer";
import { DISCLAIMER } from "@/domain/copy/analysis-copy";

export const metadata: Metadata = { title: "出典・クレジット・注意事項" };

export default function AboutPage() {
  return (
    <>
      <main className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-10 leading-relaxed">
        <div>
          <Wordmark />
          <h1 className="mt-3 text-2xl font-bold">出典・クレジット・注意事項</h1>
        </div>

        <section className="grid gap-2">
          <h2 className="font-bold">食品成分値</h2>
          <p className="text-sm">
            食品成分値は「日本食品標準成分表（八訂）増補2023年」から引用(又は出典)しています(文部科学省
            科学技術・学術審議会 資源調査分科会報告)。データ更新日
            2026年3月27日のデータファイルを使用し、令和8年3月27日付の正誤表との一致を取り込み時に確認しています。
          </p>
          <ul className="list-disc pl-5 text-sm">
            <li>
              公開ページ:
              <a
                className="underline"
                href="https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html"
                target="_blank"
                rel="noreferrer"
              >
                文部科学省 日本食品標準成分表（八訂）増補2023年
              </a>
            </li>
            <li>
              調理後の食品(ゆで・焼き・油いため等)の重量変化率は、同成分表 第1章
              表12「調理方法の概要および重量変化率表」によります。
            </li>
            <li>
              調理後データがない食材の補正(重量変化率・吸油量・ビタミンとミネラルの残存率)は、成分表の調理前後のデータから本アプリが算出した食品群ごとの中央値です。
            </li>
            <li>
              成分表の値は標準的な値であり、個別の商品やレシピの値とは異なる場合があります。料理・惣菜の値は「目安値」として表示しています。
            </li>
            <li>
              成分表にない外食を材料から推定する機能では、料理の種類・大きさごとの 1
              人前の重さと、外食の味付け(塩・炒め物の油)の量に本アプリの推計値を使います。食材の重さは多さ(メイン・たっぷり・少し)で按分するため、結果は「推定値」(誤差
              ±20〜30% 程度)として表示しています。
            </li>
            <li>本アプリは食品成分データベース(fooddb.mext.go.jp)の画面からデータを取得していません。</li>
          </ul>
        </section>

        <section className="grid gap-2">
          <h2 className="font-bold">市販品の商品データ</h2>
          <p className="text-sm">
            市販品の検索には
            <a className="underline" href="https://world.openfoodfacts.org/" target="_blank" rel="noreferrer">
              Open Food Facts
            </a>
            のデータを利用しています。データベースは
            <a
              className="underline"
              href="https://opendatacommons.org/licenses/odbl/1-0/"
              target="_blank"
              rel="noreferrer"
            >
              Open Database License (ODbL)
            </a>
            、個々の内容は Database Contents License に基づきます。Open Food Facts
            のデータは利用者の投稿によるもので、誤りや欠けがある場合があります。本アプリでは商品画像は表示していません。取得したデータは改変せずに保存し、利用者が修正した値は利用者の商品リストに別に保存しています。
          </p>
        </section>

        <section className="grid gap-2">
          <h2 className="font-bold">基準値</h2>
          <p className="text-sm">
            1日の目標と栄養バランスの判定には、厚生労働省「日本人の食事摂取基準(2025年版)」策定検討会報告書の成人の値を使用しています(令和7年3月25日付の正誤表を確認済み)。
          </p>
        </section>

        <section className="grid gap-2">
          <h2 className="font-bold">注意事項</h2>
          <p className="text-sm">{DISCLAIMER}</p>
          <p className="text-sm">
            本アプリは個人が就職活動用のポートフォリオとして制作した非公式のプロジェクトです。特定の企業・団体とは関係がなく、企業のロゴ・商標は使用していません。
          </p>
        </section>

        <section className="grid gap-2">
          <h2 className="font-bold">データの取り扱い</h2>
          <ul className="list-disc pl-5 text-sm">
            <li>
              プロフィール(生年月・性別・身長・体重・身体活動レベル)は、目標値の計算・BMI
              の参考表示・栄養バランスの判定にだけ使います。氏名や生年月日(日)は取得しません。
            </li>
            <li>お試しモードのデータは、開始から 14 日後に自動で削除されます。設定画面からいつでも削除できます。</li>
            <li>
              料理の写真は縮小してデータベースに保存し、本人だけが表示できます。記録やアカウントを削除すると写真も削除されます。
            </li>
            <li>お試しモードの利用回数の制限のため、IP アドレスはハッシュ化して一時的に保存します。</li>
          </ul>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
