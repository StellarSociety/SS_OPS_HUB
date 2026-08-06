/** Max size for the original file picked before client-side crop/WebP export. */
export const STAFF_PHOTO_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Hard ceiling for the cropped WebP sent to the server. */
export const STAFF_PHOTO_MAX_CROPPED_BYTES = 512 * 1024;

/** Square export size before the server stores WebP. */
export const STAFF_PHOTO_CROP_OUTPUT_PX = 512;

export const STAFF_PHOTO_ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,image/avif,image/heic,image/heif,.heic,.heif";

export const STAFF_PHOTOS_BUCKET = "staff-photos";
