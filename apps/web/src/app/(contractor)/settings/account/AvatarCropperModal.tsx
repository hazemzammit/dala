'use client';

import { Button, Card } from '@dala/ui-web';
import { useEffect, useRef, useState } from 'react';

const VIEWPORT_SIZE = 280;
const OUTPUT_SIZE = 512; // matches mobile's processAvatarPhoto (photoPipeline.ts)
const OUTPUT_QUALITY = 0.85; // matches mobile's processAvatarPhoto compress: 0.85
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

/**
 * apps/web/src/app/(contractor)/settings/account/AvatarCropperModal.tsx
 *
 * Gap-closure guide §2.6 — web's drag-to-position + scroll-to-zoom
 * equivalent of mobile's pinch-to-zoom crop, over the same underlying
 * square-crop-then-512×512-then-JPEG-0.85 pipeline mobile's
 * `processAvatarPhoto` uses (apps/mobile/src/lib/photoPipeline.ts).
 * A single canvas draw does the crop+resize+encode in one pass — no
 * `browser-image-compression` involved here at all, so this also sidesteps
 * the byte-size-target/iterative-quality bug §2.5's audit found in that
 * library's config elsewhere in this codebase (this component predates
 * that finding for the avatar flow specifically, by construction rather
 * than by follow-up fix).
 */
export function AvatarCropperModal({
  file,
  onCancel,
  onCropped,
}: {
  file: File;
  onCancel: () => void;
  onCropped: (file: File) => void;
}) {
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setImgEl(img);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function baseScale(img: HTMLImageElement) {
    return VIEWPORT_SIZE / Math.min(img.naturalWidth, img.naturalHeight);
  }

  function clampOffset(img: HTMLImageElement, z: number, x: number, y: number) {
    const displayScale = baseScale(img) * z;
    const displayedWidth = img.naturalWidth * displayScale;
    const displayedHeight = img.naturalHeight * displayScale;
    const maxX = Math.max(0, (displayedWidth - VIEWPORT_SIZE) / 2);
    const maxY = Math.max(0, (displayedHeight - VIEWPORT_SIZE) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  }

  function handlePointerDown(e: React.PointerEvent) {
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragState.current || !imgEl) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setOffset(
      clampOffset(imgEl, zoom, dragState.current.originX + dx, dragState.current.originY + dy),
    );
  }

  function handlePointerUp() {
    dragState.current = null;
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    if (!imgEl) return;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom - e.deltaY * 0.002));
    setZoom(next);
    setOffset((current) => clampOffset(imgEl, next, current.x, current.y));
  }

  function handleConfirm() {
    if (!imgEl) return;
    setProcessing(true);

    const displayScale = baseScale(imgEl) * zoom;
    const imageCenterViewportX = VIEWPORT_SIZE / 2 + offset.x;
    const imageCenterViewportY = VIEWPORT_SIZE / 2 + offset.y;

    const sx = (0 - imageCenterViewportX) / displayScale + imgEl.naturalWidth / 2;
    const sy = (0 - imageCenterViewportY) / displayScale + imgEl.naturalHeight / 2;
    const sSize = VIEWPORT_SIZE / displayScale;

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setProcessing(false);
      return;
    }
    ctx.drawImage(imgEl, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    canvas.toBlob(
      (blob) => {
        setProcessing(false);
        if (!blob) return;
        onCropped(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
      },
      'image/jpeg',
      OUTPUT_QUALITY,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card raised className="flex w-full max-w-sm flex-col items-center gap-4 p-6">
        <h2 className="font-display text-lg font-semibold text-neutral-900">
          Ajuster la photo de profil
        </h2>

        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
          className="relative touch-none overflow-hidden rounded-full border border-neutral-200 bg-neutral-100"
          style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE, cursor: 'grab' }}
        >
          {imgEl && (
            <img
              src={imgEl.src}
              alt="Recadrage"
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 select-none"
              style={{
                width: imgEl.naturalWidth * baseScale(imgEl) * zoom,
                height: imgEl.naturalHeight * baseScale(imgEl) * zoom,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
          )}
        </div>

        <p className="text-center text-xs text-neutral-500">
          Faites glisser pour repositionner, molette pour zoomer.
        </p>

        <div className="flex w-full gap-3">
          <Button variant="secondary" onClick={onCancel} className="flex-1">
            Annuler
          </Button>
          <Button onClick={handleConfirm} loading={processing} disabled={!imgEl} className="flex-1">
            Valider
          </Button>
        </div>
      </Card>
    </div>
  );
}
