import React from 'react';
import { RefreshCw, Edit3, Clock, Layers } from 'lucide-react';
import { ImageCard } from './ImageCard';
import type { GeneratedImage } from '../../types';

interface ImageBatchProps {
  prompt: string;
  images: GeneratedImage[];
  onRemove: (id: string) => void;
  onSelect: (id: string) => void;
  selectedImageId?: string | null;
  onReuse: (prompt: string) => void;
  onRegenerate: (prompt: string) => void;
  onDownload: (img: GeneratedImage) => void;
  onUseAsReference?: (url: string) => void;
}

export function ImageBatch({
  prompt,
  images,
  onRemove,
  onSelect,
  selectedImageId,
  onReuse,
  onRegenerate,
  onDownload,
  onUseAsReference,
}: ImageBatchProps) { 
  const firstImage = images[0];
  const date = new Date(firstImage.createdAt).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex flex-col gap-3 mb-10 group/batch">
      {/* Batch Header */}
      <div className="flex flex-col gap-1 px-1">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-[13px] font-medium text-white/80 line-clamp-2 leading-relaxed flex-1">
            {prompt}
          </h3>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.05]">
              <Clock size={10} className="text-white/20" />
              <span className="text-[10px] text-white/30 font-medium uppercase tracking-tight">{date}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.05]">
              <Layers size={10} className="text-white/20" />
              <span className="text-[10px] text-white/30 font-medium uppercase tracking-tight">
                {firstImage.aspectRatio} | 2.0 Pro
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Images Grid */}
      <div 
        className="grid gap-3" 
        style={{ 
          gridTemplateColumns: `repeat(${Math.min(images.length, 4)}, 1fr)`,
          maxWidth: images.length === 1 ? '400px' : 'none'
        }}
      >
        {images.map((img) => (
          <ImageCard
            key={img.id}
            image={img}
            selected={selectedImageId === img.id}
            onSelect={() => onSelect(img.id)}
            onRemove={() => onRemove(img.id)}
            onReuse={onReuse}
            onDownload={() => onDownload(img)}
            onUseAsReference={onUseAsReference}
          />
        ))}
      </div>

      {/* Batch Actions */}
      <div className="flex items-center gap-2 mt-1 opacity-60 group-hover/batch:opacity-100 transition-opacity">
        <button
          onClick={() => onReuse(prompt)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-white/60 hover:text-white hover:bg-white/[0.06] border border-white/[0.04] transition-all"
        >
          <Edit3 size={12} />
          重新编辑
        </button>
        <button
          onClick={() => onRegenerate(prompt)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-white/60 hover:text-white hover:bg-white/[0.06] border border-white/[0.04] transition-all"
        >
          <RefreshCw size={12} />
          再次生成
        </button>
      </div>
    </div>
  );
}
