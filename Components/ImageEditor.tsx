/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
import {useEffect, useRef, useState} from 'react';
import {TLAssetId, Box} from 'tldraw';
import {urlToBlob} from '../utils';

const Spinner = () => <div className="spinner"></div>;

export function ImageEditor({
  image,
  onCancel,
  onSave,
  editImageApi,
  initialPrompt,
  overlaySrc,
  overlayDefaultOn = true,
}: {
  image: {assetId: TLAssetId; src: string; bounds: Box};
  onCancel: () => void;
  onSave: (assetId: TLAssetId, newSrc: string) => Promise<void>;
  editImageApi: (
    imageBlob: Blob,
    maskBlob: Blob,
    prompt: string,
    overlayBlob?: Blob,
  ) => Promise<string>;
  initialPrompt?: string;
  overlaySrc?: string;
  overlayDefaultOn?: boolean;
}) {
  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [isLoading, setIsLoading] = useState(false);
  const [brushSize, setBrushSize] = useState(40);
  const [isErasing, setIsErasing] = useState(false);
  const [useOverlay, setUseOverlay] = useState(!!overlaySrc && overlayDefaultOn);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const imageEl = imageRef.current;
    if (!canvas || !imageEl) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = imageEl.clientWidth;
      canvas.height = imageEl.clientHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    if (imageEl.complete) {
      resizeCanvas();
    } else {
      imageEl.onload = resizeCanvas;
    }

    const getCoords = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    };

    const startDrawing = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      isDrawing.current = true;
      const {x, y} = getCoords(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    };

    const draw = (e: MouseEvent | TouchEvent) => {
      if (!isDrawing.current) return;
      e.preventDefault();
      const {x, y} = getCoords(e);

      ctx.globalCompositeOperation = isErasing ? 'destination-out' : 'source-over';
      ctx.strokeStyle = 'white';
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.lineTo(x, y);
      ctx.stroke();
    };

    const stopDrawing = () => {
      isDrawing.current = false;
      ctx.closePath();
    };

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    canvas.addEventListener('touchstart', startDrawing, {passive: false});
    canvas.addEventListener('touchmove', draw, {passive: false});
    canvas.addEventListener('touchend', stopDrawing);

    return () => {
      canvas.removeEventListener('mousedown', startDrawing);
      canvas.removeEventListener('mousemove', draw);
      canvas.removeEventListener('mouseup', stopDrawing);
      canvas.removeEventListener('mouseout', stopDrawing);
      canvas.removeEventListener('touchstart', startDrawing);
      canvas.removeEventListener('touchmove', draw);
      canvas.removeEventListener('touchend', stopDrawing);
    };
  }, [brushSize, isErasing]);

  const handleGenerate = async () => {
    if (!prompt || isLoading) return;
    setIsLoading(true);

    try {
      const imageBlob = await urlToBlob(image.src);

      const maskCanvas = document.createElement('canvas');
      const maskCtx = maskCanvas.getContext('2d');
      const originalImage = imageRef.current;
      if (!maskCtx || !originalImage) throw new Error('Could not process image');

      maskCanvas.width = originalImage.naturalWidth;
      maskCanvas.height = originalImage.naturalHeight;
      // Fill mask base as black (no change), then draw white strokes from visible canvas
      maskCtx.fillStyle = 'black';
      maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
      maskCtx.drawImage(canvasRef.current!, 0, 0, maskCanvas.width, maskCanvas.height);

      const maskBlob = await new Promise<Blob | null>((resolve) =>
        maskCanvas.toBlob(resolve, 'image/png'),
      );

      if (!maskBlob) throw new Error('Could not create mask blob.');

      let overlayBlob: Blob | undefined = undefined;
      if (useOverlay && overlaySrc) {
        overlayBlob = await urlToBlob(overlaySrc);
      }

      const newImageSrc = await editImageApi(
        imageBlob,
        maskBlob,
        prompt,
        overlayBlob,
      );
      await onSave(image.assetId, newImageSrc);
    } catch (error) {
      console.error('Error during image editing:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="image-editor-overlay">
      <div className="image-editor-canvas-container">
        <img
          ref={imageRef}
          src={image.src}
          alt="Image to edit"
          crossOrigin="anonymous"
        />
        <canvas ref={canvasRef} />
        {isLoading && (
          <div className="image-editor-spinner-container">
            <Spinner />
          </div>
        )}
      </div>

      <div className="image-editor-bottom-bar">
        <div className="image-editor-toolbar">
          <button
            onClick={() => setIsErasing(false)}
            className={!isErasing ? 'active' : ''}>
            Brush
          </button>
          <button
            onClick={() => setIsErasing(true)}
            className={isErasing ? 'active' : ''}>
            Eraser
          </button>
          <input
            type="range"
            min="5"
            max="100"
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            title="Brush Size"
          />
          {overlaySrc && (
            <label style={{display: 'flex', alignItems: 'center', gap: 6, color: '#f0f0f0'}}>
              <input
                type="checkbox"
                checked={useOverlay}
                onChange={(e) => setUseOverlay(e.target.checked)}
              />
              Use overlay
            </label>
          )}
        </div>
        <div className="image-editor-prompt-bar">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Pinte em branco onde quer alterar. Descreva a edição..."
            disabled={isLoading}
          />
          {overlaySrc && (
            <div className="prompt-image-preview">
              <img src={overlaySrc} alt="overlay" />
            </div>
          )}
          <button
            onClick={handleGenerate}
            disabled={isLoading || prompt.length === 0}>
            Generate
          </button>
          <button onClick={onCancel} disabled={isLoading}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
