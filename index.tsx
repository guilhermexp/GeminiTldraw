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
import {NoticeBanner} from './Components/NoticeBanner';
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

const GEMINI_MODEL_NAME = 'gemini-2.5-flash';
const IMAGEN_MODEL_NAME = 'imagen-4.0-generate-001';
const GEMINI_IMAGE_MODEL_NAME = 'gemini-2.5-flash-image-preview';
const VEO_MODEL_NAME = 'veo-2.0-generate-001';

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
): Promise<string> {
  const imageBase64 = await bloblToBase64(imageBlob);
  const maskBase64 = await bloblToBase64(maskBlob);

  const imagePart = {
    inlineData: {data: imageBase64, mimeType: 'image/png'},
  };
  const maskPart = {inlineData: {data: maskBase64, mimeType: 'image/png'}};
  const textPart = {text: prompt};

  const response = await ai.models.generateContent({
    model: GEMINI_IMAGE_MODEL_NAME,
    contents: {parts: [textPart, imagePart, maskPart]},
    config: {
      responseModalities: [Modality.IMAGE, Modality.TEXT],
    },
  });

  const imagePartRes = response.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData,
  );
  if (imagePartRes?.inlineData) {
    return `data:${imagePartRes.inlineData.mimeType};base64,${imagePartRes.inlineData.data}`;
  }
  throw new Error('Image editing failed to produce an image.');
}

async function generateImages(
  prompt: string,
  imageBlob: Blob = null,
  numberOfImages = 1,
  aspectRatio = '16:9',
): Promise<string[]> {
  const imageObjects = [];

  if (imageBlob) {
    const imageDataBase64 = await bloblToBase64(imageBlob);
    const mimeType =
      imageDataBase64.match(/data:(.*);base64,/)?.[1] || 'image/jpeg';

    const imagePart = {inlineData: {mimeType, data: imageDataBase64}};
    const textPart = {text: prompt};

    const generationPromises = Array.from({length: numberOfImages}).map(() =>
      ai.models.generateContent({
        model: GEMINI_IMAGE_MODEL_NAME,
        contents: {parts: [imagePart, textPart]},
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
      }),
    );
    const responses = await Promise.all(generationPromises);

    for (const res of responses) {
      const imagePartRes = res.candidates?.[0]?.content?.parts?.find(
        (p) => p.inlineData,
      );
      if (imagePartRes && imagePartRes.inlineData) {
        const src = `data:${imagePartRes.inlineData.mimeType};base64,${imagePartRes.inlineData.data}`;
        imageObjects.push(src);
      } else {
        console.error(
          'No image data found in one of the responses for prompt:',
          prompt,
        );
      }
    }
    if (imageObjects.length === 0) {
      throw new Error(`No image data found for prompt: ${prompt}`);
    }
  } else {
    const response = await ai.models.generateImages({
      model: IMAGEN_MODEL_NAME,
      prompt,
      config: {
        numberOfImages,
        aspectRatio: aspectRatio,
        outputMimeType: 'image/jpeg',
      },
    });

    if (response?.generatedImages) {
      response.generatedImages.forEach(
        (generatedImage: GeneratedImage, index: number) => {
          if (generatedImage.image?.imageBytes) {
            const src = `data:image/jpeg;base64,${generatedImage.image.imageBytes}`;
            imageObjects.push(src);
          }
        },
      );
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
  let operation = null;
  if (imageBlob) {
    const imageDataBase64 = await bloblToBase64(imageBlob);
    const image = {
      imageBytes: imageDataBase64,
      mimeType: 'image/png',
    };
    operation = await ai.models.generateVideos({
      model: VEO_MODEL_NAME,
      prompt,
      image,
      config: {
        numberOfVideos,
        aspectRatio: aspectRatio,
      },
    });
  } else {
    operation = await ai.models.generateVideos({
      model: VEO_MODEL_NAME,
      prompt,
      config: {
        numberOfVideos,
        aspectRatio: aspectRatio,
      },
    });
  }

  while (!operation.done) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    console.log('...Generating...');
    operation = await ai.operations.getVideosOperation({operation});
    console.log(operation, operation.error);
  }

  if (operation?.response) {
    const response = operation.response;
    console.log(response);

    if (
      response.raiMediaFilteredCount &&
      response.raiMediaFilteredReasons.length > 0
    ) {
      throw new Error(response.raiMediaFilteredReasons[0]);
    }

    if (operation?.response.generatedVideos) {
      return await Promise.all(
        response.generatedVideos.map(
          async (
            generatedVideo: GeneratedVideo,
            index: number,
            videos: GeneratedVideo[],
          ) => {
            const url = decodeURIComponent(generatedVideo.video.uri);
            const res = await fetch(`${url}&key=${process.env.API_KEY}`);
            const blob = await res.blob();
            return bloblToBase64(blob);
          },
        ),
      );
    }
  }
  return [];
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
      const MAX_WIDTH = 400;

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
          color: 'grey', // semi-transparent grey fill with a solid grey border
        },
      });

      // 4. Group the text and background shapes.
      editor.groupShapes([backgroundShapeId, textShapeId], {
        groupId: groupId,
      });

      // 5. Place the new group on the canvas and connect it with an arrow.
      const newShapeGroup = editor.getShape(groupId);
      if (!newShapeGroup) return;

      placeNewShape(editor, newShapeGroup);
      createArrowBetweenShapes(editor, shape.id, newShapeGroup.id);
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
    promptText = `Generate a new version of this image, keeping the main subject, composition, and style as consistent as possible with the original. The final image must have an aspect ratio of ${aspectRatio}.`;
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

      sourceShapesId.forEach((shapeId) => {
        createArrowBetweenShapes(editor, shapeId, newShapeId);
      });
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

    sourceShapesId.forEach((shapeId) => {
      createArrowBetweenShapes(editor, shapeId, lastId);
    });
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

