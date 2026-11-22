/**
 * 日本語検索用の正規化(§1.1)
 * NFKC → 小文字化 → カタカナをひらがなに → 記号・空白を除去
 */
export function katakanaToHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

export function normalizeJa(input: string): string {
  return katakanaToHiragana(input.normalize("NFKC").toLowerCase())
    .replace(/[\s　]+/g, "")
    .replace(/[<>＜＞\[\]［］()（）「」『』【】、。・,.\-–—~〜:;'"!?/\\]/g, "");
}

/**
 * 成分表の食品名から分類括弧を除いた表示名を作る
 *   "＜調味料類＞　（しょうゆ類）　こいくちしょうゆ" → "こいくちしょうゆ"
 *   "こむぎ　［パン類］　角形食パン　食パン" → "こむぎ パン類 角形食パン 食パン"
 */
export function displayNameFromMext(nameRaw: string): string {
  return nameRaw
    .replace(/＜[^＞]*＞/g, "")
    .replace(/^[\s　]*（[^）]*類）/, "")
    .replace(/[［\[]([^］\]]*)[］\]]/g, "$1")
    .replace(/[（(]([^）)]*)[）)]/g, "$1")
    .replace(/　+/g, " ")
    .trim();
}
