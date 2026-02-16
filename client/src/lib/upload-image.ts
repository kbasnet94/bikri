import { supabase } from "./supabase";

const BUCKET = "product-images";
const MAX_WIDTH = 800;
const MAX_HEIGHT = 800;
const QUALITY = 0.8;

/**
 * Resizes and compresses an image file using Canvas.
 * Returns a Blob that is ≤ ~200KB in most cases.
 */
function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      // Scale down proportionally
      if (width > MAX_WIDTH || height > MAX_HEIGHT) {
        const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas toBlob returned null"));
        },
        "image/jpeg",
        QUALITY,
      );
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Uploads a product/variant image.
 * 1. Compresses the image
 * 2. Tries Supabase Storage first
 * 3. Falls back to a small data-URL if Storage isn't set up
 */
export async function uploadProductImage(file: File): Promise<string> {
  const compressed = await compressImage(file);
  const ext = "jpg"; // always jpeg after compression
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, compressed, {
      cacheControl: "3600",
      upsert: false,
      contentType: "image/jpeg",
    });

  if (!error) {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
    return data.publicUrl;
  }

  // Fallback: convert compressed blob to data-URL (much smaller than raw file)
  console.warn("[uploadProductImage] Storage upload failed, using data-URL fallback:", error.message);
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(compressed);
  });
}
