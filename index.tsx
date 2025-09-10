/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
// Copyright 2024 Google LLC

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may a copy of the License at

//     https://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
  Chat,
  Content,
  FunctionDeclaration,
  GeneratedImage,
  GeneratedVideo,
  GoogleGenAI,
  Modality,
  Tool,
  // FIX: Import `Type` to use for function declaration schemas.
  Type,
} from '@google/genai';
import { fal } from '@fal-ai/client';
import {useEffect, useRef, useState} from 'react';
import ReactDOM from 'react-dom/client';
import {
  AssetRecordType,
  Box,
  createShapeId,
  DefaultToolbar,
  Editor,
  stopEventPropagation,
  Tldraw,
  TldrawProps,
  TldrawUiButton,
  TldrawUiButtonIcon,
  TldrawUiContextualToolbar,
  TLAssetId,
  TLImageShape,
  // FIX: Import TLShapeId to correctly type shape IDs.
  TLShapeId,
  TLTextShape,
  toRichText,
  track,
  useEditor,
  usePassThroughWheelEvents,
  useToasts,
} from 'tldraw';
import {ImageEditor} from './Components/ImageEditor';
import {PromptBar} from './Components/PromptBar';
import {
  addPlaceholder,
  bloblToBase64,
  createArrowBetweenShapes,
  getImageSize,
  loadIcon,
  placeNewShape,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from './utils';

const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
fal.config({ credentials: process.env.FAL_KEY });

// Use Pro for orchestration (better tool planning/selection)
const GEMINI_MODEL_NAME = 'gemini-2.5-pro';
const IMAGEN_MODEL_NAME = 'imagen-4.0-generate-001';
const GEMINI_IMAGE_MODEL_NAME = 'gemini-2.5-flash-image-preview';
const VEO_MODEL_NAME = 'veo-3.0-generate-001';
// Toggle: draw connector arrows between source and generated items
const ENABLE_CONNECTOR_ARROWS = true;
const TEXT_CARD_MAX_W = 480;

function aspectToSize(aspect: string, base = 1024): string {
  // Returns WxH for fal models based on common aspect ratios
  const [w, h] = aspect.split(':').map((n) => parseInt(n, 10));
  if (!w || !h) return '1024x1024';
  const ratio = w / h;
  if (ratio > 1) {
    return `${Math.round(base)}x${Math.round(base / ratio)}`;
  } else if (ratio < 1) {
    return `${Math.round(base * ratio)}x${Math.round(base)}`;
  }
  return `${base}x${base}`;
}

async function falTextToImages(
  prompt: string,
  numberOfImages = 1,
  aspectRatio = '1:1',
): Promise<string[]> {
  try {
    const size = aspectToSize(aspectRatio, 1024);
    const result: any = await fal.subscribe('fal-ai/flux/schnell', {
      // cast to any to avoid SDK narrow input typings mismatch across versions
      input: {
        prompt,
        image_size: size,
        num_images: numberOfImages,
      } as any,
    } as any);
    const images = (result?.images || result?.data?.images || result?.output?.images || []) as any[];
    return images
      .map((im) => im?.url)
      .filter(Boolean)
      .map((url: string) => url);
  } catch (e) {
    console.error('FAL text-to-image fallback failed', e);
    return [];
  }
}

async function falImageToImages(
  prompt: string,
  imageDataUrl: string,
  numberOfImages = 1,
  aspectRatio = '1:1',
): Promise<string[]> {
  try {
    const size = aspectToSize(aspectRatio, 1024);
    const result: any = await fal.subscribe('fal-ai/flux/dev/image-to-image', {
      input: {
        prompt,
        image_url: imageDataUrl,
        image_size: size,
        num_images: numberOfImages,
      } as any,
    } as any);
    const images = (result?.images || result?.data?.images || result?.output?.images || []) as any[];
    return images
      .map((im) => im?.url)
      .filter(Boolean)
      .map((url: string) => url);
  } catch (e) {
    console.error('FAL image-to-image fallback failed', e);
    return [];
  }
}

async function falInpaint(
  prompt: string,
  imageDataUrl: string,
  maskDataUrl: string,
): Promise<string[]> {
  try {
    const result: any = await fal.subscribe('fal-ai/flux-general/inpainting', {
      input: {
        prompt,
        image_url: imageDataUrl,
        mask_url: maskDataUrl,
      } as any,
    } as any);
    const images = (result?.images || result?.data?.images || result?.output?.images || []) as any[];
    return images
      .map((im) => im?.url)
      .filter(Boolean)
      .map((url: string) => url);
  } catch (e) {
    console.error('FAL inpaint fallback failed', e);
    return [];
  }
}

async function falVeo3Video(
  prompt: string,
  aspectRatio = '16:9',
  imageDataUrl?: string,
): Promise<string[]> {
  try {
    const result: any = await fal.subscribe('fal-ai/veo3', {
      input: {
        prompt,
        aspect_ratio: aspectRatio as any,
        image_url: imageDataUrl,
      } as any,
    } as any);
    const videos = (result?.videos || result?.data?.videos || result?.output?.videos || []) as any[];
    if (videos?.length) {
      return videos.map((v) => v?.url).filter(Boolean);
    }
    // Some endpoints may return single video url
    const single = (result?.video || result?.data?.video || result?.output?.video)?.url;
    return single ? [single] : [];
  } catch (e) {
    console.error('FAL Veo3 video fallback failed', e);
    return [];
  }
}

// Fallback flags + notification hook
type FalFallbackConfig = {
  text2img: boolean;
  img2img: boolean;
  inpaint: boolean;
  video: boolean;
};

let falFallbackConfig: FalFallbackConfig = {
  text2img: true,
  img2img: true,
  inpaint: true,
  video: true,
};

let notifyFallback: ((msg: string) => void) | null = null;
function setFalFallbackConfig(partial: Partial<FalFallbackConfig>) {
  falFallbackConfig = { ...falFallbackConfig, ...partial };
}
function setNotifyFallback(fn: ((msg: string) => void) | null) {
  notifyFallback = fn;
}

async function describeImage(imageBlob: Blob): Promise<string> {
  const imageDataBase64 = await bloblToBase64(imageBlob);

  const textPrompt = `Describe the image`;

  const imagePrompt = {
    inlineData: {
      data: imageDataBase64,
      mimeType: 'image/jpeg',
    },
  };

  const result = await ai.models.generateContent({
    model: GEMINI_MODEL_NAME,
    contents: {parts: [{text: textPrompt}, imagePrompt]},
  });
  return result.text;
}

async function editImage(
  imageBlob: Blob,
  maskBlob: Blob,
  prompt: string,
  overlayBlob?: Blob,
): Promise<string> {
  const imageBase64 = await bloblToBase64(imageBlob);
  const maskBase64 = await bloblToBase64(maskBlob);
  const imagePart = { inlineData: { data: imageBase64, mimeType: 'image/png' } };
  const maskPart = { inlineData: { data: maskBase64, mimeType: 'image/png' } };
  const textPart = { text: prompt };
  const overlayPart = overlayBlob
    ? { inlineData: { data: await bloblToBase64(overlayBlob), mimeType: 'image/png' } }
    : null;

  const response = await ai.models.generateContent({
    model: GEMINI_IMAGE_MODEL_NAME,
    contents: { parts: overlayPart ? [textPart, imagePart, maskPart, overlayPart] : [textPart, imagePart, maskPart] },
    config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
  });
  const imagePartRes = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (imagePartRes?.inlineData) {
    return `data:${imagePartRes.inlineData.mimeType};base64,${imagePartRes.inlineData.data}`;
  }
  throw new Error('Gemini did not return an image for editImage');
}

async function generateImages(
  prompt: string,
  imageBlob: Blob = null,
  numberOfImages = 1,
  aspectRatio = '16:9',
): Promise<string[]> {
  const imageObjects = [];
  // Always use Gemini 2.5 Image model (with or without reference image)
  const baseImageBase64 = imageBlob ? await bloblToBase64(imageBlob) : null;
  const mimeType = baseImageBase64?.match(/data:(.*);base64,/)?.[1] || 'image/png';
  const imagePart = baseImageBase64 ? { inlineData: { mimeType, data: baseImageBase64 } } : null;
  const textPart = { text: prompt };

  for (let i = 0; i < numberOfImages; i++) {
    const res = await ai.models.generateContent({
      model: GEMINI_IMAGE_MODEL_NAME,
      contents: { parts: imagePart ? [imagePart, textPart] : [textPart] },
      config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
    });
    const inline = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    if (inline) {
      imageObjects.push(`data:${inline.mimeType};base64,${inline.data}`);
    }
  }
  if (imageObjects.length === 0) {
    const retryPrompt = `${prompt}\nChange camera angle and lighting, vary background and composition; avoid reproducing the exact scene.`.trim();
    for (let i = 0; i < numberOfImages; i++) {
      const res = await ai.models.generateContent({
        model: GEMINI_IMAGE_MODEL_NAME,
        contents: { parts: imagePart ? [imagePart, { text: retryPrompt }] : [{ text: retryPrompt }] },
        config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
      });
      const inline = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
      if (inline) {
        imageObjects.push(`data:${inline.mimeType};base64,${inline.data}`);
      }
    }
    if (imageObjects.length === 0) {
      throw new Error('Gemini did not return images');
    }
  }
  return imageObjects;
}

async function generateVideo(
  imageBlob: Blob,
  prompt: string,
  numberOfVideos = 1,
  aspectRatio = '16:9',
): Promise<string[]> {
  try {
    let operation = null;
    if (imageBlob) {
      const imageDataBase64 = await bloblToBase64(imageBlob);
      const image = { imageBytes: imageDataBase64, mimeType: 'image/png' };
      operation = await ai.models.generateVideos({
        model: VEO_MODEL_NAME,
        prompt,
        image,
        config: { numberOfVideos, aspectRatio },
      });
    } else {
      operation = await ai.models.generateVideos({
        model: VEO_MODEL_NAME,
        prompt,
        config: { numberOfVideos, aspectRatio },
      });
    }

    while (!operation.done) {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      console.log('...Generating...');
      operation = await ai.operations.getVideosOperation({ operation });
      console.log(operation, operation.error);
    }

    if (operation?.response) {
      const response = operation.response;
      if (
        response.raiMediaFilteredCount &&
        response.raiMediaFilteredReasons.length > 0
      ) {
        throw new Error(response.raiMediaFilteredReasons[0]);
      }
      if (operation?.response.generatedVideos) {
        return await Promise.all(
          response.generatedVideos.map(async (generatedVideo: GeneratedVideo) => {
            const url = decodeURIComponent(generatedVideo.video.uri);
            const res = await fetch(`${url}&key=${process.env.API_KEY}`);
            const blob = await res.blob();
            return bloblToBase64(blob);
          }),
        );
      }
    }
  } catch (e) {
    console.warn('Veo (Google) failed, trying FAL Veo3 fallback', e);
  }

  // Fallback to FAL Veo3
  if (!(process.env.FAL_KEY && falFallbackConfig.video)) {
    return [];
  }
  notifyFallback?.('Usando fallback FAL: video');
  const imageDataUrl = imageBlob ? `data:image/png;base64,${await bloblToBase64(imageBlob)}` : undefined;
  const urls = await falVeo3Video(prompt, aspectRatio, imageDataUrl);
  const out: string[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      out.push(await bloblToBase64(blob));
    } catch {}
  }
  return out;
}

