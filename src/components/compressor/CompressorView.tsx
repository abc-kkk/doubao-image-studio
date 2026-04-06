import React, { useState, useCallback, useEffect } from 'react';
import { Upload, Download, Image as ImageIcon, Zap, FileJson, ChevronRight } from 'lucide-react';
import { useSettingsStore } from '../../store/settingsStore';
import { useNotificationStore } from '../../store/notificationStore';
import { useNavStore } from '../../store/navStore';
import { invoke } from '@tauri-apps/api/core';

export function CompressorView() {
  const [origImage, setOrigImage] = useState<string | null>(null);
  const [compImage, setCompImage] = useState<string | null>(null);
  const [format, setFormat] = useState('JPEG');
  const [quality, setQuality] = useState(82);
  const [stats, setStats] = useState<{
    origSize: number;
    compSize: number;
    width: number;
    height: number;
    ratio: string;
  } | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const { show: showToast } = useNotificationStore();
  const { settings } = useSettingsStore();
  const { pendingImageData, setPendingImage } = useNavStore();

  // Load pending image from AI Studio if available
  useEffect(() => {
    if (pendingImageData) {
      setOrigImage(pendingImageData);
      setPendingImage(undefined); // Clear after use
    }
  }, [pendingImageData, setPendingImage]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  };

  const loadFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setOrigImage(e.target?.result as string);
      setCompImage(null);
      setStats(null);
    };
    reader.readAsDataURL(file);
  };

  const handleCompress = async () => {
    if (!origImage) return;
    setIsCompressing(true);
    try {
      // Get original size
      const origSize = origImage.length * 3 / 4; // Approximate base64 decoded size
      
      // Call Rust compress_image command
      const dataUrl = await invoke<string>('compress_image', {
        imageData: origImage,
        format: format.toLowerCase(),
        quality,
        targetSize: 1024 * 1024 // 1MB target
      });
      
      setCompImage(dataUrl);
      
      // Get compressed size
      const compSize = dataUrl.length * 3 / 4;
      
      // Get image dimensions from dataUrl
      const img = new window.Image();
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.src = dataUrl;
      });
      
      setStats({
        origSize: Math.round(origSize),
        compSize: Math.round(compSize),
        width: img.naturalWidth,
        height: img.naturalHeight,
        ratio: ((1 - compSize / origSize) * 100).toFixed(1) + '%'
      });
      showToast('压缩完成！');
    } catch (err) {
      console.error('Compression failed:', err);
      showToast('压缩失败: ' + String(err), 'error');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleSave = async () => {
    if (!compImage) return;
    try {
      const fileName = `compressed_${Date.now()}.${format.toLowerCase() === 'jpeg' ? 'jpg' : format.toLowerCase()}`;
      const path = await invoke<string>('save_base64_image', {
        base64_data: compImage,
        filename: fileName,
        saveDir: settings.saveDir || null
      });
      showToast(`已保存到: ${path}`, 'success');
    } catch (err) {
      console.error('Failed to save image:', err);
      showToast('保存失败', 'error');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      loadFile(file);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0f0f10] overflow-hidden">
      {/* Header Area */}
      <div className="flex-1 overflow-auto p-4 md:p-8 flex flex-col gap-6">
        {/* Upload Zone */}
        {!origImage ? (
          <div 
            onClick={() => document.getElementById('file-input')?.click()}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="flex-1 border-2 border-dashed border-white/[0.08] hover:border-violet-500/50 hover:bg-violet-500/[0.02] rounded-3xl flex flex-col items-center justify-center gap-4 transition-all cursor-pointer group"
          >
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] flex items-center justify-center text-white/20 group-hover:text-violet-400 group-hover:scale-110 transition-all">
              <Upload size={32} />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-white/70">拖拽图片到这里，或点击选择</p>
              <p className="text-sm text-white/30 mt-1">支持 JPG、PNG、WebP · 单文件最大 50MB</p>
            </div>
            <input 
              type="file" 
              id="file-input" 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileSelect}
            />
          </div>
        ) : (
          <div className="flex flex-col h-full gap-6">
            {/* Comparison Area */}
            <div className="flex-1 min-h-[400px] grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Original */}
              <div className="flex flex-col bg-white/[0.02] rounded-3xl border border-white/[0.04] overflow-hidden group">
                <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.04]">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-white/40">原图</span>
                  {stats && <span className="text-xs text-white/40">{formatSize(stats.origSize)}</span>}
                </div>
                <div className="flex-1 flex items-center justify-center p-4">
                  <img 
                    src={origImage.startsWith('/Users/') ? `http://localhost:8010/local-proxy?path=${encodeURIComponent(origImage)}` : origImage} 
                    className="max-w-full max-h-full object-contain rounded-lg shadow-2xl shadow-black/40" 
                  />
                </div>
              </div>

              {/* Compressed */}
              <div className="flex flex-col bg-white/[0.02] rounded-3xl border border-white/[0.04] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.04]">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-400/60">压缩后</span>
                  {stats && <span className="text-xs text-emerald-400/80 font-bold">{formatSize(stats.compSize)}</span>}
                </div>
                <div className="flex-1 flex items-center justify-center p-4 relative">
                  {compImage ? (
                    <img src={compImage} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl shadow-black/40 animate-in zoom-in-95 duration-200" />
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-white/10 italic">
                      <ImageIcon size={48} strokeWidth={1} />
                      <span className="text-sm">点击开始压缩查看效果</span>
                    </div>
                  )}
                  {isCompressing && (
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center rounded-3xl z-10">
                      <Zap size={32} className="text-violet-400 animate-pulse" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Change Actions for Mobile or Small Screen */}
            <div className="flex md:hidden justify-center">
               <button 
                onClick={() => setOrigImage(null)}
                className="text-white/30 hover:text-white/60 text-xs py-2"
               >
                 更换图片
               </button>
            </div>
          </div>
        )}
      </div>

      {/* Control Panel (Right Sidebar behavior in a row) */}
      <div className="h-auto md:h-28 border-t border-white/[0.06] bg-[#0c0c0d]/80 backdrop-blur-xl p-4 md:px-8 flex flex-col md:flex-row items-center gap-6 shrink-0">
        {/* Format Selector */}
        <div className="flex flex-col gap-2 min-w-[140px]">
          <span className="text-[10px] uppercase font-bold tracking-widest text-white/30">输出格式</span>
          <div className="flex p-0.5 rounded-xl bg-white/[0.03] border border-white/[0.04]">
            {['JPEG', 'PNG', 'WEBP'].map(f => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`flex-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  format === f ? 'bg-violet-600 text-white shadow-lg' : 'text-white/40 hover:text-white/60 hover:bg-white/5'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Quality Slider */}
        <div className="flex-1 w-full flex flex-col gap-2">
          <div className="flex justify-between">
            <span className="text-[10px] uppercase font-bold tracking-widest text-white/30">压缩质量</span>
            <span className="text-xs font-bold text-violet-400">{quality}%</span>
          </div>
          <input 
            type="range" 
            min="10" 
            max="100" 
            value={quality}
            onChange={(e) => setQuality(parseInt(e.target.value))}
            className="w-full accent-violet-600 h-1 rounded-full bg-white/5"
          />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2 shrink-0">
          <div className="px-4 py-2 rounded-xl bg-white/[0.02] border border-white/[0.04] min-w-[100px]">
             <div className="text-sm font-bold text-white/70">{stats ? stats.ratio : '—'}</div>
             <div className="text-[9px] uppercase tracking-wider text-white/20">压缩率</div>
          </div>
          <div className="px-4 py-2 rounded-xl bg-white/[0.02] border border-white/[0.04] min-w-[100px]">
             <div className="text-sm font-bold text-white/70">{stats ? `${stats.width}x${stats.height}` : '—'}</div>
             <div className="text-[9px] uppercase tracking-wider text-white/20">最终尺寸</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 shrink-0">
          {origImage && (
            <button
               onClick={() => setOrigImage(null)}
               className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.05] text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
               title="重置"
            >
              <ImageIcon size={20} />
            </button>
          )}
          <button
            disabled={!origImage || isCompressing}
            onClick={handleCompress}
            className="px-6 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white font-bold text-sm shadow-xl shadow-violet-900/20 transition-all flex items-center gap-2"
          >
            {isCompressing ? '处理中...' : (
               <>
                 <Zap size={18} />
                 开始压缩
               </>
            )}
          </button>
          <button
            disabled={!compImage}
            onClick={handleSave}
            className="px-6 py-3 rounded-2xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/20 disabled:opacity-30 disabled:grayscale font-bold text-sm transition-all flex items-center gap-2"
          >
            <Download size={18} />
            保存图片
          </button>
        </div>
      </div>
    </div>
  );
}
