/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
import * as React from 'react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {TLShapeId} from 'tldraw';

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// A generic Dropdown component
const DropdownButton = ({
  label,
  options,
  onSelect,
  disabled,
  children,
}: {
  label: string;
  options: {value: any; label: string}[];
  onSelect: (value: any) => void;
  disabled: boolean;
  children: React.ReactNode;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [wrapperRef]);

  return (
    <div className="dropdown-wrapper" ref={wrapperRef}>
      <button
        className="prompt-bar-button config-button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}>
        {children}
        {label}
      </button>
      {isOpen && (
        <div className="dropdown-menu">
          {options.map((option) => (
            <div
              key={option.value}
              className="dropdown-item"
              onClick={() => {
                onSelect(option.value);
                setIsOpen(false);
              }}>
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// SVG Icon Components
const PlusIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);
const ImageIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <circle cx="8.5" cy="8.5" r="1.5"></circle>
    <polyline points="21 15 16 10 5 21"></polyline>
  </svg>
);
const VideoIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7"></polygon>
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
  </svg>
);
const AspectRatioIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round">
    <rect x="7" y="3" width="10" height="18" rx="2" ry="2"></rect>
  </svg>
);
const GridIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round">
    <rect x="3" y="3" width="8" height="8"></rect>
    <rect x="13" y="3" width="8" height="8"></rect>
    <rect x="3" y="13" width="8" height="8"></rect>
    <rect x="13" y="13" width="8" height="8"></rect>
  </svg>
);
const SettingsIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round">
    <line x1="4" y1="21" x2="4" y2="14"></line>
    <line x1="4" y1="10" x2="4" y2="3"></line>
    <line x1="12" y1="21" x2="12" y2="12"></line>
    <line x1="12" y1="8" x2="12" y2="3"></line>
    <line x1="20" y1="21" x2="20" y2="16"></line>
    <line x1="20" y1="12" x2="20" y2="3"></line>
    <line x1="1" y1="14" x2="7" y2="14"></line>
    <line x1="9" y1="8" x2="15" y2="8"></line>
    <line x1="17" y1="16" x2="23" y2="16"></line>
  </svg>
);
const HelpIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
    <line x1="12" y1="17" x2="12.01" y2="17"></line>
  </svg>
);
const SubmitIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round">
    <line x1="12" y1="19" x2="12" y2="5"></line>
    <polyline points="5 12 12 5 19 12"></polyline>
  </svg>
);
const Spinner = () => <div className="spinner"></div>;

/**
 * A component providing an input bar for users to enter prompts, upload images,
 * and trigger the generation of either an image or a video.
 * It allows users to describe their desired output and provides options
 * to select the type of media to generate.
 */