const describeClick = async (editor: Editor) => {
  console.log('describe');
  const shapes = editor.getSelectedShapes();
  shapes
    .filter((shape) => editor.isShapeOfType(shape, 'image'))
    .forEach(async (shape) => {
      console.log('selected image shape:', shape.id);

      const placeholderIds = addPlaceholder(
        editor,
        'Generating description...',
      );
      editor.select(placeholderIds[0]);
      editor.zoomToSelectionIfOffscreen(20);

      // Export as PNG blob
      const shapeExport = await editor.toImage([shape.id], {
        format: 'png',
        scale: 1,
        background: true,
      });

      const response = await describeImage(shapeExport.blob);

      editor.deleteShapes(placeholderIds);

      const textShapeId = createShapeId();
      const backgroundShapeId = createShapeId();
      const groupId = createShapeId();

      const PADDING = 24;
      const MAX_WIDTH = 360;

      // 1. Create a text shape with auto-sizing to determine its dimensions
      editor.createShape<TLTextShape>({
        id: textShapeId,
        type: 'text',
        // Position it relative to the future background shape's origin
        x: PADDING,
        y: PADDING,
        // FIX: The 'align' property is not valid for a text shape's props. It has been removed.
        // The default alignment is 'middle', which suits the design.
        props: {
          // FIX: The 'text' property is not valid for a text shape. Use 'richText' with the 'toRichText' helper instead.
          richText: toRichText(response),
          autoSize: true, // auto-size height based on width
          w: MAX_WIDTH,
          color: 'white',
        },
      });

      // 2. Get the dimensions from the created text shape
      // FIX: The 'w' and 'h' properties do not exist on TLTextShape.
      // Use `editor.getShapePageBounds` to correctly get the shape's dimensions.
      const bounds = editor.getShapePageBounds(textShapeId);
      if (!bounds) {
        // cleanup if shape wasn't created for some reason
        editor.deleteShapes([textShapeId]);
        return;
      }
      const textWidth = bounds.width;
      const textHeight = bounds.height;

      const cardWidth = textWidth + PADDING * 2;
      const cardHeight = textHeight + PADDING * 2;

      // 3. Create the background "glass" card shape at origin (0,0)
      editor.createShape({
        id: backgroundShapeId,
        type: 'geo',
        x: 0,
        y: 0,
        props: {
          geo: 'rectangle',
          w: cardWidth,
          h: cardHeight,
          fill: 'semi',
          color: 'grey', // liquid glass dark tone similar to prompt bar
        },
      });

      // Ensure text is above the background card
      editor.bringToFront([textShapeId]);

      // 4. Group the text and background shapes.
      editor.groupShapes([backgroundShapeId, textShapeId], {
        groupId: groupId,
      });

      // 5. Place the new group on the canvas.
      const newShapeGroup = editor.getShape(groupId);
      if (!newShapeGroup) return;

      placeNewShape(editor, newShapeGroup);
      if (ENABLE_CONNECTOR_ARROWS) {
        createArrowBetweenShapes(editor, shape.id, newShapeGroup.id);
      }
    });
};

