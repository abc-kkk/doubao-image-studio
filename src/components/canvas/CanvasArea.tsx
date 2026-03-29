import React from 'react';
import { EmptyState } from './EmptyState';
import { ImageBatch } from './ImageBatch';
import { useGallery } from '../../hooks/useGallery';
import { useImageStore } from '../../store/imageStore';
import { useImageGeneration } from '../../hooks/useImageGeneration';
import { useSettingsStore } from '../../store/settingsStore';
import { useNotificationStore } from '../../store/notificationStore';
import { invoke } from '@tauri-apps/api/core';
import type { GeneratedImage } from '../../types';

interface CanvasAreaProps {
  onReusePrompt: (prompt: string) => void;
  onUseAsReference?: (url: string) => void;
}

export function CanvasArea({ onReusePrompt, onUseAsReference }: CanvasAreaProps) {
  const { images, handleRemove, selectedImageId } = useGallery();
  const { setViewedImage } = useImageStore();
  const currentJob = useImageStore((s) => s.currentJob);
  const { generate } = useImageGeneration();

  const handleDownload = async (img: GeneratedImage) => {
    try {
      const { settings } = useSettingsStore.getState();
      const showToast = useNotificationStore.getState().show;
      await invoke('download_image', { 
        url: img.url, 
        filename: `doubao_${img.id}.png`,
        saveDir: settings.saveDir || null
      });
      showToast('图片下载成功！');
    } catch (err) {
      const showToast = useNotificationStore.getState().show;
      console.error('Download failed:', err);
      showToast('获取到图片链接，请在浏览器中保存', 'error');
      window.open(img.url, '_blank');
    }
  };

  const handleRegenerate = (prompt: string) => {
    generate(prompt);
  };

  const isGenerating = currentJob?.status === 'generating';

  // Group images by batchId or fallback to prompt + rounded timestamp
  const imageGroups = React.useMemo(() => {
    const groups: { [key: string]: GeneratedImage[] } = {};
    images.forEach(img => {
      // Use batchId as primary grouping key
      // Fallback to prompt + createdAt (rounded to nearest 5 seconds) for legacy images
      const groupKey = img.batchId || `${img.prompt}_${Math.floor(img.createdAt / 5000)}`;
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(img);
    });

    // Sort groups by time descending (using the first image in each group)
    return Object.values(groups).sort((a, b) => b[0].createdAt - a[0].createdAt);
  }, [images]);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-10 custom-scrollbar bg-[#0f0f10]">
      <div className="max-w-[1400px] mx-auto">
        {images.length === 0 && !isGenerating ? (
          <EmptyState onSelect={onReusePrompt} />
        ) : (
          <div className="flex flex-col">
            {isGenerating && (
              <div className="mb-8 p-1">
                <div className="flex flex-col gap-3 mb-2">
                   <h3 className="text-[13px] font-medium text-white/40 italic">{currentJob.prompt}</h3>
                </div>
                <div className="rounded-xl overflow-hidden border border-white/[0.04] bg-white/[0.01] flex items-center justify-center p-20">
                  <div className="flex flex-col items-center gap-2.5">
                    <span className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(167,139,250,0.3)]" />
                    <span className="text-xs text-white/20 uppercase tracking-[0.2em] font-medium">Generating Artifacts...</span>
                  </div>
                </div>
              </div>
            )}
            
            {imageGroups.map((group) => (
              <ImageBatch
                key={group[0].batchId || group[0].id}
                prompt={group[0].prompt}
                images={group}
                selectedImageId={selectedImageId}
                onSelect={setViewedImage}
                onRemove={handleRemove}
                onReuse={onReusePrompt}
                onRegenerate={handleRegenerate}
                onDownload={handleDownload}
                onUseAsReference={onUseAsReference}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
