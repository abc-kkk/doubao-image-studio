import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Send, Sparkles, ImagePlay, Image as ImageIcon, X, Palette } from 'lucide-react';
import { AspectRatioSelector } from './AspectRatioSelector';
import { useSettingsStore } from '../../store/settingsStore';
import type { AspectRatio } from '../../types';

const STYLE_OPTIONS = [
  { value: '', label: '无风格' },
  { value: '像素风格，像素艺术，8-bit游戏画风', label: '像素风' },
  { value: '3D皮克斯风格，迪士尼动画，精致三维渲染，温馨可爱', label: '3D皮克斯' },
  { value: '日本动漫风格，二次元，精美插画', label: '动漫风格' },
  { value: '中国传统水墨画风格，写意，意境深远', label: '水墨风格' },
  { value: '赛博朋克风格，霓虹灯，未来都市，暗黑科技感', label: '赛博朋克' },
  { value: '油画风格，印象派，厚重笔触，艺术感', label: '油画风格' },
  { value: '水彩画风格，柔和色彩，透明感，手绘质感', label: '水彩风格' },
  { value: '极简主义，简洁线条，扁平设计，现代感', label: '极简风格' },
  { value: '复古胶片风格，老照片质感，grain噪点，怀旧色调', label: '复古胶片' },
  { value: '超写实风格，照片级真实感，8K超清细节', label: '超写实' },
  { value: '哥特风格，黑暗奇幻，神秘氛围，华丽繁复', label: '哥特风格' },
  { value: '蒸汽朋克风格，维多利亚时代，齿轮机械，铜制质感', label: '蒸汽朋克' },
];

interface PromptBarProps {
  onSubmit: (prompt: string, aspectRatio: AspectRatio, switchToImageMode: boolean, referenceImages?: string[]) => void;
  disabled?: boolean;
  initialPrompt?: string;
  initialReferenceImage?: string;
}

