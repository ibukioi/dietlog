import { expect, test } from "@playwright/test";

/**
 * ハッピーパス: お試し開始 → 自炊を記録 → ゲージが増える → 週次分析
 */
test("お試しモードで自炊を記録し、分析を見られる", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "登録せずに試す" }).click();
  await expect(page).toHaveURL(/\/home/, { timeout: 30_000 });
  await expect(page.getByText("お試しモード")).toBeVisible();

  const energy = page.getByRole("progressbar", { name: "エネルギーの摂取量" });
  const before = Number(await energy.getAttribute("aria-valuenow"));

  // 自炊: ほうれんそうをゆでる
  await page.goto("/log?tab=cook&meal=dinner");
  await page.getByLabel("食材を追加").fill("ほうれん草");
  await page.getByRole("button", { name: /ほうれんそう 葉 通年平均 生/ }).click();
  await page.getByLabel("調理法").selectOption("boil");
  await page.getByLabel("料理名").fill("ほうれん草のおひたし(E2E)");
  // 成分表の調理後データ(ゆで 70%)で計算される: 23 kcal × 70 g / 100 ≒ 16 kcal
  await expect(page.getByText("調理後データ", { exact: true })).toBeVisible();
  await expect(page.getByText(/16 kcal/).first()).toBeVisible();
  await page.getByRole("button", { name: "記録する", exact: true }).click();

  await expect(page).toHaveURL(/\/home/);
  await expect(page.getByText("ほうれん草のおひたし(E2E)", { exact: true })).toBeVisible();
  await expect
    .poll(async () =>
      Number(await page.getByRole("progressbar", { name: "エネルギーの摂取量" }).getAttribute("aria-valuenow")),
    )
    .toBeGreaterThan(before);

  // 分析: サンプルの 6 日分で判定できる。判定不可と注意書きも表示される
  await page.goto("/analysis");
  await expect(page.getByRole("heading", { name: "1週間の栄養バランス" })).toBeVisible();
  await expect(page.getByText("データ不足で判定不可").first()).toBeVisible();
  await expect(page.locator("main").getByText(/医療に代わるものではありません/)).toBeVisible();
});

test("料理・惣菜を目安値で記録できる", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "登録せずに試す" }).click();
  await expect(page).toHaveURL(/\/home/, { timeout: 30_000 });
  await page.goto("/log?tab=dish&meal=lunch");
  await page.getByLabel("料理名で検索").fill("肉じゃが");
  await page
    .getByRole("button", { name: /肉じゃが/ })
    .first()
    .click();
  await page.getByRole("button", { name: "記録する" }).click();
  await expect(page).toHaveURL(/\/home/);
  await expect(page.getByText(/肉じゃが/).first()).toBeVisible();
});
