import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';

/**
 * apps/mobile/src/lib/photoPipeline.ts
 *
 * Doc 02 §2.5 — every photo captured or picked anywhere in the app (Update
 * Chantier §4.2, Safety incident §3.17) goes through this exact same pass
 * before it ever touches the upload queue.
 *
 * PHASE 18 REDO — this file briefly (same conversation) carried a
 * 1200px-cap + iterative-200KB-target rewrite, built against a STALE docx
 * snapshot of the cahier des charges rather than this repo's own living
 * spec in `docs/spec/` (confirmed authoritative — docx is older). Read
 * directly from `docs/spec/02-features-field-ops-multi-org-and-roadmap.md`
 * §2.5, word for word: "Resize to a 1920px longest edge... Re-encode as
 * JPEG at ~80% quality." No byte-size target, no iterative step-down loop
 * — anywhere in the real spec. That's exactly what this file did before
 * either rewrite this conversation touched it — the ORIGINAL Phase-17 code
 * was already spec-correct, and the "fix" was actually a regression,
 * caught only once the authoritative doc was actually read instead of the
 * stale one. This version restores that original 1920px/~80% behavior,
 * corrected in place rather than silently reverted without explanation.
 *
 * `expo-image-manipulator` does not carry EXIF through a resize/re-encode
 * pass unless the caller explicitly asks it to (there's no `exif`/`keep`
 * option set here) — this is the same combined compress-and-strip-in-one-
 * pass Doc 01 §1.3.11 calls for, not two separate steps.
 */
export interface ProcessedPhoto {
  /** Full-size compressed image, ready to upload. */
  uri: string;
  /** 300px-wide derivative, for list/timeline thumbnails. */
  thumbnailUri: string;
}

const PHOTO_MAX_EDGE_PX = 1920; // Doc 02 §2.5
const PHOTO_QUALITY = 0.8; // Doc 02 §2.5 "~80% quality"

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error),
    );
  });
}

export async function processPhoto(uri: string): Promise<ProcessedPhoto> {
  const { width, height } = await getImageSize(uri);
  const longestEdge = Math.max(width, height);

  const resizeAction =
    longestEdge > PHOTO_MAX_EDGE_PX
      ? width >= height
        ? [{ resize: { width: PHOTO_MAX_EDGE_PX } }]
        : [{ resize: { height: PHOTO_MAX_EDGE_PX } }]
      : [];

  const result = await ImageManipulator.manipulateAsync(uri, resizeAction, {
    compress: PHOTO_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const thumb = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 300 } }], {
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return { uri: result.uri, thumbnailUri: thumb.uri };
}

/**
 * Doc 03 §3.22.1 — avatar upload. "Square crop enforced client-side, max
 * 512×512 after resize." This is a CENTER crop to the largest square that
 * fits the source image, then a resize down to 512×512 — not the full
 * interactive drag-to-reposition crop tool the spec's "in-app square crop
 * tool" phrase could imply. A real interactive crop UI is a meaningfully
 * bigger lift (gesture-driven crop overlay component, nothing like it
 * exists anywhere in this app yet) than this phase's settings.tsx/
 * projects.tsx scope — disclosed here and in delivery notes, not silently
 * substituted. (Gap list item 15 — still open, scope confirmation pending.)
 */
export async function processAvatarPhoto(uri: string): Promise<string> {
  const { width, height } = await getImageSize(uri);
  const side = Math.min(width, height);
  const originX = Math.round((width - side) / 2);
  const originY = Math.round((height - side) / 2);

  const result = await ImageManipulator.manipulateAsync(
    uri,
    [
      { crop: { originX, originY, width: side, height: side } },
      { resize: { width: 512, height: 512 } },
    ],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

/**
 * Doc 03 §3.22.2 — organization logo. "Max 3:1 aspect box" — center-crops
 * down to 3:1 only if the source is WIDER than 3:1 (a portrait or square
 * logo is left as-is rather than padded/letterboxed, since Doc 03 doesn't
 * specify a fill color for that case and inventing one felt worse than
 * just not cropping when the source is already within the box).
 */
export async function processLogoPhoto(uri: string): Promise<string> {
  const { width, height } = await getImageSize(uri);
  const maxRatio = 3;
  if (width / height <= maxRatio) {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: Math.min(width, 1200) } }],
      {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.PNG,
      },
    );
    return result.uri;
  }

  const targetWidth = Math.round(height * maxRatio);
  const originX = Math.round((width - targetWidth) / 2);
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ crop: { originX, originY: 0, width: targetWidth, height } }, { resize: { width: 1200 } }],
    { compress: 0.9, format: ImageManipulator.SaveFormat.PNG },
  );
  return result.uri;
}