// ---

const assetUrls: TldrawProps['assetUrls'] = {
  icons: {
    'genai-describe-image': await loadIcon('/genai-describe-image.svg'),
    'genai-generate-image': await loadIcon('/genai-generate-image.svg'),
    'genai-generate-video': await loadIcon('/genai-generate-video.svg'),
    'genai-edit-image': await loadIcon('/genai-edit-image.svg'),
    'genai-use-in-chat': await loadIcon('/genai-use-in-chat.svg'),
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
  }: {
    setEditingImage: (
      image: {assetId: TLAssetId; src: string; bounds: Box} | null,
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
              addToast({title: e.message, severity: 'error'});
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
      image: {assetId: TLAssetId; src: string; bounds: Box} | null,
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

  const [editingImage, setEditingImage] = useState<{
    assetId: TLAssetId;
    src: string;
    bounds: Box;
  } | null>(null);
  const {addToast} = useToasts();
  const editor = useEditor();

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
        'Generates a new image from a text prompt. Use this to create something from scratch. Do not use this to edit or modify an existing image.',
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
          systemInstruction:
            "You are a helpful assistant integrated into a canvas application. You can use the provided tools to generate and edit images and videos directly on the canvas. When the user provides an image and asks to modify it (e.g., add something, change colors, add text), you MUST use the `editImage` tool. Use `generateImage` only for creating entirely new images from a text prompt.",
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

    let response = await chat.sendMessage({message: userParts});

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
            const {prompt} = fn.args;
            await runEditImage(editor, prompt as string, shapeIdForEditing);
            result = {output: `Successfully edited the image.`};
          }
        } else if (fn.name === 'generateImage') {
          const {prompt, numberOfImages, aspectRatio} = fn.args;
          const textShapeId = createShapeId();
          editor.createShape({
            id: textShapeId,
            type: 'text',
            props: {
              richText: toRichText(prompt as string),
              autoSize: true,
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
        } else {
          throw new Error(`Unknown tool ${fn.name}`);
        }
      } catch (e) {
        console.error(e);
        result = {error: e.message};
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
      />
      {mode === 'assistant' && <ChatHistoryUI history={chatHistory} />}
      {editingImage && (
        <ImageEditor
          image={editingImage}
          onCancel={() => setEditingImage(null)}
          onSave={handleSaveEditedImage}
          editImageApi={editImage}
        />
      )}
    </>
  );
};

// ---

export default function App() {
  return (
    <>
      <NoticeBanner />
      <Tldraw
        inferDarkMode
        components={{
          InFrontOfTheCanvas: Ui,
          Toolbar: () => null,
        }}
        assetUrls={assetUrls}
        onMount={(editor) => {
          editor.user.updateUserPreferences({
            animationSpeed: 1,
          });
          editor.zoomToFit();
        }}
      />
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);