const genImageClick = async (
  editor: Editor,
  numberOfImages = 1,
  aspectRatio = '16:9',
  targetWidth?: number,
) => {
  console.log('generate image');
  const shapes = editor.getSelectedShapes();
  const contents: string[] = [];
  const images = [];

  // FIX: `sourceShapesId` must be of type `TLShapeId[]` to be compatible with `createArrowBetweenShapes`.
  const sourceShapesId: TLShapeId[] = [];

  await Promise.all(
    shapes
      .filter((shape) => editor.isShapeOfType(shape, 'text'))
      .map(async (shape) => {
        console.log('selected text shape:', shape.id);
        const selectedTextShape = editor.getShape<TLTextShape>(shape.id)!;
        console.log(selectedTextShape);
        const textParts = (selectedTextShape.props.richText.content as any[])
          .filter((p) => p.type === 'paragraph' && p.content?.length > 0)
          .map((p) => p.content.map((t: any) => t.text).join(''));
        contents.push(...textParts);
        sourceShapesId.push(shape.id);
      }),
  );

  const imageShapes = shapes.filter((shape) =>
    editor.isShapeOfType(shape, 'image'),
  );
  imageShapes.length = Math.min(1, imageShapes.length); // Max 1 image shape

  await Promise.all(
    imageShapes.map(async (shape) => {
      console.log('selected image shape:', shape.id);
      // Export as PNG blob
      const shapeExport = await editor.toImage([shape.id], {
        format: 'png',
        scale: 1,
        background: true,
      });
      images.push(shapeExport.blob);
      sourceShapesId.push(shape.id);
    }),
  );

  let promptText = contents.join('\n');
  const image = images.length > 0 ? images[0] : null;

  if (!promptText && image) {
    promptText = `Generate a new and different variant of this image. Keep the main subject recognizable, but change pose and composition, vary camera angle and lighting, and update background or small scene elements to create a distinct result. Avoid reproducing the scene exactly. The final image must have an aspect ratio of ${aspectRatio}.`;
  }
  if (!promptText && !image) return;

  const [aspectW, aspectH] = aspectRatio.split(':').map(Number);
  const placeholderWidth = targetWidth ?? VIDEO_WIDTH;
  const placeholderHeight = (placeholderWidth * aspectH) / aspectW;

  const placeholderIds = addPlaceholder(
    editor,
    'Generating image...',
    placeholderWidth,
    placeholderHeight,
  );
  editor.select(placeholderIds[0]);
  editor.zoomToSelectionIfOffscreen(20);

  console.log('generating...', promptText);
  let imageObjects = [];
  try {
    imageObjects = await generateImages(
      promptText,
      image,
      numberOfImages,
      aspectRatio,
    );
  } catch (e) {
    editor.select(placeholderIds[0]);
    editor.deleteShapes(placeholderIds);
    throw new Error(e.message);
  }
  console.log('done.');

  editor.select(placeholderIds[0]);

  const bounds = editor.getSelectionPageBounds();

  const x = bounds.left;
  const y = bounds.top;

  editor.deleteShapes(placeholderIds);

  const lastIds: TLShapeId[] = [];

  await Promise.all(
    imageObjects.map(async (imgSrc, i) => {
      const {width: imgW, height: imgH} = await getImageSize(imgSrc);
      const assetId = AssetRecordType.createId();
      const mimeType = imgSrc.match(/data:(.*);base64,/)?.[1] || 'image/jpeg';
      const extension = mimeType.split('/')[1] || 'jpg';

      editor.createAssets([
        {
          id: assetId,
          type: 'image',
          typeName: 'asset',
          props: {
            name: `sample_${i}_${assetId}.${extension}`,
            src: imgSrc,
            w: imgW,
            h: imgH,
            mimeType: mimeType,
            isAnimated: false,
          },
          meta: {},
        },
      ]);

      const newShapeHeight = placeholderWidth * (imgH / imgW);
      const newShapeId = createShapeId();
      editor.createShape({
        id: newShapeId,
        type: 'image',
        x: x + i * (placeholderWidth + 20),
        y: y,
        props: {
          assetId,
          w: placeholderWidth,
          h: newShapeHeight,
        },
      });
      lastIds.push(newShapeId);

      if (ENABLE_CONNECTOR_ARROWS) {
        sourceShapesId.forEach((shapeId) => {
          createArrowBetweenShapes(editor, shapeId, newShapeId);
        });
      }
    }),
  );

  if (lastIds.length > 0) {
    editor.select(...lastIds);
    editor.zoomToSelection({animation: {duration: 400}});
  }
};

const genVideoClick = async (editor: Editor, aspectRatio = '16:9') => {
  console.log('generate video');
  const shapes = editor.getSelectedShapes();
  const contents: string[] = [];
  const images = [];

  // FIX: `sourceShapesId` must be of type `TLShapeId[]` to be compatible with `createArrowBetweenShapes`.
  const sourceShapesId: TLShapeId[] = [];

  await Promise.all(
    shapes
      .filter((shape) => editor.isShapeOfType(shape, 'text'))
      .map(async (shape) => {
        console.log('selected text shape:', shape.id);
        const selectedTextShape = editor.getShape<TLTextShape>(shape.id)!;
        console.log(selectedTextShape);
        const textParts = (selectedTextShape.props.richText.content as any[])
          .filter((p) => p.type === 'paragraph' && p.content?.length > 0)
          .map((p) => p.content.map((t: any) => t.text).join(''));
        contents.push(...textParts);
        sourceShapesId.push(shape.id);
      }),
  );

  const imageShapes = shapes.filter((shape) =>
    editor.isShapeOfType(shape, 'image'),
  );
  imageShapes.length = Math.min(1, imageShapes.length); // Max 1 image shape

  await Promise.all(
    imageShapes.map(async (shape) => {
      console.log('selected image shape:', shape.id);
      // Export as PNG blob
      const shapeExport = await editor.toImage([shape.id], {
        format: 'png',
        scale: 1,
        background: true,
      });
      images.push(shapeExport.blob);
      sourceShapesId.push(shape.id);
    }),
  );

  console.log(contents, images);
  if (contents.length === 0 && images.length === 0) return;

  const placeholderIds = addPlaceholder(editor, 'Generating video...');
  editor.select(placeholderIds[0]);
  editor.zoomToSelectionIfOffscreen(20);

  console.log('generating...', contents);

  const promptText = contents.join('\n');
  const image = images.length > 0 ? images[0] : null;

  let videoObjects = [];
  try {
    videoObjects = await generateVideo(image, promptText, 1, aspectRatio);
  } catch (e) {
    editor.select(placeholderIds[0]);
    editor.deleteShapes(placeholderIds);
    throw new Error(e.message);
  }

  console.log('done.', videoObjects);

  editor.select(placeholderIds[0]);

  let bounds = editor.getSelectionPageBounds();

  const x = bounds.left;
  const y = bounds.top;
  const w = bounds.width;
  const h = bounds.height;

  editor.deleteShapes(placeholderIds);

  let lastId = createShapeId();

  videoObjects.forEach((videoSrc, i) => {
    const mimeType = 'video/mp4';
    const src = `data:${mimeType};base64,${videoSrc}`;
    const assetId = AssetRecordType.createId();
    editor.createAssets([
      {
        id: assetId,
        type: 'video',
        typeName: 'asset',
        props: {
          name: `sample_${i}_${assetId}.mp4`,
          src,
          w: VIDEO_WIDTH,
          h: VIDEO_HEIGHT,
          mimeType,
          isAnimated: true,
        },
        meta: {},
      },
    ]);
    editor.createShape({
      id: lastId,
      type: 'video',
      x: x + i * 30,
      y: y + i * 30,
      props: {
        assetId,
        w,
        h,
        playing: true,
      },
    });

    if (ENABLE_CONNECTOR_ARROWS) {
      sourceShapesId.forEach((shapeId) => {
        createArrowBetweenShapes(editor, shapeId, lastId);
      });
    }
  });

  if (lastId) {
    editor.select(lastId);
    editor.zoomToSelection({animation: {duration: 400}});
  }
};

const generateNewImage = async (
  editor: Editor,
  prompt: string,
  imgSrc: string,
  numberOfImages: number,
  aspectRatio: string,
) => {
  console.log('generateNewImage', prompt, imgSrc);

  const textShapeId = createShapeId();
  const imgShapeId = createShapeId();
  // FIX: Only select shapes that have been created.
  const idsToSelect: TLShapeId[] = [];

  // add image to canvas
  if (imgSrc) {
    const {width: imgW, height: imgH} = await getImageSize(imgSrc);
    const assetId = AssetRecordType.createId();
    const mimeType = imgSrc.match(/data:(.*);base64,/)?.[1] || 'image/jpeg';

    editor.createAssets([
      {
        id: assetId,
        type: 'image',
        typeName: 'asset',
        props: {
          name: `uploaded_image_${assetId}.jpg`,
          src: imgSrc,
          w: imgW,
          h: imgH,
          mimeType: mimeType,
          isAnimated: false,
        },
        meta: {},
      },
    ]);

    const MAX_DIM = 640;
    const scale =
      imgW > MAX_DIM || imgH > MAX_DIM
        ? Math.min(MAX_DIM / imgW, MAX_DIM / imgH)
        : 1;
    const shapeW = imgW * scale;
    const shapeH = imgH * scale;

    editor.createShape({
      id: imgShapeId,
      type: 'image',
      props: {
        assetId,
        w: shapeW,
        h: shapeH,
      },
    });

    const imgShape = editor.getShape(imgShapeId);
    placeNewShape(editor, imgShape!);
    idsToSelect.push(imgShapeId);
  }

  // add text to canvas
  if (prompt) {
    editor.createShape({
      id: textShapeId,
      type: 'text',
      props: {
        richText: toRichText(prompt),
        autoSize: true,
        w: TEXT_CARD_MAX_W,
        color: 'white',
      },
    });

    const textShape = editor.getShape(textShapeId);
    placeNewShape(editor, textShape!);
    idsToSelect.push(textShapeId);
  }

  // select
  if (idsToSelect.length > 0) {
    editor.select(...idsToSelect);
    editor.zoomToSelection({animation: {duration: 400}});
  }

  // generate
  await genImageClick(editor, numberOfImages, aspectRatio);

  // After generation, wrap the prompt text in a colored card (if still present and not grouped)
  const textShape = editor.getShape<TLTextShape>(textShapeId);
  if (textShape) {
    const tb = editor.getShapePageBounds(textShapeId);
    if (tb) {
      const PADDING_X = 16;
      const PADDING_Y = 10;
      const cardId = createShapeId();
      editor.createShape({
        id: cardId,
        type: 'geo',
        x: tb.minX - PADDING_X,
        y: tb.minY - PADDING_Y,
        props: {
          geo: 'rectangle',
          w: tb.width + PADDING_X * 2,
          h: tb.height + PADDING_Y * 2,
          fill: 'semi',
          color: 'grey',
        },
      });
      // Make sure the text sits above the card
      editor.bringToFront([textShapeId]);
      editor.groupShapes([cardId, textShapeId]);
    }
  }
};