export function PromptBar({
  onSubmit,
  onAssistantSubmit,
  mode,
  onModeChange,
  assistantImage,
  onClearAssistantImage,
}: {
  onSubmit: (
    prompt: string,
    imageSrc: string,
    action: 'image' | 'video',
    options: {numberOfImages: number; aspectRatio: string},
  ) => Promise<void>;
  onAssistantSubmit: (
    prompt: string,
    image?: {src: string; shapeId: TLShapeId} | null,
  ) => Promise<void>;
  mode: 'create' | 'assistant';
  onModeChange: (mode: 'create' | 'assistant') => void;
  assistantImage: {src: string; shapeId: TLShapeId} | null;
  onClearAssistantImage: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);

  const [selectedAction, setSelectedAction] = useState<'image' | 'video'>(
    'image',
  );
  const [numberOfImages, setNumberOfImages] = useState(1);
  const [aspectRatio, setAspectRatio] = useState('16:9');

  const aspectRatios = [
    {value: '16:9', label: '16:9'},
    {value: '9:16', label: '9:16'},
    {value: '4:3', label: '4:3'},
    {value: '3:4', label: '3:4'},
    {value: '1:1', label: '1:1'},
  ];

  const numImagesOptions = [
    {value: 1, label: '1'},
    {value: 2, label: '2'},
    {value: 3, label: '3'},
    {value: 4, label: '4'},
  ];

  const handleRun = useCallback(async () => {
    if (mode === 'create') {
      if ((!prompt && !imageFile) || isGenerating) return;
    } else {
      if ((!prompt && !assistantImage) || isGenerating) return;
    }

    setIsGenerating(true);

    if (mode === 'assistant') {
      await onAssistantSubmit(prompt, assistantImage);
    } else {
      let img = null;
      if (imageFile) {
        img = await fileToBase64(imageFile);
      }
      await onSubmit(prompt, img, selectedAction, {
        numberOfImages,
        aspectRatio,
      });
    }

    setIsGenerating(false);
    setPrompt('');
    if (mode === 'assistant') {
      onClearAssistantImage();
    } else {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setImageFile(null);
    }
    promptInputRef.current?.focus();
  }, [
    prompt,
    imageFile,
    isGenerating,
    selectedAction,
    onSubmit,
    onAssistantSubmit,
    numberOfImages,
    aspectRatio,
    mode,
    assistantImage,
    onClearAssistantImage,
  ]);

  const handleImageUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImageFile(e.target.files[0]);
      promptInputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleRun();
    }
  };

  return (
    <div className="prompt-bar-wrapper">
      <div className="mode-switcher">
        <button
          className={mode === 'create' ? 'active' : ''}
          onClick={() => onModeChange('create')}>
          Create
        </button>
        <button
          className={mode === 'assistant' ? 'active' : ''}
          onClick={() => onModeChange('assistant')}>
          Assistant
        </button>
      </div>
      <div className="prompt-bar" onKeyDown={(e) => e.stopPropagation()}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          style={{display: 'none'}}
          accept="image/*"
        />

        <div className="prompt-input-area">
          {mode === 'create' && (
            <button
              className="prompt-bar-button icon-button add-button"
              onClick={handleImageUploadClick}
              disabled={isGenerating}
              title="Add an image">
              <PlusIcon />
            </button>
          )}

          {mode === 'create' && imageFile && (
            <div className="prompt-image-preview">
              <img src={URL.createObjectURL(imageFile)} alt="upload preview" />
              <button
                className="prompt-image-preview-close"
                onClick={() => {
                  setImageFile(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}>
                ×
              </button>
            </div>
          )}

          {mode === 'assistant' && assistantImage && (
            <div className="prompt-image-preview">
              <img src={assistantImage.src} alt="assistant reference" />
              <button
                className="prompt-image-preview-close"
                onClick={() => onClearAssistantImage()}>
                ×
              </button>
            </div>
          )}

          <input
            ref={promptInputRef}
            type="text"
            className="prompt-input"
            placeholder={
              mode === 'assistant'
                ? 'Ask the assistant to do something...'
                : 'Describe what you want to create...'
            }
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isGenerating}
          />
        </div>

        {mode === 'create' && (
          <div className="prompt-actions-area">
            <div className="prompt-config-buttons">
              <button
                className={`prompt-bar-button config-button ${
                  selectedAction === 'image' ? 'active' : ''
                }`}
                onClick={() => setSelectedAction('image')}
                disabled={isGenerating}>
                <ImageIcon />
                Image
              </button>
              <button
                className={`prompt-bar-button config-button ${
                  selectedAction === 'video' ? 'active' : ''
                }`}
                onClick={() => setSelectedAction('video')}
                disabled={isGenerating}>
                <VideoIcon />
                Video
              </button>
              <DropdownButton
                label={aspectRatio}
                options={aspectRatios}
                onSelect={setAspectRatio}
                disabled={isGenerating}>
                <AspectRatioIcon />
              </DropdownButton>
              {selectedAction === 'image' && (
                <DropdownButton
                  label={`${numberOfImages}v`}
                  options={numImagesOptions}
                  onSelect={setNumberOfImages}
                  disabled={isGenerating}>
                  <GridIcon />
                </DropdownButton>
              )}
              <button
                className="prompt-bar-button icon-button placeholder"
                disabled>
                <SettingsIcon />
              </button>
              <button
                className="prompt-bar-button icon-button placeholder"
                disabled>
                <HelpIcon />
              </button>
            </div>
          </div>
        )}
        <button
          className="prompt-bar-button submit-button"
          onClick={handleRun}
          disabled={
            isGenerating ||
            (mode === 'create' && !prompt && !imageFile) ||
            (mode === 'assistant' && !prompt && !assistantImage)
          }
          aria-label="Generate">
          {isGenerating ? <Spinner /> : <SubmitIcon />}
        </button>
      </div>
    </div>
  );
}
