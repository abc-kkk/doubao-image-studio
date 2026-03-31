import React from 'react';
import { Image, MessageSquare, Settings, Trash2 } from 'lucide-react';
import { useNavStore } from '../../store/navStore';
import { useImageStore } from '../../store/imageStore';
import { useNotificationStore } from '../../store/notificationStore';

export function Sidebar() {
  const { currentView, setView } = useNavStore();
  const clearImages = useImageStore((s) => s.clearImages);
  const { show: showToast } = useNotificationStore();

  const handleClearImages = () => {
    if (confirm('确定清空所有图片？')) {
      clearImages();
      showToast('图片已清空', 'info');
    }
  };

  return (
    <div className="w-[52px] h-full bg-[#0f0f10] border-r border-white/[0.04] flex flex-col items-center py-3 gap-1">
      {/* 图片生成 tab */}
      <button
        onClick={() => setView('studio')}
        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
          currentView === 'studio'
            ? 'bg-violet-600 text-white'
            : 'text-white/40 hover:text-white/70 hover:bg-white/5'
        }`}
        title="图片生成"
      >
        <Image size={18} />
      </button>

      {/* 文字聊天 tab */}
      <button
        onClick={() => setView('chat')}
        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
          currentView === 'chat'
            ? 'bg-violet-600 text-white'
            : 'text-white/40 hover:text-white/70 hover:bg-white/5'
        }`}
        title="文字聊天"
      >
        <MessageSquare size={18} />
      </button>

      <div className="flex-1" />

      {/* 清空图片 */}
      <button
        onClick={handleClearImages}
        className="w-10 h-10 rounded-xl flex items-center justify-center text-white/20 hover:text-white/50 hover:bg-white/5 transition-all"
        title="清空图片"
      >
        <Trash2 size={16} />
      </button>

      {/* 设置 */}
      <button
        onClick={() => {/* handled in AppShell */}}
        className="w-10 h-10 rounded-xl flex items-center justify-center text-white/20 hover:text-white/50 hover:bg-white/5 transition-all"
        title="设置"
      >
        <Settings size={16} />
      </button>
    </div>
  );
}