const generateNewVideo = async (
  editor: Editor,
  prompt: string,
  imgSrc: string,
  aspectRatio: string,
) => {
  console.log('generateNewVideo', prompt, imgSrc);

  const textShapeId = createShapeId();
  const imgShapeId = createShapeId();
  // FIX: Only select shapes that have been created.
  const idsToSelect: TLShapeId[] = [];

  // add image to canvas
  if (imgSrc) {
    const {width: imgW, height: imgH} = await getImageSize(imgSrc);
    const assetId = AssetRecordType.createId();

    editor.createAssets([
      {
        id: assetId,
        type: 'image',
        typeName: 'asset',
        props: {
          name: `uploaded_image_${assetId}.jpg`,
          src: imgSrc,
          w: imgW,
          h: imgH,
          mimeType: 'image/jpeg',
          isAnimated: false,
        },
        meta: {},
      },
    ]);
    const MAX_DIM = 640;
    const scale =
      imgW > MAX_DIM || imgH > MAX_DIM
        ? Math.min(MAX_DIM / imgW, MAX_DIM / imgH)
        : 1;
    const shapeW = imgW * scale;
    const shapeH = imgH * scale;

    editor.createShape({
      id: imgShapeId,
      type: 'image',
      props: {
        assetId,
        w: shapeW,
        h: shapeH,
      },
    });

    const imgShape = editor.getShape(imgShapeId);
    placeNewShape(editor, imgShape!);
    idsToSelect.push(imgShapeId);
  }

  // add text to canvas
  if (prompt) {
    editor.createShape({
      id: textShapeId,
      type: 'text',
      props: {
        richText: toRichText(prompt),
        autoSize: true,
        w: TEXT_CARD_MAX_W,
        color: 'white',
      },
    });

    const textShape = editor.getShape(textShapeId);
    placeNewShape(editor, textShape!);
    idsToSelect.push(textShapeId);
  }

  // select
  if (idsToSelect.length > 0) {
    editor.select(...idsToSelect);
    editor.zoomToSelection({animation: {duration: 400}});
  }

  // generate
  await genVideoClick(editor, aspectRatio);

  // After generation, wrap the prompt text in a colored card (if present)
  const textShape = editor.getShape<TLTextShape>(textShapeId);
  if (textShape) {
    const tb = editor.getShapePageBounds(textShapeId);
    if (tb) {
      const PADDING_X = 16;
      const PADDING_Y = 10;
      const cardId = createShapeId();
      editor.createShape({
        id: cardId,
        type: 'geo',
        x: tb.minX - PADDING_X,
        y: tb.minY - PADDING_Y,
        props: {
          geo: 'rectangle',
          w: tb.width + PADDING_X * 2,
          h: tb.height + PADDING_Y * 2,
          fill: 'semi',
          color: 'grey',
        },
      });
      // Make sure the text sits above the card
      editor.bringToFront([textShapeId]);
      editor.groupShapes([cardId, textShapeId]);
    }
  }
};

const runEditImage = async (
  editor: Editor,
  prompt: string,
  shapeId: TLShapeId,
) => {
  const shape = editor.getShape(shapeId) as TLImageShape;
  if (!shape || !shape.props.assetId) {
    throw new Error('Target shape is not a valid image.');
  }

  const placeholderIds = addPlaceholder(editor, 'Editing image...');
  editor.select(placeholderIds[0]);
  editor.zoomToSelectionIfOffscreen(20);

  const shapeExport = await editor.toImage([shape.id], {
    format: 'png',
    scale: 1,
    background: true,
  });

  const bounds = editor.getShapePageBounds(shape.id)!;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const commonDivisor = gcd(Math.round(bounds.width), Math.round(bounds.height));
  const ratio = `${Math.round(bounds.width) / commonDivisor}:${
    Math.round(bounds.height) / commonDivisor
  }`;

  const imageObjects = await generateImages(prompt, shapeExport.blob, 1, ratio);

  if (imageObjects.length === 0) {
    editor.deleteShapes(placeholderIds);
    throw new Error('Image editing failed to return an image.');
  }

  const newSrc = imageObjects[0];
  const assetId = shape.props.assetId;
  const existingAsset = editor.getAsset(assetId);
  if (!existingAsset) {
    editor.deleteShapes(placeholderIds);
    throw new Error('Could not find existing asset to update.');
  }
  const {width, height} = await getImageSize(newSrc);
  const mimeType = newSrc.match(/data:(.*);base64,/)?.[1] || 'image/jpeg';

  // FIX: Added a type guard to ensure `existingAsset` is an image asset
  // before accessing `props.name`, which is not present on all asset types.
  if (existingAsset.type !== 'image') {
    editor.deleteShapes(placeholderIds);
    throw new Error('The asset being updated is not an image.');
  }

  editor.updateAssets([
    {
      id: assetId,
      type: 'image',
      props: {
        src: newSrc,
        w: width,
        h: height,
        name: existingAsset.props.name,
        // FIX: Added isAnimated and mimeType to asset update to prevent tldraw errors.
        isAnimated: false,
        mimeType: mimeType,
      },
    },
  ]);

  editor.deleteShapes(placeholderIds);
  editor.select(shapeId);
};

// Flatten overlay image pixels into the base image asset (no AI)
const bakeOverlayBetweenShapes = async (
  editor: Editor,
  baseShapeId: TLShapeId,
  overlayShapeId: TLShapeId,
) => {
  const baseShape = editor.getShape<TLImageShape>(baseShapeId);
  const overlayShape = editor.getShape<TLImageShape>(overlayShapeId);
  if (!baseShape || !overlayShape) throw new Error('Both shapes must be images.');

  const baseBounds = editor.getShapePageBounds(baseShapeId)!;
  const overlayBounds = editor.getShapePageBounds(overlayShapeId)!;

  // Export images
  const baseExport = await editor.toImage([baseShapeId], {
    format: 'png',
    scale: 1,
    background: true,
  });
  const overlayExport = await editor.toImage([overlayShapeId], {
    format: 'png',
    scale: 1,
    background: false,
  });

  // Create bitmaps
  const baseBitmap = await createImageBitmap(baseExport.blob);
  const overlayBitmap = await createImageBitmap(overlayExport.blob);

  // Draw onto canvas aligned to base bounds
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(baseBounds.width));
  canvas.height = Math.max(1, Math.round(baseBounds.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context.');
  ctx.drawImage(baseBitmap, 0, 0);

  const dx = Math.round(overlayBounds.left - baseBounds.left);
  const dy = Math.round(overlayBounds.top - baseBounds.top);
  ctx.drawImage(overlayBitmap, dx, dy);

  // Convert to data URL
  const newSrc = await new Promise<string>((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) return reject(new Error('Failed to bake overlay'));
      const base64 = await bloblToBase64(blob);
      resolve(`data:image/png;base64,${base64}`);
    }, 'image/png');
  });

  // Update asset
  const assetId = baseShape.props.assetId;
  const existingAsset = editor.getAsset(assetId);
  if (!existingAsset || existingAsset.type !== 'image') {
    throw new Error('Base asset not found or not an image.');
  }
  editor.updateAssets([
    {
      id: assetId,
      type: 'image',
      props: {
        src: newSrc,
        w: Math.round(baseBounds.width),
        h: Math.round(baseBounds.height),
        name: existingAsset.props.name,
        isAnimated: false,
        mimeType: 'image/png',
      },
    },
  ]);

  // Optionally remove overlay shape
  editor.deleteShapes([overlayShapeId]);
  editor.select(baseShapeId);
};

