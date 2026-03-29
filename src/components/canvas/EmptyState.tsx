import React from 'react';
import { Sparkles } from 'lucide-react';

interface EmptyStateProps {
  onSelect: (prompt: string) => void;
}

export function EmptyState({ onSelect }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 text-center select-none">
      <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shadow-lg shadow-violet-900/20">
        <Sparkles size={26} className="text-violet-400" />
      </div>
      <div>
        <p className="text-sm font-semibold text-white/70 mb-1.5">开始创作</p>
        <p className="text-xs text-white/25">
          在下方输入描述，AI 将为你生成图片
        </p>
      </div>
      <div className="flex flex-wrap gap-2 justify-center max-w-xs">
        {['帮我画一只猫', '赛博朋克城市夜景', '水彩风格山水画'].map((ex) => (
          <button
            key={ex}
            onClick={() => onSelect(ex)}
            className="px-3 py-1 text-xs bg-white/[0.04] text-white/30 rounded-full border border-white/[0.08] hover:text-white/50 hover:bg-white/[0.07] cursor-pointer transition-colors"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
