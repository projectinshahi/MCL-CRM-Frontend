// Lead attachments in the browser: early checks that mirror the API (MCL-CRM-Backend/src/lib/files.ts, which
// decides by file content and has the final word) and in-browser compression of photos.
//
// Compression, by type:
//  - JPEG / WEBP photos: redrawn at most 2560 px on the long side and re-encoded at quality 0.82, in the same format.
//    Orientation from the camera's EXIF is applied first; other metadata (including GPS) is not carried over.
//  - PNG: lossless, so only redrawn when larger than 2560 px; transparency is kept.
//  - HEIC, PDF, Word, Excel: uploaded byte-for-byte. Browsers cannot re-encode HEIC, and there is no safe way to
//    shrink documents without risking their content.
// A compressed copy is used only when it is actually smaller; otherwise the original goes up unchanged.

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // per file as uploaded — same as the API
export const MAX_FILES = 5;
const MAX_PHOTO_INPUT = 40 * 1024 * 1024; // a larger photo is accepted only if compression brings it under the limit
const MAX_SIDE = 2560;
const QUALITY = 0.82;

export const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.heic,.heif";
const ALLOWED = /\.(pdf|docx?|xlsx?|jpe?g|png|webp|hei[cf])$/i;
const COMPRESSIBLE = ["image/jpeg", "image/webp", "image/png"];

export type Picked = {
  key: string;
  file: File; // what will be uploaded (the compressed copy when one was made)
  originalSize: number | null; // set only when the file was compressed
  preparing?: boolean;
  error?: string;
};

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const tooBig = (name: string, size: number, after = "") => `“${name}” is ${formatBytes(size)}${after}. Files must be ${MAX_FILE_BYTES / 1024 / 1024} MB or smaller.`;

/** Problem with a file before any work is done on it, or undefined. */
export function precheck(file: File): string | undefined {
  if (file.name.length > 200) return `“${file.name.slice(0, 40)}…” has a name longer than 200 characters. Rename it and try again.`;
  if (!ALLOWED.test(file.name)) return `“${file.name}” isn't a supported file type. Use PDF, Word, Excel, JPG, PNG, WEBP or HEIC.`;
  if (!file.size) return `“${file.name}” is empty.`;
  const limit = COMPRESSIBLE.includes(file.type) ? MAX_PHOTO_INPUT : MAX_FILE_BYTES;
  if (file.size > limit) return tooBig(file.name, file.size);
}

/** Smaller copy of a photo, or null when it cannot be made smaller (or the browser cannot do it). */
export async function shrink(file: File): Promise<File | null> {
  if (!COMPRESSIBLE.includes(file.type) || typeof OffscreenCanvas === "undefined") return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); // decoded off the main thread
  } catch {
    return null; // not decodable here: upload as is, the API checks it
  }
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (file.type === "image/png" && scale === 1) return null;
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvas.convertToBlob({ type: file.type, quality: QUALITY });
    // Same format only (a browser that cannot encode WEBP returns PNG), and only if it actually saved space.
    if (blob.type !== file.type || blob.size >= file.size) return null;
    return new File([blob], file.name, { type: file.type, lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

/** The file ready to upload: compressed when that helps, refused when still over the limit. */
export async function prepare(file: File): Promise<Omit<Picked, "key">> {
  // A photo the browser can't re-encode (out of memory, say) goes as it is: a rejection here left the file
  // "Compressing…" for good, and the form can't be sent until every file is ready.
  const smaller = await shrink(file).catch(() => null);
  const out = smaller ?? file;
  if (out.size > MAX_FILE_BYTES) return { file, originalSize: null, error: tooBig(file.name, out.size, smaller ? " even after compressing" : "") };
  return { file: out, originalSize: smaller ? file.size : null };
}

export const fileKey = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