// ---

const assetUrls: TldrawProps['assetUrls'] = {
  icons: {
    'genai-describe-image': await loadIcon('/genai-describe-image.svg'),
    'genai-generate-image': await loadIcon('/genai-generate-image.svg'),
    'genai-generate-video': await loadIcon('/genai-generate-video.svg'),
    'genai-edit-image': await loadIcon('/genai-edit-image.svg'),
    'genai-use-in-chat': await loadIcon('/genai-use-in-chat.svg'),
  },
  translations: {
    'pt-br': '/translations/pt-br.json',
  },
};

const OverlayComponent = track(
  ({
    setEditingImage,
    mode,
    setMode,
    handleAssistantSubmit,
    assistantImage,
    onClearAssistantImage,
    setAssistantImage,
    falCfg,
    onFalCfgChange,
  }: {
    setEditingImage: (
      image:
        | {
            assetId: TLAssetId;
            src: string;
            bounds: Box;
            initialPrompt?: string;
            overlaySrc?: string;
          }
        | null,
    ) => void;
    mode: 'create' | 'assistant';
    setMode: (mode: 'create' | 'assistant') => void;
    handleAssistantSubmit: (
      prompt: string,
      image?: {src: string; shapeId: TLShapeId} | null,
    ) => Promise<void>;
    assistantImage: {src: string; shapeId: TLShapeId} | null;
    onClearAssistantImage: () => void;
    setAssistantImage: (image: {src: string; shapeId: TLShapeId}) => void;
    falCfg: { text2img: boolean; img2img: boolean; inpaint: boolean; video: boolean };
    onFalCfgChange: (cfg: { text2img: boolean; img2img: boolean; inpaint: boolean; video: boolean }) => void;
  }) => {
    const editor = useEditor();
    const {addToast} = useToasts();
    return (
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          pointerEvents: 'none',
        }}
        onPointerDown={stopEventPropagation}>
        <div
          style={{
            position: 'absolute',
            top: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            pointerEvents: 'all',
            zIndex: 1001,
          }}>
          <DefaultToolbar />
        </div>
        {process.env.SHOW_FALLBACK_PANEL === 'true' && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            pointerEvents: 'all',
            zIndex: 1001,
            background: 'rgba(40,40,40,0.7)',
            color: '#eee',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            padding: '8px 12px',
            fontSize: 12,
            maxWidth: 200,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Fallback FAL</div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={falCfg.text2img}
              onChange={(e) => onFalCfgChange({ ...falCfg, text2img: e.target.checked })}
            />
            text→image
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={falCfg.img2img}
              onChange={(e) => onFalCfgChange({ ...falCfg, img2img: e.target.checked })}
            />
            image→image
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={falCfg.inpaint}
              onChange={(e) => onFalCfgChange({ ...falCfg, inpaint: e.target.checked })}
            />
            inpaint (mask)
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={falCfg.video}
              onChange={(e) => onFalCfgChange({ ...falCfg, video: e.target.checked })}
            />
            video
          </label>
        </div>
        )}
        <ContextualToolbarComponent
          setEditingImage={setEditingImage}
          mode={mode}
          setAssistantImage={setAssistantImage}
        />
        <PromptBar
          onSubmit={async (prompt, image, action, options) => {
            try {
              if (action === 'video') {
                await generateNewVideo(
                  editor,
                  prompt,
                  image,
                  options.aspectRatio,
                );
              } else {
                await generateNewImage(
                  editor,
                  prompt,
                  image,
                  options.numberOfImages,
                  options.aspectRatio,
                );
              }
            } catch (e) {
              const msg = (e as Error)?.message || String(e);
              if (/did not return images/i.test(msg)) {
                const hinted = `${prompt || ''}\nChange camera angle and lighting, vary background and composition; avoid reproducing the exact scene.`.trim();
                addToast({
                  title: 'Nenhuma imagem gerada',
                  description:
                    'Tente detalhar ângulo de câmera, iluminação, composição e estilo. Você pode pedir mudanças de pose e de fundo para criar variação.',
                  severity: 'info',
                  actions: [
                    {
                      type: 'primary',
                      label: 'Tentar novamente',
                      onClick: async () => {
                        try {
                          await generateNewImage(
                            editor,
                            hinted,
                            image,
                            options.numberOfImages,
                            options.aspectRatio,
                          );
                        } catch (err) {
                          addToast({ title: (err as Error).message, severity: 'error' });
                        }
                      },
                    },
                    {
                      type: 'normal',
                      label: 'Ver dicas',
                      onClick: () =>
                        addToast({
                          title: 'Dicas rápidas',
                          description:
                            '• Especifique ângulo/câmera (close-up, wide, 3/4)\n• Luz (soft/hard, backlight)\n• Composição (regra dos terços)\n• Variação de pose/background\n• Estilo (fotografia/ilustração)',
                          severity: 'info',
                        }),
                    },
                  ],
                });
              } else {
                addToast({ title: msg, severity: 'error' });
              }
            }
          }}
          onAssistantSubmit={handleAssistantSubmit}
          mode={mode}
          onModeChange={setMode}
          assistantImage={assistantImage}
          onClearAssistantImage={onClearAssistantImage}
        />
      </div>
    );
  },
);