export function PromptBar({ onSubmit, disabled, initialPrompt = '', initialReferenceImage }: PromptBarProps) {
  const { settings } = useSettingsStore();
  const [prompt, setPrompt] = useState(initialPrompt);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(settings.defaultAspectRatio);
  const [switchMode, setSwitchMode] = useState(false);
  const [refImage, setRefImage] = useState<string | null>(initialReferenceImage || null);
  const [style, setStyle] = useState('');
  const [styleOpen, setStyleOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const styleRef = useRef<HTMLDivElement>(null);
  const styleBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!styleOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (styleBtnRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setStyleOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [styleOpen]);

  const handleStyleToggle = () => {
    if (!styleOpen && styleBtnRef.current) {
      const rect = styleBtnRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.top - 8, left: rect.left });
    }
    setStyleOpen(!styleOpen);
  };

  const handleSubmit = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed || disabled) return;
    const finalPrompt = style ? `${trimmed}，${style}` : trimmed;
    onSubmit(finalPrompt, aspectRatio, switchMode, refImage ? [refImage] : []);
    setSwitchMode(false);
    setPrompt('');
    setRefImage(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [prompt, aspectRatio, disabled, switchMode, refImage, onSubmit]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setRefImage(base64);
    };
    reader.readAsDataURL(file);
    
    // Reset input so the same file can be picked again if removed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  React.useEffect(() => {
    if (initialPrompt) {
      setPrompt(initialPrompt);
      textareaRef.current?.focus();
    }
  }, [initialPrompt]);

  React.useEffect(() => {
    if (initialReferenceImage) {
      setRefImage(initialReferenceImage);
    }
  }, [initialReferenceImage]);

  return (
    <div className="px-4 pb-4 pt-2 shrink-0">
      <div className="w-full glass-panel border border-white/[0.08] shadow-2xl rounded-2xl overflow-hidden relative before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/[0.02] before:to-transparent before:pointer-events-none">
        
        {/* Reference Image Preview */}
        {refImage && (
          <div className="px-4 pt-3 flex items-start">
            <div className="relative group w-16 h-16 rounded-lg overflow-hidden border border-white/20">
              <img src={refImage} className="w-full h-full object-cover" />
              <button 
                onClick={() => setRefImage(null)}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={10} />
              </button>
            </div>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            const el = e.target;
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 120) + 'px';
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={refImage ? "基于这张图片描述你的修改或风格..." : "描述你想要生成的图片，例如：星空下奔跑的赛博朋克狐狸..."}
          rows={1}
          disabled={disabled}
          className="w-full text-sm text-white/85 placeholder-white/20 resize-none outline-none bg-transparent leading-relaxed"
          style={{ padding: refImage ? '8px 16px 6px' : '12px 16px 6px' }}
        />
        <div className="flex items-center justify-between px-4 pb-2 pt-1 min-h-[44px]">
          <div className="flex items-center" style={{ gap: '12px' }}>
            <AspectRatioSelector value={aspectRatio} onChange={setAspectRatio} />
            <div className="w-px h-3 bg-white/10 mx-0.5" />
            <div ref={styleRef}>
              <button
                ref={styleBtnRef}
                onClick={handleStyleToggle}
                className={`flex items-center gap-1.5 text-[11px] font-medium rounded-lg transition-all duration-150 ${
                  style
                    ? 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/30'
                    : 'text-white/35 hover:text-white/65 hover:bg-white/[0.06]'
                }`}
                style={{ height: '30px', padding: '0 10px' }}
              >
                <Palette size={12} />
                {style ? STYLE_OPTIONS.find(o => o.value === style)?.label : '风格'}
              </button>
            </div>
            {styleOpen && createPortal(
              <div
                ref={menuRef}
                className="fixed z-[9999] glass-panel border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl backdrop-blur-3xl animate-in fade-in zoom-in-95 duration-150"
                style={{ bottom: window.innerHeight - menuPos.top + 8, left: menuPos.left, width: 100 }}
              >
                {STYLE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => { setStyle(o.value); setStyleOpen(false); }}
                    className={`w-full text-left text-[11px] px-3 py-2 transition-all ${
                      style === o.value
                        ? 'bg-violet-500/20 text-violet-300'
                        : 'text-white/60 hover:bg-white/[0.06] hover:text-white/90'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>,
              document.body
            )}
            <div className="w-px h-3 bg-white/10 mx-0.5" />
            
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageUpload} 
              accept="image/*" 
              className="hidden" 
            />
            
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`flex items-center justify-center rounded-lg transition-all duration-150 ${
                refImage ? 'text-violet-400 bg-violet-500/10' : 'text-white/35 hover:text-white/65 hover:bg-white/[0.06]'
              }`}
              style={{ height: '30px', padding: '0 12px', gap: '6px' }}
              title="上传参考图"
            >
              <ImageIcon size={13} />
              <span className="text-[11px]">{refImage ? '已选择' : '上传图'}</span>
            </button>

            <div className="w-px h-3 bg-white/10 mx-0.5" />

            <button
              type="button"
              onClick={() => setSwitchMode(v => !v)}
              title={switchMode ? '将切换到图像模式后发送' : '已在图像模式，直接发送'}
              className={`flex items-center justify-center text-[11px] rounded-lg transition-all duration-150 ${
                switchMode
                  ? 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/30'
                  : 'text-white/35 hover:text-white/65 hover:bg-white/[0.06]'
              }`}
              style={{ height: '30px', padding: '0 12px', gap: '6px' }}
            >
              <ImagePlay size={13} />
              <span>{switchMode ? '切换模式' : '图像模式'}</span>
            </button>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!prompt.trim() || disabled}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-gradient-to-b from-violet-500 to-violet-600 text-white hover:from-violet-400 hover:to-violet-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 shadow-lg shadow-violet-900/50"
          >
            {disabled ? <Sparkles size={15} className="animate-pulse" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
