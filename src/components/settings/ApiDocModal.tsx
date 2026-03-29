import React from 'react';
import { Modal } from '../common/Modal';
import { Copy, Terminal, ExternalLink, Info } from 'lucide-react';

interface ApiDocModalProps {
  open: boolean;
  onClose: () => void;
}

export function ApiDocModal({ open, onClose }: ApiDocModalProps) {
  const curlExample = `curl -X POST http://localhost:8081/api/unified \\
  -H "Content-Type: application/json" \\
  -d '{
    "mode": "image_generation",
    "model": "db",
    "prompt": "一只可爱的赛博朋克风格的小猫",
    "aspect_ratio": "1:1"
  }'`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Note: Parent component can handle the toast
  };

  return (
    <Modal open={open} onClose={onClose} title="API 接口文档">
      <div className="flex flex-col gap-6 p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
        {/* Intro */}
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
            <Terminal size={14} className="text-violet-400" />
            快速开始
          </h3>
          <p className="text-[12px] text-white/50 leading-relaxed">
            项目后端 (Express Server) 默认运行在 <code className="text-violet-300">8081</code> 端口。你可以通过标准的 HTTP 请求直接调用生图能力。
          </p>
        </div>

        {/* Curl Example */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">示例请求 (cURL)</span>
            <button 
              onClick={() => copyToClipboard(curlExample)}
              className="flex items-center gap-1.5 text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
            >
              <Copy size={12} />
              复制命令
            </button>
          </div>
          <div className="relative group">
            <pre className="p-4 rounded-xl bg-black/40 border border-white/10 text-[11px] font-mono text-white/80 overflow-x-auto">
              {curlExample}
            </pre>
          </div>
        </div>

        {/* Detailed Docs */}
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-white/90">接口详情</h3>
          
          <div className="flex flex-col gap-3">
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold tracking-wider">POST</span>
                <code className="text-xs text-white/80">/api/unified</code>
              </div>
              <p className="text-[11px] text-white/40 mb-3">统一生图与对话接口</p>
              
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-white/30 uppercase">请求参数</p>
                  <ul className="text-[11px] text-white/60 space-y-1 ml-4 list-disc">
                    <li><code className="text-violet-300">mode</code>: <code className="text-white/40">"image_generation"</code></li>
                    <li><code className="text-violet-300">model</code>: <code className="text-white/40">"doubao-pro-image"</code></li>
                    <li><code className="text-violet-300">prompt</code>: 提示词内容</li>
                    <li><code className="text-violet-300">aspect_ratio</code>: <code className="text-white/40">"1:1", "16:9", "9:16", "4:3", "3:4"</code></li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-bold tracking-wider">GET</span>
                <code className="text-xs text-white/80">/api/health</code>
              </div>
              <p className="text-[11px] text-white/40">检查服务状态与当前注册的模型</p>
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
          <Info size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[10px] text-amber-200/60 leading-normal">
            生图能力依赖于浏览器环境中的豆包扩展，请确保浏览器已打开相关页面并保持连接状态。
          </p>
        </div>
      </div>
    </Modal>
  );
}