const ContextualToolbarComponent = track(
  ({
    setEditingImage,
    mode,
    setAssistantImage,
  }: {
    setEditingImage: (
      image:
        | {
            assetId: TLAssetId;
            src: string;
            bounds: Box;
            initialPrompt?: string;
            overlaySrc?: string;
          }
        | null,
    ) => void;
    mode: 'create' | 'assistant';
    setAssistantImage: (image: {src: string; shapeId: TLShapeId}) => void;
  }) => {
    const editor = useEditor();
    const {addToast} = useToasts();
    const showToolbar = editor.isIn('select.idle');

    const ref = useRef<HTMLDivElement>(null);
    usePassThroughWheelEvents(ref);

    if (!showToolbar) return <></>;

    const getSelectionBounds = () => {
      const fullBounds = editor.getSelectionRotatedScreenBounds();
      if (!fullBounds) return undefined;
      const box = new Box(
        fullBounds.x,
        fullBounds.y + fullBounds.height + 75,
        fullBounds.width,
        0,
      );
      return box;
    };

    const shapes = editor.getSelectedShapes();
    const textShapes = shapes.filter((shape) =>
      editor.isShapeOfType(shape, 'text'),
    );
    const imageShapes = shapes.filter((shape) =>
      editor.isShapeOfType(shape, 'image'),
    );
    const otherShapes = shapes.filter(
      (shape) =>
        !editor.isShapeOfType(shape, 'image') &&
        !editor.isShapeOfType(shape, 'text'),
    );

    const hasImage = imageShapes.length > 0;
    const hasText = textShapes.length > 0;
    const hasOtherShapes = otherShapes.length > 0;
    const singleImageSelected = imageShapes.length === 1 && !hasText;

    if (hasOtherShapes || (textShapes.length === 0 && imageShapes.length === 0))
      return;

    const actions = [];

    if (mode === 'assistant') {
      if (singleImageSelected) {
        actions.push({
          label: 'Use in Chat',
          title: 'Use image in chat',
          icon: 'genai-use-in-chat',
          onClick: async () => {
            const imageShape = imageShapes[0] as TLImageShape;
            const asset = editor.getAsset(imageShape.props.assetId);
            if (!asset) return;
            setAssistantImage({src: asset.props.src, shapeId: imageShape.id});
            editor.selectNone();
          },
        });
        actions.push({
          label: 'Edit',
          title: 'Edit selected image',
          icon: 'genai-edit-image',
          onClick: async () => {
            const imageShape = imageShapes[0] as TLImageShape;
            const asset = editor.getAsset(imageShape.props.assetId);
            if (!asset) return;
            const bounds = editor.getShapePageBounds(imageShape.id);
            setEditingImage({
              assetId: asset.id,
              src: asset.props.src,
              bounds: bounds!,
            });
          },
        });
        if (imageShapes.length === 2) {
          actions.push({
            label: 'Compose (AI)',
            title: 'Open mask editor with overlay',
            icon: 'genai-generate-image',
            onClick: async () => {
              const [s1, s2] = imageShapes as TLImageShape[];
              const b1 = editor.getShapePageBounds(s1.id)!;
              const b2 = editor.getShapePageBounds(s2.id)!;
              const base = b1.width * b1.height >= b2.width * b2.height ? s1 : s2;
              const overlay = base === s1 ? s2 : s1;
              const baseAsset = editor.getAsset(base.props.assetId);
              const overlayAsset = editor.getAsset(overlay.props.assetId);
              if (!baseAsset || !overlayAsset) return;
              const baseBounds = editor.getShapePageBounds(base.id)!;
              setEditingImage({
                assetId: baseAsset.id,
                src: baseAsset.props.src,
                bounds: baseBounds,
                overlaySrc: overlayAsset.props.src,
              });
            },
          });
          actions.push({
            label: 'Bake Overlay',
            title: 'Flatten overlay into base image',
            icon: 'genai-edit-image',
            onClick: async () => {
              const [s1, s2] = imageShapes as TLImageShape[];
              const b1 = editor.getShapePageBounds(s1.id)!;
              const b2 = editor.getShapePageBounds(s2.id)!;
              const base = b1.width * b1.height >= b2.width * b2.height ? s1 : s2;
              const overlay = base === s1 ? s2 : s1;
              try {
                await bakeOverlayBetweenShapes(editor, base.id, overlay.id);
              } catch (e) {
                addToast({title: e.message, severity: 'error'});
              }
            },
          });
        }
      }
    } else {
      if (singleImageSelected) {
        actions.push({
          label: 'Edit',
          title: 'Edit selected image',
          icon: 'genai-edit-image',
          onClick: async () => {
            const imageShape = imageShapes[0] as TLImageShape;
            const asset = editor.getAsset(imageShape.props.assetId);
            if (!asset) return;
            const bounds = editor.getShapePageBounds(imageShape.id);
            setEditingImage({
              assetId: asset.id,
              src: asset.props.src,
              bounds: bounds!,
            });
          },
        });
      }

      if (hasImage && !hasText) {
        actions.push({
          label: 'Describe',
          title: 'Describe image',
          icon: 'genai-describe-image',
          onClick: () => describeClick(editor),
        });
        actions.push({
          label: 'Generate Variants',
          title: 'Generate variants of image',
          icon: 'genai-generate-image',
          onClick: () => {
            const imageShape = imageShapes[0];
            const bounds = editor.getShapePageBounds(imageShape.id)!;

            const gcd = (a: number, b: number): number =>
              b === 0 ? a : gcd(b, a % b);
            const commonDivisor = gcd(
              Math.round(bounds.width),
              Math.round(bounds.height),
            );
            const ratio = `${Math.round(bounds.width) / commonDivisor}:${
              Math.round(bounds.height) / commonDivisor
            }`;

            genImageClick(editor, 4, ratio, bounds.width);
          },
        });
      }
      if (hasText && !hasImage) {
        actions.push({
          label: 'Generate image',
          title: 'Generate image from text',
          icon: 'genai-generate-image',
          onClick: () => genImageClick(editor),
        });
      }
      if (hasText && hasImage) {
        actions.push({
          label: 'Generate image',
          title: 'Generate image from image and text',
          icon: 'genai-generate-image',
          onClick: () => genImageClick(editor),
        });
      }
      if (hasText || hasImage) {
        actions.push({
          label: 'Generate video',
          title: 'Generate video from text and/or image',
          icon: 'genai-generate-video',
          onClick: async () => {
            try {
              await genVideoClick(editor);
            } catch (e) {
              addToast({title: e.message, severity: 'error'});
            }
          },
        });
      }
    }
    if (hasOtherShapes) actions.length = 0;

    return (
      // FIX: The `ref` prop is not supported on TldrawUiContextualToolbar. It should be on the child div.
      <TldrawUiContextualToolbar
        getSelectionBounds={getSelectionBounds}
        label="GenAI">
        <div className="genai-actions-context" ref={ref}>
          {actions?.map(({label, title, icon, onClick}, i) => (
            <TldrawUiButton
              key={`${i}`}
              title={title}
              type="icon"
              onClick={onClick}>
              <TldrawUiButtonIcon small icon={icon} />
              {label}
            </TldrawUiButton>
          ))}
        </div>
      </TldrawUiContextualToolbar>
    );
  },
);

const ChatHistoryUI = ({history}: {history: Content[]}) => {
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [history]);

  if (history.length === 0) return null;

  return (
    <div className="chat-history-container" ref={historyRef}>
      {history.map((item, index) => (
        <div key={index} className={`chat-message ${item.role}`}>
          {item.parts.map((part, partIndex) => {
            if ('text' in part && part.text) {
              return <div key={partIndex}>{part.text}</div>;
            }
            if ('inlineData' in part && part.inlineData) {
              const imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
              return (
                <img
                  key={partIndex}
                  src={imageUrl}
                  alt="chat history"
                  style={{
                    maxWidth: '100%',
                    borderRadius: '8px',
                    marginTop: '8px',
                  }}
                />
              );
            }
            return null;
          })}
        </div>
      ))}
    </div>
  );
};

