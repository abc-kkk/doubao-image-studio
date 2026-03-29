import React, { useState } from 'react';
import { Download, Trash2, RotateCcw } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { GeneratedImage } from '../../types';

interface ImageCardProps {
  image: GeneratedImage;
  selected?: boolean;
  onSelect?: () => void;
  onRemove?: () => void;
  onReuse?: (prompt: string) => void;
  onDownload?: () => void;
  onUseAsReference?: (url: string) => void;
}

export function ImageCard({
  image,
  selected,
  onSelect,
  onRemove,
  onReuse,
  onDownload,
  onUseAsReference,
}: ImageCardProps) {
  const [hovered, setHovered] = useState(false);
  
  // Use Express proxy as a fallback or primary for local files to avoid Tauri protocol issues
  const displayUrl = image.localPath 
    ? `http://localhost:8081/local-proxy?path=${encodeURIComponent(image.localPath)}&w=400` 
    : image.url;

  return (
    <div
      className={`relative rounded-xl overflow-hidden cursor-pointer transition-all group border aspect-square ${
        selected ? 'ring-2 ring-violet-500 ring-offset-2 ring-offset-[#0f0f10] border-violet-500/40' : 'border-white/[0.06] hover:border-white/20'
      }`}
      onClick={onSelect}
    >
      <img
        src={displayUrl}
        alt={image.prompt}
        className="w-full h-full object-cover block"
        loading="lazy"
        decoding="async"
      />

      {/* Action Overlay */}
      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent translate-y-1 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-200">
        <div className="flex flex-wrap items-center gap-1.5 justify-end">
          {onUseAsReference && (
            <button
              onClick={(e) => { e.stopPropagation(); onUseAsReference(image.url); }}
              className="px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-bold shadow-lg shadow-violet-900/40 transition-all"
            >
              参考
            </button>
          )}
          {onReuse && (
            <button
              onClick={(e) => { e.stopPropagation(); onReuse(image.prompt); }}
              className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 text-[11px] font-medium backdrop-blur-md transition-colors"
            >
              复用
            </button>
          )}
          {onDownload && (
            <button
              onClick={(e) => { e.stopPropagation(); onDownload(); }}
              className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 text-[11px] font-medium backdrop-blur-md transition-colors"
            >
              下载
            </button>
          )}
          {onRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="px-2.5 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-200 text-[11px] font-medium backdrop-blur-md transition-colors border border-red-500/20"
            >
              删除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
