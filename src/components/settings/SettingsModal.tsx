import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Globe, Info, Folder, Terminal, Copy, ExternalLink, Bug, CheckCircle, XCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useSettingsStore } from '../../store/settingsStore';
import { ApiDocModal } from './ApiDocModal';
import { Toast } from '../common/Toast';
import type { AppSettings } from '../../types';

interface ServerStatus {
  db_init: boolean;
  db_path: string;
  server_thread_started: boolean;
  server_listening: boolean;
  port: number;
  error_message: string | null;
}

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { settings, updateSettings } = useSettingsStore();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [showDoc, setShowDoc] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [serverStatus, setServerStatus] = useState<ServerStatus>({
    db_init: false,
    db_path: '',
    server_thread_started: false,
    server_listening: false,
    port: 8081,
    error_message: null,
  });

  // Load server status when modal opens
  useEffect(() => {
    if (open) {
      invoke<ServerStatus>('get_server_status')
        .then(setServerStatus)
        .catch(console.error);
    }
  }, [open]);

  const curlExample = `curl -X POST http://localhost:8081/api/unified -H "Content-Type: application/json" -d '{"mode":"image_generation","model":"db","prompt":"a cute cat"}'`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(curlExample);
    setShowToast(true);
  };

  // Sync draft when settings change
  React.useEffect(() => {
    if (open) setDraft(settings);
  }, [settings, open]);

  const handleSave = () => {
    updateSettings(draft);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="设置">
      <div className="flex flex-col gap-6 p-6">
        {/* Worker section */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Globe size={13} className="text-violet-400" />
            <span className="text-xs font-semibold text-white/50 uppercase tracking-widest">Worker 连接</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-white/45">WebSocket 地址</label>
            <input
              type="text"
              value={draft.websocketUrl}
              onChange={(e) => setDraft((d) => ({ ...d, websocketUrl: e.target.value }))}
              placeholder="ws://localhost:8081/ws"
              className="h-10 px-4 text-sm rounded-lg border border-white/[0.08] bg-white/[0.04] text-white/80 outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/15 transition-all placeholder-white/20 font-mono"
            />
            <div className="flex items-start gap-1.5 mt-0.5">
              <Info size={11} className="text-white/20 mt-0.5 shrink-0" />
              <p className="text-[11px] text-white/20 leading-relaxed">
                本地 Express Worker 的 WebSocket 地址，默认端口 8081。确保豆包扩展已在浏览器中运行。
              </p>
            </div>
          </div>
        </div>

        {/* Diagnostics section */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Bug size={13} className="text-violet-400" />
            <span className="text-xs font-semibold text-white/50 uppercase tracking-widest">诊断信息</span>
            <button
              onClick={async () => {
                try {
                  const status = await invoke<ServerStatus>('get_server_status');
                  setServerStatus(status);
                } catch (e) {
                  console.error('Failed to get server status:', e);
                }
              }}
              className="ml-auto text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
            >
              刷新
            </button>
          </div>
          <div className="flex flex-col gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[11px] font-mono">
            <div className="flex items-center gap-2">
              {serverStatus.db_init ? (
                <CheckCircle size={12} className="text-green-400" />
              ) : (
                <XCircle size={12} className="text-red-400" />
              )}
              <span className="text-white/60">数据库初始化:</span>
              <span className={serverStatus.db_init ? 'text-green-400' : 'text-red-400'}>
                {serverStatus.db_init ? '成功' : '失败'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {serverStatus.server_thread_started ? (
                <CheckCircle size={12} className="text-green-400" />
              ) : (
                <XCircle size={12} className="text-red-400" />
              )}
              <span className="text-white/60">服务器线程:</span>
              <span className={serverStatus.server_thread_started ? 'text-green-400' : 'text-red-400'}>
                {serverStatus.server_thread_started ? '已启动' : '未启动'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {serverStatus.server_listening ? (
                <CheckCircle size={12} className="text-green-400" />
              ) : (
                <XCircle size={12} className="text-red-400" />
              )}
              <span className="text-white/60">服务器监听:</span>
              <span className={serverStatus.server_listening ? 'text-green-400' : 'text-red-400'}>
                {serverStatus.server_listening ? '正在监听 8081' : '未监听'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white/60">端口:</span>
              <span className="text-white/80">{serverStatus.port}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white/60">数据库路径:</span>
              <span className="text-white/80 truncate" title={serverStatus.db_path}>
                {serverStatus.db_path.split(/[/\\]/).slice(-2).join('/')}
              </span>
            </div>
            {serverStatus.error_message && (
              <div className="flex flex-col gap-1 p-2 rounded bg-red-500/10 border border-red-500/20">
                <div className="flex items-center gap-2">
                  <XCircle size={12} className="text-red-400" />
                  <span className="text-red-400">错误:</span>
                </div>
                <span className="text-red-300 text-[10px]">{serverStatus.error_message}</span>
              </div>
            )}
            {!serverStatus.server_listening && (
              <button
                onClick={async () => {
                  try {
                    const result = await invoke<string>('start_server_manual', { port: serverStatus.port });
                    console.log('Server start result:', result);
                    // Refresh status after starting
                    const status = await invoke<ServerStatus>('get_server_status');
                    setServerStatus(status);
                  } catch (e) {
                    console.error('Failed to start server:', e);
                    alert('启动服务器失败: ' + e);
                  }
                }}
                className="mt-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[12px] font-medium transition-colors"
              >
                启动服务器
              </button>
            )}
          </div>
        </div>

        {/* Download Path section */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Folder size={13} className="text-violet-400" />
            <span className="text-xs font-semibold text-white/50 uppercase tracking-widest">下载路径</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-white/45">导出保存目录</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={draft.saveDir}
                onChange={(e) => setDraft((d) => ({ ...d, saveDir: e.target.value }))}
                placeholder="默认使用系统下载目录"
                className="flex-1 h-10 px-4 text-sm rounded-lg border border-white/[0.08] bg-white/[0.04] text-white/80 outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/15 transition-all placeholder-white/20"
              />
              <Button 
                variant="secondary" 
                size="md" 
                onClick={async () => {
                  try {
                    const selected = await openDialog({
                      directory: true,
                      multiple: false,
                      title: '选择生成图片下载目录'
                    });
                    if (selected && typeof selected === 'string') {
                      setDraft(d => ({ ...d, saveDir: selected }));
                    }
                  } catch (err) {
                    console.error('Failed to open directory picker:', err);
                  }
                }}
                className="shrink-0"
              >
                浏览...
              </Button>
            </div>
            <p className="text-[11px] text-white/20 mt-0.5">
              点击卡片上的“下载”按钮时，图片会保存到此目录。
            </p>
          </div>
        </div>

        {/* History Path section */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Folder size={13} className="text-violet-400" />
            <span className="text-xs font-semibold text-white/50 uppercase tracking-widest">历史记录存储</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-white/45">历史图片存储目录</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={draft.historyDir}
                onChange={(e) => setDraft((d) => ({ ...d, historyDir: e.target.value }))}
                placeholder="默认使用应用数据目录"
                className="flex-1 h-10 px-4 text-sm rounded-lg border border-white/[0.08] bg-white/[0.04] text-white/80 outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/15 transition-all placeholder-white/20"
              />
              <Button 
                variant="secondary" 
                size="md" 
                onClick={async () => {
                  try {
                    const selected = await openDialog({
                      directory: true,
                      multiple: false,
                      title: '选择历史图片存储目录'
                    });
                    if (selected && typeof selected === 'string') {
                      setDraft(d => ({ ...d, historyDir: selected }));
                    }
                  } catch (err) {
                    console.error('Failed to open directory picker:', err);
                  }
                }}
                className="shrink-0"
              >
                浏览...
              </Button>
            </div>
            <p className="text-[11px] text-white/20 mt-0.5">
              生成的图片将自动保存到此目录作为历史记录。留空则使用应用内部目录。
            </p>
          </div>
        </div>

        {/* API section */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Terminal size={13} className="text-violet-400" />
            <span className="text-xs font-semibold text-white/50 uppercase tracking-widest">API 接口</span>
          </div>
          <div className="flex flex-col gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-white/40">快速调用示例 (cURL)</span>
                <button 
                  onClick={copyToClipboard}
                  className="flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                >
                  <Copy size={12} />
                  复制
                </button>
              </div>
              <div className="p-2.5 rounded-lg bg-black/20 border border-white/[0.05] text-[10px] font-mono text-white/60 truncate">
                {curlExample}
              </div>
            </div>
            <div className="flex justify-between items-center">
              <p className="text-[11px] text-white/30">
                支持外界程序直接发送生图指令。
              </p>
              <button 
                onClick={() => setShowDoc(true)}
                className="flex items-center gap-1.5 text-[11px] font-medium text-white/60 hover:text-white transition-colors"
              >
                查看完整文档
                <ExternalLink size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* About section */}
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 flex flex-col gap-1">
          <p className="text-xs font-semibold text-white/40">豆包生图助手</p>
          <p className="text-[11px] text-white/20 leading-relaxed">
            通过本地 Chrome 扩展与豆包 Web 端通信，自动提交提示词并获取生成图片。
          </p>
        </div>

        {showDoc && <ApiDocModal open={showDoc} onClose={() => setShowDoc(false)} />}
        {showToast && <Toast message="已复制 cURL 示例" onClose={() => setShowToast(false)} />}

        <div className="flex justify-end pt-1.5 border-t border-white/[0.06]" style={{ gap: '12px' }}>
          <Button variant="secondary" size="md" onClick={onClose}>取消</Button>
          <Button variant="primary" size="md" onClick={handleSave}>保存设置</Button>
        </div>
      </div>
    </Modal>
  );
}