const Ui = () => {
  const [mode, setMode] = useState<'create' | 'assistant'>('create');
  const [chatHistory, setChatHistory] = useState<Content[]>([]);
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [assistantImage, setAssistantImage] = useState<{
    src: string;
    shapeId: TLShapeId;
  } | null>(null);
  const [
    lastAssistantImageInChat,
    setLastAssistantImageInChat,
  ] = useState<{src: string; shapeId: TLShapeId} | null>(null);
  const [falCfg, setFalCfg] = useState({ text2img: false, img2img: false, inpaint: false, video: false });

  const [editingImage, setEditingImage] = useState<{
    assetId: TLAssetId;
    src: string;
    bounds: Box;
    initialPrompt?: string;
    overlaySrc?: string;
  } | null>(null);
  const {addToast} = useToasts();
  const editor = useEditor();

  useEffect(() => {
    setFalFallbackConfig(falCfg);
  }, [falCfg]);
  useEffect(() => {
    setNotifyFallback(() => (msg: string) => addToast({ title: msg, severity: 'info' }));
    return () => setNotifyFallback(null);
  }, [addToast]);
  // Force-hide any residual tldraw branding helper buttons
  useEffect(() => {
    const hideBranding = () => {
      document.querySelectorAll('.tlui-helper-buttons').forEach((el) => {
        (el as HTMLElement).style.display = 'none';
        (el as HTMLElement).style.visibility = 'hidden';
      });
      document.querySelectorAll('.tl-watermark_SEE-LICENSE, div[class*="watermark"], .tlui-watermark').forEach((el) => {
        const node = el as HTMLElement;
        node.style.display = 'none';
        node.style.visibility = 'hidden';
        node.style.opacity = '0';
        node.style.pointerEvents = 'none';
      });
    };
    hideBranding();
    const obs = new MutationObserver(hideBranding);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);

  const handleSaveEditedImage = async (assetId: TLAssetId, newSrc: string) => {
    try {
      const {width, height} = await getImageSize(newSrc);
      const mimeType = newSrc.match(/data:(.*);base64,/)?.[1] || 'image/jpeg';
      const existingAsset = editor.getAsset(assetId);
      if (!existingAsset) {
        setEditingImage(null);
        throw new Error('Could not find existing asset to update.');
      }
      // FIX: Added a type guard to ensure `existingAsset` is an image asset
      // before accessing `props.name`, which is not present on all asset types.
      if (existingAsset.type !== 'image') {
        setEditingImage(null);
        throw new Error('Asset is not an image.');
      }
      editor.updateAssets([
        {
          id: assetId,
          type: 'image',
          props: {
            src: newSrc,
            w: width,
            h: height,
            name: existingAsset.props.name,
            // FIX: Added isAnimated and mimeType to asset update to prevent tldraw errors.
            isAnimated: false,
            mimeType: mimeType,
          },
        },
      ]);
      setEditingImage(null);
    } catch (e) {
      addToast({title: 'Failed to update image', severity: 'error'});
    }
  };

  const toolDeclarations: FunctionDeclaration[] = [
    {
      name: 'generateImage',
      description:
        'Generates a new image from a text prompt, or from a text + image reference when provided in chat. Use this to create variations or new images. For precise area edits use editImage.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          prompt: {
            type: Type.STRING,
            description: 'The prompt to generate images from.',
          },
          numberOfImages: {
            type: Type.NUMBER,
            description: 'The number of images to generate.',
          },
          aspectRatio: {
            type: Type.STRING,
            description: 'The aspect ratio of the images.',
          },
          variationStrength: {
            type: Type.NUMBER,
            description: '0.0-1.0. Higher = more differences from the reference (if any). Embed instruction in prompt.',
          },
          stylePreset: {
            type: Type.STRING,
            description: 'Optional style or art direction to apply. Embed instruction in prompt.',
          },
          negativePrompt: {
            type: Type.STRING,
            description: 'Things to avoid. Embed as “Avoid: …” in prompt.',
          },
          seed: {
            type: Type.NUMBER,
            description: 'If provided, include in prompt for reproducibility.',
          },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'editImage',
      description:
        'Edits the image that the user has provided in the chat. Use this to modify, change, or add something to the image. The prompt should describe the change to be made to the image.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          prompt: {
            type: Type.STRING,
            description: 'The prompt describing the edits to the image.',
          },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'removeBackground',
      description:
        'Remove the background of the selected image, making background transparent. Use when the user explicitly asks for background removal.',
      parameters: { type: Type.OBJECT, properties: {}, required: [] },
    },
    {
      name: 'applyOverlay',
      description:
        'Flatten one image onto another without AI. Use when the user wants pixel-perfect placement (e.g., logo onto banner). If overlay not specified, use assistant chat image as overlay and the currently selected image as base.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          baseShapeId: { type: Type.STRING, description: 'Optional base image TLShapeId. Defaults to selected base.' },
          overlayShapeId: { type: Type.STRING, description: 'Optional overlay image TLShapeId. Defaults to assistant image or second selection.' },
        },
      },
    },
    {
      name: 'composeAI',
      description:
        'Compose overlay into base image using AI (soft blend). If region not specified, blend naturally. Prefer applyOverlay for strict fidelity; use this for natural integration.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          prompt: { type: Type.STRING, description: 'Guidance for how to place/integrate the overlay.' },
          baseShapeId: { type: Type.STRING, description: 'Optional base image TLShapeId' },
          overlayShapeId: { type: Type.STRING, description: 'Optional overlay image TLShapeId' },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'upscaleImage',
      description:
        'Upscale the selected image using AI regeneration (approximate). Use when user requests higher resolution output.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          factor: { type: Type.NUMBER, description: '2 by default. Regenerate with higher detail.' },
        },
      },
    },
    {
      name: 'generateVideo',
      description: 'Generates a video based on a textual prompt.',
      parameters: {
        // FIX: Use `Type` enum instead of string literal for schema types.
        type: Type.OBJECT,
        properties: {
          // FIX: Use `Type` enum instead of string literal for schema types.
          prompt: {
            type: Type.STRING,
            description: 'The prompt to generate a video from.',
          },
          // FIX: Use `Type` enum instead of string literal for schema types.
          aspectRatio: {
            type: Type.STRING,
            description: 'The aspect ratio of the video.',
          },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'plan',
      description:
        'Propose a short plan (2-5 steps) and then execute the steps using the available tools. Use for multi-step requests. Optionally ask for confirmation first.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          steps: { type: Type.ARRAY, description: 'Array of step descriptions', items: { type: Type.STRING } },
        },
      },
    },
  ];

  const tools: Tool[] = [{functionDeclarations: toolDeclarations}];

  const handleAssistantSubmit = async (
    prompt: string,
    image?: {src: string; shapeId: TLShapeId} | null,
  ) => {
    if (image) {
      setLastAssistantImageInChat(image);
    }
    const imageForToolContext = image?.src ?? lastAssistantImageInChat?.src;
    const shapeIdForEditing =
      image?.shapeId ?? lastAssistantImageInChat?.shapeId;

    const chat =
      chatSession ??
      ai.chats.create({
        model: GEMINI_MODEL_NAME,
        config: {
          tools: tools,
          systemInstruction: `You are a helpful canvas assistant with tool access. Your job is to choose and sequence tools to achieve the user's goal with minimal back-and-forth.
 - Prefer:
   * generateImage: creating or varying images (text or text+reference). Add style/variation/negative if provided.
   * editImage: precise/local changes; open the mask editor for the selected image.
   * removeBackground: when asked to remove background.
   * applyOverlay: pixel-perfect placement (e.g., logo → banner).
   * composeAI: natural integration of overlay using AI.
   * upscaleImage: increase resolution / clarity.
   * generateVideo: when asked for motion from text and/or one image.
 - When unclear or multi-step, call plan first with 2–5 concise steps, then proceed.
 - Prompts:
   * For variants, include guidance to change pose/composition/angle/lighting and not reproduce scene exactly.
   * If negativePrompt/stylePreset/variationStrength/seed provided, weave into the prompt text.
 - Context images:
   * If the user clicks "Use in Chat", treat that as reference/overlay.
   * If a base image is selected, treat that as target for edit/compose.`,
        },
      });
    if (!chatSession) setChatSession(chat);

    const userParts: Content['parts'] = [{text: prompt}];
    if (image) {
      const match = image.src.match(/data:(.*);base64,(.*)/);
      if (match) {
        const [, mimeType, data] = match;
        userParts.push({
          inlineData: {
            mimeType,
            data,
          },
        });
      }
    }

    setChatHistory((prev) => [...prev, {role: 'user', parts: userParts}]);

    let response;
    try {
      response = await chat.sendMessage({message: userParts});
    } catch (err) {
      const msg = (err as Error)?.message || String(err);
      if (/INTERNAL|code":500|status":\s*500/i.test(msg)) {
        addToast({
          title: 'Assistente (Pro) indisponível',
          description: 'Alternando para modelo Flash para continuar.',
          severity: 'info',
        });
        const fallbackChat = ai.chats.create({
          model: 'gemini-2.5-flash',
          config: {
            tools: tools,
            systemInstruction: `You are a helpful canvas assistant with tool access. Your job is to choose and sequence tools to achieve the user's goal with minimal back-and-forth.\n - Prefer:\n   * generateImage: creating or varying images (text or text+reference). Add style/variation/negative if provided.\n   * editImage: precise/local changes; open the mask editor for the selected image.\n   * removeBackground: when asked to remove background.\n   * applyOverlay: pixel-perfect placement (e.g., logo → banner).\n   * composeAI: natural integration of overlay using AI.\n   * upscaleImage: increase resolution / clarity.\n   * generateVideo: when asked for motion from text and/or one image.\n - When unclear or multi-step, call plan first with 2–5 concise steps, then proceed.\n - Prompts:\n   * For variants, include guidance to change pose/composition/angle/lighting and not reproduce scene exactly.\n   * If negativePrompt/stylePreset/variationStrength/seed provided, weave into the prompt text.\n - Context images:\n   * If the user clicks \"Use in Chat\", treat that as reference/overlay.\n   * If a base image is selected, treat that as target for edit/compose.`,
          },
        });
        setChatSession(fallbackChat);
        response = await fallbackChat.sendMessage({message: userParts});
      } else {
        throw err;
      }
    }

  while (response.candidates[0].content.parts[0].functionCall) {
      const fn = response.candidates[0].content.parts[0].functionCall;
      console.log('Function call:', fn);

      let result;
      try {
        if (fn.name === 'editImage') {
          if (!shapeIdForEditing) {
            result = {
              error:
                'No image selected for editing. The user must select an image and click "Use in Chat" first.',
            };
          } else {
            const {prompt: editPrompt} = fn.args;
            // Open mask editor with the assistant's prompt prefilled
            const imgShape = editor.getShape<TLImageShape>(shapeIdForEditing);
            if (!imgShape) {
              result = {error: 'Selected shape is not an image.'};
            } else {
              const asset = editor.getAsset(imgShape.props.assetId);
              const bounds = editor.getShapePageBounds(imgShape.id);
              if (!asset || !bounds) {
                result = {error: 'Could not locate image asset or bounds.'};
              } else {
                // If an assistant image is present and is different from the target, pass as overlay
                const overlaySrc =
                  lastAssistantImageInChat &&
                  lastAssistantImageInChat.shapeId !== shapeIdForEditing
                    ? lastAssistantImageInChat.src
                    : undefined;
                setEditingImage({
                  assetId: asset.id,
                  src: asset.props.src,
                  bounds,
                  initialPrompt: editPrompt as string,
                  overlaySrc,
                });
                result = {output: 'Opened mask editor. Paint the area to edit and click Generate.'};
              }
            }
          }
        } else if (fn.name === 'generateImage') {
          let {prompt, numberOfImages, aspectRatio, variationStrength, stylePreset, negativePrompt, seed} = fn.args as any;
          // Weave advanced options into prompt
          const extras: string[] = [];
          if (variationStrength != null) extras.push(`Variation strength: ${variationStrength}.`);
          if (stylePreset) extras.push(`Style: ${stylePreset}.`);
          if (negativePrompt) extras.push(`Avoid: ${negativePrompt}.`);
          if (seed != null) extras.push(`Seed: ${seed}.`);
          if (extras.length) prompt = `${prompt}\n${extras.join(' ')}`;
          const textShapeId = createShapeId();
          editor.createShape({
            id: textShapeId,
            type: 'text',
            props: {
              richText: toRichText(prompt as string),
              autoSize: true,
              w: TEXT_CARD_MAX_W,
            },
          });
          const textShape = editor.getShape(textShapeId);
          placeNewShape(editor, textShape!);
          editor.select(textShapeId);
          await genImageClick(
            editor,
            (numberOfImages as number) ?? 1,
            (aspectRatio as string) ?? '16:9',
          );
          editor.deleteShapes([textShapeId]);
          result = {
            output: `Successfully generated ${
              numberOfImages ?? 1
            } image(s). An image was in the chat context but 'generateImage' was used, so it was ignored. For editing, please rephrase your request to make it clear you want to modify the existing image.`,
          };
        } else if (fn.name === 'generateVideo') {
          const {prompt, aspectRatio} = fn.args;
          // FIX: Add type assertions for arguments from `fn.args`.
          await generateNewVideo(
            editor,
            prompt as string,
            imageForToolContext,
            (aspectRatio as string) ?? '16:9',
          );
          result = {output: 'Successfully generated video.'};
        } else if (fn.name === 'removeBackground') {
          if (!shapeIdForEditing) {
            result = { error: 'Select an image and click “Use in Chat” or select base image.' };
          } else {
            await runEditImage(editor, 'Remove the background and make it transparent while preserving the main subject.', shapeIdForEditing);
            result = { output: 'Background removed.' };
          }
        } else if (fn.name === 'applyOverlay') {
          const { baseShapeId, overlayShapeId } = fn.args as any;
          let baseId = baseShapeId as TLShapeId | undefined;
          let overlayId = overlayShapeId as TLShapeId | undefined;
          if (!baseId) baseId = shapeIdForEditing;
          if (!overlayId && lastAssistantImageInChat) overlayId = lastAssistantImageInChat.shapeId as TLShapeId;
          if (!baseId || !overlayId) {
            result = { error: 'Provide base/overlay or select base and use an assistant image as overlay.' };
          } else {
            await bakeOverlayBetweenShapes(editor, baseId, overlayId);
            result = { output: 'Overlay applied (flattened).' };
          }
        } else if (fn.name === 'composeAI') {
          const { prompt: composePrompt, baseShapeId, overlayShapeId } = fn.args as any;
          let baseId = (baseShapeId as TLShapeId) || shapeIdForEditing;
          let overlayId = (overlayShapeId as TLShapeId) || (lastAssistantImageInChat?.shapeId as TLShapeId);
          if (!baseId || !overlayId) {
            result = { error: 'Provide base/overlay or select base and use an assistant image as overlay.' };
          } else {
            // Export base & overlay, call editImage with full mask and overlay blob
            const baseShape = editor.getShape<TLImageShape>(baseId);
            const overlayShape = editor.getShape<TLImageShape>(overlayId);
            if (!baseShape || !overlayShape) {
              result = { error: 'Either base or overlay is not an image.' };
            } else {
              const baseExport = await editor.toImage([baseId], { format: 'png', scale: 1, background: true });
              const overlayExport = await editor.toImage([overlayId], { format: 'png', scale: 1, background: true });
              // Make a full-white mask covering the whole base
              const maskCanvas = document.createElement('canvas');
              maskCanvas.width = baseExport.blob ? (await createImageBitmap(baseExport.blob)).width : 1024;
              maskCanvas.height = baseExport.blob ? (await createImageBitmap(baseExport.blob)).height : 1024;
              const mctx = maskCanvas.getContext('2d')!;
              mctx.fillStyle = 'white';
              mctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
              const maskBlob = await new Promise<Blob | null>((resolve) => maskCanvas.toBlob(resolve, 'image/png'));
              if (!maskBlob) throw new Error('Could not create mask for composeAI');
              const newSrc = await editImage(baseExport.blob, maskBlob, `Integrate the overlay image into the base naturally. ${composePrompt}`, overlayExport.blob);
              await handleSaveEditedImage(baseShape.props.assetId, newSrc);
              result = { output: 'Overlay composed with AI.' };
            }
          }
        } else if (fn.name === 'upscaleImage') {
          const { factor } = fn.args as any;
          if (!shapeIdForEditing) {
            result = { error: 'Select an image to upscale.' };
          } else {
            await runEditImage(
              editor,
              `Upscale by ${factor ?? 2}x while preserving details and sharpness.`,
              shapeIdForEditing,
            );
            result = { output: 'Image upscaled.' };
          }
        } else if (fn.name === 'plan') {
          const { steps } = fn.args as any;
          result = { output: `Plan acknowledged: ${(steps || []).join(' -> ')}` };
        } else {
          throw new Error(`Unknown tool ${fn.name}`);
        }
      } catch (e) {
        console.error(e);
        const msg = (e as Error)?.message || String(e);
        if (/did not return images/i.test(msg)) {
          addToast({
            title: 'Nenhuma imagem gerada',
            description:
              'Tente pedir mudanças de pose, ângulo de câmera, iluminação e fundo. Evite reproduzir a cena exatamente.',
            severity: 'info',
          });
          result = { error: 'O modelo não retornou imagem. Experimente detalhar ângulo/iluminação/composição e variar pose e fundo.' };
        } else {
          result = { error: msg };
        }
      }

      // FIX: The value of `message` should be an array of `Part` objects. The `parts` wrapper is incorrect.
      response = await chat.sendMessage({
        message: [{functionResponse: {name: fn.name, response: result}}],
      });
    }

    setChatHistory((prev) => [...prev, response.candidates[0].content]);
  };

  return (
    <>
      <OverlayComponent
        setEditingImage={setEditingImage}
        mode={mode}
        setMode={setMode}
        handleAssistantSubmit={handleAssistantSubmit}
        assistantImage={assistantImage}
        onClearAssistantImage={() => setAssistantImage(null)}
        setAssistantImage={setAssistantImage}
        falCfg={falCfg}
        onFalCfgChange={setFalCfg}
      />
      {mode === 'assistant' && <ChatHistoryUI history={chatHistory} />}
      {editingImage && (
        <ImageEditor
          image={editingImage}
          onCancel={() => setEditingImage(null)}
          onSave={handleSaveEditedImage}
          editImageApi={editImage}
          initialPrompt={editingImage.initialPrompt}
          overlaySrc={editingImage.overlaySrc}
        />
      )}
    </>
  );
};

// ---

export default function App() {
  return (
    <>
      <Tldraw
        inferDarkMode
        components={{
          InFrontOfTheCanvas: Ui,
          Toolbar: () => null,
          HelperButtons: null,
        }}
        assetUrls={assetUrls}
        onMount={(editor) => {
          editor.user.updateUserPreferences({
            animationSpeed: 1,
            ...(process.env.FORCE_EN_LOCALE === 'true' ? { locale: 'en' } : { locale: 'pt-br' }),
          });
          editor.zoomToFit();
        }}
      />
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
