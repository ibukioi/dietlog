/** 画像をブラウザ側で長辺 maxSide px の JPEG に縮小する(通信量と保存容量を抑える) */
export async function shrinkImage(file: Blob, maxSide = 1024, quality = 0.82): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("画像を変換できませんでした"))), "image/jpeg", quality),
  );
}

/** 記録に写真を付ける。成功すると表示用の URL を返す */
export async function uploadMealPhoto(itemId: string, photo: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", photo, "photo.jpg");
  const res = await fetch(`/api/meal-photos/${itemId}`, { method: "POST", body: form });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error ?? "写真を保存できませんでした");
  return json.url;
}

export async function deleteMealPhoto(itemId: string): Promise<void> {
  const res = await fetch(`/api/meal-photos/${itemId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error("写真を削除できませんでした");
}
