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

/** 漢字を含むか(含まなければ、正規化だけで読みとして比べられる) */
export function hasKanji(s: string): boolean {
  return /[\p{Script=Han}]/u.test(s);
}

/**
 * 画面内の絞り込み用: 名前にそのまま含まれるか、読みに検索語の読みがすべて含まれるか。
 * readingTerms は漢字を読みに直した語(サーバーで作る)
 */
export function matchesSearch(query: string, text: string, reading: string, readingTerms: string[]): boolean {
  const words = query
    .split(/[\s　]+/)
    .map(normalizeJa)
    .filter(Boolean);
  if (words.length === 0) return true;
  const target = normalizeJa(text);
  if (words.every((w) => target.includes(w))) return true;
  return readingTerms.length > 0 && readingTerms.every((t) => reading.includes(t));
}
