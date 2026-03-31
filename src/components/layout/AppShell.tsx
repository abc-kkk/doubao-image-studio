import React, { useState, useCallback, useEffect } from 'react';
import { Settings, Archive, LayoutGrid, MessageSquare } from 'lucide-react';
import { ChatView } from '../chat/ChatView';
import { useNavStore } from '../../store/navStore';
import { CanvasArea } from '../canvas/CanvasArea';
import { GalleryPanel } from '../gallery/GalleryPanel';
import { PromptBar } from '../toolbar/PromptBar';
import { SettingsModal } from '../settings/SettingsModal';
import { ImageLightbox } from '../canvas/ImageLightbox';
import { Toast } from '../common/Toast';
import { useNotificationStore } from '../../store/notificationStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useImageGeneration } from '../../hooks/useImageGeneration';
import { useImageStore } from '../../store/imageStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { ModelId, AspectRatio, GeneratedImage } from '../../types';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { urlToBase64 } from '../../utils/imageUtils';

export function AppShell() {
  const [showGallery, setShowGallery] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { currentView, setView } = useNavStore();
  const [reusePrompt, setReusePrompt] = useState('');
  const [useReference, setUseReference] = useState<string | undefined>(undefined);
  const { status: wsStatus } = useWebSocket();
  const { generate, currentJob } = useImageGeneration();
  const purgeReferenceData = useImageStore((state) => state.purgeReferenceData);
  const isGenerating = currentJob?.status === 'generating';

  useEffect(() => {
    // Purge any legacy base64 reference data from storage on mount
    purgeReferenceData();
  }, [purgeReferenceData]);
  const { message: toastMessage, type: toastType, hide: hideToast, show: showToast } = useNotificationStore();
  const { 
    images, 
    viewedImageId, 
    setViewedImage, 
    removeImage: originalRemoveImage 
  } = useImageStore();
 
  const removeImage = (id: string) => {
    originalRemoveImage(id);
    showToast('图片已删除', 'info');
  };

  const viewedImage = images.find(img => img.id === viewedImageId) || null;
  const viewedIndex = images.findIndex(img => img.id === viewedImageId);

  const handleNext = () => {
    if (viewedIndex < images.length - 1) setViewedImage(images[viewedIndex + 1].id);
  };
  const handlePrev = () => {
    if (viewedIndex > 0) setViewedImage(images[viewedIndex - 1].id);
  };
  const handleDownload = async (image: GeneratedImage) => {
    try {
      const { settings } = useSettingsStore.getState();
      console.log('Downloading image:', image.url, 'to', settings.saveDir || 'default');
      await invoke('download_image', { 
        url: image.url, 
        filename: `doubao_${image.id}.png`,
        saveDir: settings.saveDir || null
      });
      showToast('图片下载成功！');
    } catch (err) {
      console.error('Download failed:', err);
      showToast('获取到图片链接，请在浏览器中保存', 'error');
      window.open(image.url, '_blank');
    }
  };
  const handleSubmit = useCallback(
    async (prompt: string, aspectRatio: AspectRatio, switchToImageMode: boolean, referenceImages?: string[]) => {
      await generate(prompt, undefined, aspectRatio, switchToImageMode, referenceImages);
    },
    [generate]
  );
  const handleReusePrompt = (prompt: string) => {
    setReusePrompt(prompt);
  };

  const handleUseAsReference = async (url: string) => {
    try {
      const base64 = await urlToBase64(url);
      setUseReference(base64);
      showToast('已设为参考图', 'info');
    } catch (err) {
      console.error('Failed to convert reference image:', err);
      showToast('设置参考图失败', 'error');
    }
  };
 
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0f0f10] border border-white/5">
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="h-20 relative border-b border-white/[0.04] bg-[#0f0f10] shrink-0">
          <div className="relative h-full flex items-end px-4 pb-5">
            <div className="flex items-center gap-2.5 no-drag pointer-events-auto">
               <div className="w-6 h-6 rounded-lg bg-violet-600 flex items-center justify-center">
                  <LayoutGrid size={14} className="text-white" />
               </div>
               <span className="text-sm font-bold text-white/90 tracking-tight">豆包生图助手</span>
            </div>
            
            <div className="flex-1 h-full" onMouseDown={() => getCurrentWindow().startDragging()} />
            
            <div className="flex items-center gap-1 no-drag pointer-events-auto">
            {/* Connection Status */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.04] transition-all ${
              wsStatus === 'connected' ? 'text-emerald-400/80' : 'text-amber-400/80 animate-pulse'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${
                wsStatus === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'
              }`} />
              <span className="text-[10px] uppercase tracking-wider font-bold">
                {wsStatus === 'connected' ? 'Connected' : 'Connecting'}
              </span>
            </div>

            <div className="w-px h-4 bg-white/10 mx-1" />

            <button
              onClick={() => setView(currentView === 'chat' ? 'studio' : 'chat')}
              className={`p-2 rounded-lg transition-all ${
                currentView === 'chat' ? 'bg-violet-500/10 text-violet-400' : 'text-white/30 hover:text-white/60 hover:bg-white/5'
              }`}
              title="文字聊天"
            >
              <MessageSquare size={18} />
            </button>
            <button
              onClick={() => setShowGallery(!showGallery)}
              className={`p-2 rounded-lg transition-all ${
                showGallery ? 'bg-violet-500/10 text-violet-400' : 'text-white/30 hover:text-white/60 hover:bg-white/5'
              }`}
              title="历史图库"
            >
              <Archive size={18} />
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
              title="设置"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </div>
 
        <div className="flex-1 overflow-hidden">
          <div className="flex h-full">
            {currentView === 'chat' ? (
              <ChatView />
            ) : (
            <div className="flex flex-col flex-1 overflow-hidden">
              <CanvasArea
                onReusePrompt={handleReusePrompt}
                onUseAsReference={handleUseAsReference}
              />
              <PromptBar
                onSubmit={handleSubmit}
                disabled={isGenerating}
                initialPrompt={reusePrompt}
                initialReferenceImage={useReference}
              />
            </div>)}
   
            <div 
              className={`border-l border-white/[0.06] bg-[#0f0f10] transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0 ${
                showGallery ? 'w-64 opacity-100' : 'w-0 opacity-0 pointer-events-none'
              }`}
            >
              <div className="w-64 h-full">
                <GalleryPanel 
                  onReusePrompt={handleReusePrompt} 
                  onUseAsReference={handleUseAsReference}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ImageLightbox
        image={viewedImage}
        onClose={() => setViewedImage(null)}
        onPrev={viewedIndex < images.length - 1 ? handlePrev : undefined}
        onNext={viewedIndex > 0 ? handleNext : undefined}
        onDownload={handleDownload}
        onRemove={removeImage}
        onReuse={handleReusePrompt}
      />

      {toastMessage && (
        <Toast
          message={toastMessage}
          type={toastType}
          onClose={hideToast}
        />
      )}
    </div>
  );
}
