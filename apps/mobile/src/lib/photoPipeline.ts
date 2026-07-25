import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';

/**
 * apps/mobile/src/lib/photoPipeline.ts
 *
 * Doc 02 §2.5 / Doc 01 §1.3.11 — every photo captured or picked anywhere in
 * the app (Update Chantier §4.2, Safety incident §3.17) goes through this
 * exact same pass before it ever touches the upload queue:
 *   1. Resize so the LONGEST edge is capped at 1920px (not a fixed width —
 *      a portrait phone photo needs its height capped, not its width, or
 *      it'd still be huge).
 *   2. Re-encode as JPEG at ~80% quality.
 *   3. A second 300px-wide thumbnail derivative, for list/timeline views
 *      that shouldn't have to pull full-size images just to render a row.
 * `expo-image-manipulator` does not carry EXIF through a resize/re-encode
 * pass unless the caller explicitly asks it to (there's no `exif`/`keep`
 * option set here) — this is the same combined
 * compress-and-strip-in-one-pass Doc 02 §2.5 calls for, not two separate
 * steps. Worth a quick manual check on a real device with a GPS-tagged
 * photo before shipping (see the manual test checklist) since exact
 * metadata-retention behavior has shifted across expo-image-manipulator
 * versions before.
 */
export interface ProcessedPhoto {
  /** Full-size compressed image, ready to upload. */
  uri: string;
  /** 300px-wide derivative, for list/timeline thumbnails. */
  thumbnailUri: string;
}

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

  // Only resize if the source is actually bigger than the cap — no point
  // upscaling a smaller photo.
  const resizeAction =
    longestEdge > 1920
      ? width >= height
        ? [{ resize: { width: 1920 } }]
        : [{ resize: { height: 1920 } }]
      : [];

  const main = await ImageManipulator.manipulateAsync(uri, resizeAction, {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const thumb = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 300 } }], {
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return { uri: main.uri, thumbnailUri: thumb.uri };
}
