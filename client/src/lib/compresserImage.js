/**
 * Réduit une photo (JPEG/PNG/WEBP) avant envoi : redimensionnée à
 * 2000 px max et réencodée en JPEG qualité 0,82. Les PDF et les
 * fichiers déjà légers (< 1,5 Mo) sont renvoyés tels quels.
 * En cas d'échec, le fichier d'origine est renvoyé.
 */
const COTE_MAX = 2000;
const SEUIL = 1.5 * 1024 * 1024;

export async function compresserImage(file) {
  if (!file?.type?.startsWith("image/") || file.size <= SEUIL) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, COTE_MAX / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * ratio);
    const h = Math.round(bitmap.height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    const nom = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nom, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
