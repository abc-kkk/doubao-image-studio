import React from 'react';
import { Sparkles, Minimize2, Settings, History } from 'lucide-react';
import { useNavStore } from '../../store/navStore';

interface NavbarProps {
  onOpenSettings: () => void;
}

export function Navbar({ onOpenSettings }: NavbarProps) {
  const { currentView, setView } = useNavStore();

  return (
    <nav className="w-16 h-full flex flex-col items-center pt-20 pb-6 bg-[#0c0c0d] border-r border-white/5 shrink-0 z-30">
      {/* App Logo */}
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-900/20 mb-8">
        <Sparkles size={20} className="text-white" />
      </div>

      {/* Nav Items */}
      <div className="flex flex-col gap-4 flex-1">
        <button
          onClick={() => setView('studio')}
          className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all group relative ${
            currentView === 'studio' 
              ? 'bg-violet-600/10 text-violet-400 border border-violet-500/20 shadow-inner shadow-violet-500/10' 
              : 'text-white/20 hover:text-white/50 hover:bg-white/5'
          }`}
          title="AI 绘画"
        >
          <Sparkles size={20} />
          {currentView === 'studio' && (
             <div className="absolute left-0 w-1 h-5 bg-violet-500 rounded-r-full" />
          )}
        </button>

        <button
          onClick={() => setView('compressor')}
          className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all group relative ${
            currentView === 'compressor' 
              ? 'bg-violet-600/10 text-violet-400 border border-violet-500/20 shadow-inner shadow-violet-500/10' 
              : 'text-white/20 hover:text-white/50 hover:bg-white/5'
          }`}
          title="图片压缩"
        >
          <Minimize2 size={20} />
          {currentView === 'compressor' && (
             <div className="absolute left-0 w-1 h-5 bg-violet-500 rounded-r-full" />
          )}
        </button>
      </div>

      {/* Bottom Actions */}
      <div className="flex flex-col gap-4">
        <button
          onClick={onOpenSettings}
          className="w-11 h-11 rounded-2xl flex items-center justify-center text-white/20 hover:text-white/50 hover:bg-white/5 transition-all"
          title="设置"
        >
          <Settings size={20} />
        </button>
      </div>
    </nav>
  );
}
