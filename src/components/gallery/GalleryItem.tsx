import React from 'react';
import { Trash2, RotateCcw } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useImageStore } from '../../store/imageStore';
import type { GeneratedImage } from '../../types';

interface GalleryItemProps {
  image: GeneratedImage;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onReuse: (prompt: string) => void;
  onUseAsReference?: (url: string) => void;
}

export const GalleryItem = React.memo(({ image, selected, onSelect, onRemove, onReuse, onUseAsReference }: GalleryItemProps) => {
  const date = new Date(image.createdAt).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Use Express proxy to avoid Tauri protocol issues
  const displayUrl = image.localPath 
    ? `http://localhost:8081/local-proxy?path=${encodeURIComponent(image.localPath)}&w=160&h=160` 
    : image.url;

  return (
    <div
      onClick={() => {
        onSelect();
        useImageStore.getState().setViewedImage(image.id);
      }}
      className={`group flex gap-2 p-2 rounded-xl cursor-pointer transition-all duration-150 border ${
        selected 
          ? 'bg-violet-500/10 border-violet-500/20 shadow-lg shadow-violet-950/20' 
          : 'border-transparent hover:bg-white/[0.04]'
      }`}
    >
      <img
        src={displayUrl}
        alt={image.prompt}
        loading="lazy"
        className="w-10 h-10 rounded-lg object-cover shrink-0 border border-white/[0.08] bg-white/[0.02]"
      />
      <div className="flex-1 min-w-0 py-0.5">
        <p className="text-[11px] text-white/70 line-clamp-1 leading-tight mb-0.5">
          {image.prompt}
        </p>
        <p className="text-[9px] text-white/30 uppercase tracking-tight">{date}</p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pr-1">
        {onUseAsReference && (
          <button
            onClick={(e) => { e.stopPropagation(); onUseAsReference(image.url); }}
            className="px-1.5 py-0.5 rounded-md text-[9px] font-medium text-violet-400 bg-violet-500/10 hover:bg-violet-500/20 transition-all border border-violet-500/10"
            title="设为参考图"
          >
            参考
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onReuse(image.prompt); }}
          className="w-5 h-5 flex items-center justify-center rounded-md text-white/30 hover:text-violet-300 hover:bg-violet-500/20 transition-all"
          title="复用提示词"
        >
          <RotateCcw size={10} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="w-5 h-5 flex items-center justify-center rounded-md text-white/30 hover:text-red-400 hover:bg-red-500/20 transition-all"
          title="删除"
        >
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  );
});

GalleryItem.displayName = 'GalleryItem';
