import React, { useEffect } from 'react';
import { X, Download, Trash2, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { ask } from '@tauri-apps/plugin-dialog';
import type { GeneratedImage } from '../../types';

interface ImageLightboxProps {
  image: GeneratedImage | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onDownload?: (image: GeneratedImage) => void;
  onRemove?: (id: string) => void;
  onReuse?: (prompt: string) => void;
}

export function ImageLightbox({
  image,
  onClose,
  onPrev,
  onNext,
  onDownload,
  onRemove,
  onReuse,
}: ImageLightboxProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev?.();
      if (e.key === 'ArrowRight') onNext?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onPrev, onNext]);

  if (!image) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-xl animate-in fade-in duration-200">
      {/* Background click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Toolbar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black/50 to-transparent">
        <div className="flex-1 min-w-0 pr-12">
          <p className="text-sm text-white/90 line-clamp-1 font-medium">{image.prompt}</p>
          <p className="text-[10px] text-white/30 uppercase tracking-widest mt-0.5">
            {image.model} • {image.aspectRatio}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onReuse && (
            <button
              onClick={() => onReuse(image.prompt)}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-violet-500/20 text-white/70 hover:text-violet-300 transition-all border border-white/5"
              title="复用提示词"
            >
              <RotateCcw size={18} />
            </button>
          )}
          {onDownload && (
            <button
              onClick={() => onDownload(image)}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all border border-white/5"
              title="下载"
            >
              <Download size={18} />
            </button>
          )}
          {onRemove && (
            <button
              onClick={async () => {
                const confirmed = await ask('确认要删除这张图片吗？', { 
                  title: '删除图片',
                  kind: 'warning' 
                });
                if (confirmed) {
                  onRemove(image.id);
                  onClose();
                }
              }}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-red-500/20 text-white/70 hover:text-red-400 transition-all border border-white/5"
              title="删除"
            >
              <Trash2 size={18} />
            </button>
          )}
          <div className="w-px h-6 bg-white/10 mx-1" />
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all border border-white/5"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Image Content */}
      <div className="relative flex-1 flex items-center justify-center p-4 md:p-12 overflow-hidden">
        {onPrev && (
          <button
            onClick={onPrev}
            className="absolute left-6 z-20 p-4 rounded-full bg-black/20 hover:bg-black/40 text-white/40 hover:text-white transition-all backdrop-blur-sm border border-white/5 group"
          >
            <ChevronLeft size={32} className="group-hover:-translate-x-0.5 transition-transform" />
          </button>
        )}

        <div className="relative w-full h-full flex items-center justify-center pointer-events-none">
          <img
            src={image.localPath ? `http://localhost:8081/local-proxy?path=${encodeURIComponent(image.localPath)}` : image.url}
            alt={image.prompt}
            className="max-w-full max-h-full object-contain shadow-2xl rounded-sm animate-in zoom-in-95 duration-300 pointer-events-auto shadow-black"
          />
        </div>

        {onNext && (
          <button
            onClick={onNext}
            className="absolute right-6 z-20 p-4 rounded-full bg-black/20 hover:bg-black/40 text-white/40 hover:text-white transition-all backdrop-blur-sm border border-white/5 group"
          >
            <ChevronRight size={32} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}
      </div>

      {/* Bottom gap */}
      <div className="h-20 shrink-0" />
    </div>
  );
}
