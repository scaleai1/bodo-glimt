import React, { useCallback, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

export interface UploadedFile {
  name: string;
  size: number;
  type: string;
  content: string; // raw text or JSON-stringified parsed data
}

interface FileUploaderProps {
  onFileLoaded: (file: UploadedFile) => void;
  isCollapsed?: boolean;
  onInsightsClick?: () => void;
  hasReport?: boolean;
}

type UploadState = 'idle' | 'dragover' | 'processing' | 'done' | 'error';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Football spinner SVG
const FootballSpinner: React.FC = () => (
  <svg
    className="animate-spin"
    width="48"
    height="48"
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="24" cy="24" r="20" stroke="#2A2A2A" strokeWidth="3" />
    <circle cx="24" cy="24" r="20" stroke="#FFE500" strokeWidth="3"
      strokeDasharray="30 100" strokeLinecap="round" />
    {/* Pentagon pattern */}
    <circle cx="24" cy="24" r="5" fill="#FFE500" />
    <circle cx="24" cy="10" r="3" fill="#FFE500" opacity="0.6" />
    <circle cx="36" cy="17" r="3" fill="#FFE500" opacity="0.6" />
    <circle cx="32" cy="32" r="3" fill="#FFE500" opacity="0.6" />
    <circle cx="16" cy="32" r="3" fill="#FFE500" opacity="0.6" />
    <circle cx="12" cy="17" r="3" fill="#FFE500" opacity="0.6" />
  </svg>
);

export const FileUploader: React.FC<FileUploaderProps> = ({ onFileLoaded, isCollapsed }) => {
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [lastFile, setLastFile] = useState<{ name: string; size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    const extOk = /\.(csv|xlsx|xls|json|txt)$/i.test(file.name);

    if (!extOk) {
      setError('Unsupported file type. Use CSV, XLSX, or JSON.');
      setUploadState('error');
      return;
    }

    setUploadState('processing');
    setLastFile({ name: file.name, size: file.size });
    setError(null);

    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    const reader = new FileReader();

    reader.onload = (e) => {
      setTimeout(() => {
        try {
          let content: string;
          if (isExcel) {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            content = XLSX.utils.sheet_to_csv(sheet);
          } else {
            content = e.target?.result as string;
          }
          onFileLoaded({ name: file.name, size: file.size, type: file.type, content });
          setUploadState('done');
        } catch {
          setError('Failed to parse file.');
          setUploadState('error');
        }
      }, 1800);
    };

    reader.onerror = () => {
      setError('Failed to read file.');
      setUploadState('error');
    };

    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  }, [onFileLoaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setUploadState('idle');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setUploadState('dragover');
  };

  const handleDragLeave = () => {
    if (uploadState === 'dragover') setUploadState('idle');
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const reset = () => {
    setUploadState('idle');
    setLastFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  if (isCollapsed) {
    return (
      <button
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-2 px-3 py-1.5 bg-card-dark border border-border-dark hover:border-electric-yellow rounded-lg text-xs text-text-secondary hover:text-electric-yellow transition-all"
      >
        <span>📁</span>
        <span className="font-bold uppercase tracking-wider">Upload Data</span>
        <input ref={inputRef} type="file" className="hidden" accept=".csv,.xlsx,.xls,.json"
          onChange={handleFileInput} />
      </button>
    );
  }

  return (
    <div className="bg-card-dark border border-border-dark rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">📊</span>
          <div>
            <h3 className="text-white font-display font-bold uppercase tracking-widest text-xs">
              Data Ingestion Hub
            </h3>
            <p className="text-text-secondary text-[10px] mt-0.5">CSV · XLSX · JSON</p>
          </div>
        </div>
        {uploadState === 'done' && (
          <button onClick={reset}
            className="text-[10px] text-text-secondary hover:text-electric-yellow uppercase tracking-wider font-bold transition-colors">
            ↺ Reset
          </button>
        )}
      </div>

      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => uploadState === 'idle' && inputRef.current?.click()}
        className={`
          relative rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer
          flex flex-col items-center justify-center gap-3 p-8 text-center
          ${uploadState === 'dragover'
            ? 'border-electric-yellow bg-electric-yellow/5 shadow-yellow-glow scale-[1.01]'
            : uploadState === 'processing'
            ? 'border-electric-yellow/40 bg-pitch-dark cursor-not-allowed'
            : uploadState === 'done'
            ? 'border-success-green bg-success-green/5 cursor-default'
            : uploadState === 'error'
            ? 'border-danger-red bg-danger-red/5'
            : 'border-border-dark bg-pitch-dark hover:border-electric-yellow/60 hover:bg-electric-yellow/5'}
        `}
        style={{ minHeight: '160px' }}
      >
        {/* IDLE */}
        {uploadState === 'idle' && (
          <>
            <div className="text-4xl">⬆️</div>
            <div>
              <p className="text-white font-bold text-sm uppercase tracking-wider">
                Drop File Here
              </p>
              <p className="text-text-secondary text-xs mt-1">
                or click to browse — CSV, XLSX, JSON
              </p>
            </div>
            <div className="flex gap-2 mt-1">
              {['CSV', 'XLSX', 'JSON'].map((ext) => (
                <span key={ext} className="text-[10px] font-mono border border-border-dark text-text-secondary px-2 py-0.5 rounded">
                  .{ext}
                </span>
              ))}
            </div>
          </>
        )}

        {/* DRAGOVER */}
        {uploadState === 'dragover' && (
          <>
            <div className="text-5xl animate-bounce">📂</div>
            <p className="text-electric-yellow font-display font-black uppercase tracking-widest text-sm">
              Release to Upload
            </p>
          </>
        )}

        {/* PROCESSING */}
        {uploadState === 'processing' && (
          <>
            <FootballSpinner />
            <div>
              <p className="text-electric-yellow font-display font-black uppercase tracking-widest text-sm">
                Processing Data...
              </p>
              <p className="text-text-secondary text-xs mt-1 truncate max-w-[200px]">
                {lastFile?.name}
              </p>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-border-dark rounded-full h-1 overflow-hidden">
              <div className="h-full bg-electric-yellow rounded-full animate-[progress_1.8s_ease-in-out_forwards]"
                style={{ width: '0%', animation: 'progress 1.8s ease-in-out forwards' }} />
            </div>
          </>
        )}

        {/* DONE */}
        {uploadState === 'done' && (
          <>
            <div className="text-4xl">✅</div>
            <div>
              <p className="text-success-green font-display font-black uppercase tracking-widest text-sm">
                Data Loaded
              </p>
              <p className="text-white font-bold text-xs mt-1 truncate max-w-[220px]">
                {lastFile?.name}
              </p>
              <p className="text-text-secondary text-[10px] mt-0.5">
                {lastFile ? formatBytes(lastFile.size) : ''} — Ready for analysis
              </p>
            </div>
            <div className="flex items-center gap-1 px-3 py-1 bg-success-green/10 border border-success-green/30 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-success-green" />
              <span className="text-success-green text-[10px] font-bold uppercase tracking-wider">
                Ask the AI Coach about this file
              </span>
            </div>
          </>
        )}

        {/* ERROR */}
        {uploadState === 'error' && (
          <>
            <div className="text-4xl">⚠️</div>
            <div>
              <p className="text-danger-red font-bold text-sm uppercase tracking-wider">
                Upload Failed
              </p>
              <p className="text-text-secondary text-xs mt-1">{error}</p>
            </div>
            <button onClick={(e) => { e.stopPropagation(); reset(); }}
              className="px-3 py-1.5 bg-danger-red/10 border border-danger-red/40 text-danger-red text-xs font-bold rounded-lg hover:bg-danger-red/20 transition-colors">
              Try Again
            </button>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".csv,.xlsx,.xls,.json,.txt"
        onChange={handleFileInput}
      />

      {/* Progress keyframe injection */}
      <style>{`
        @keyframes progress {
          0%   { width: 0%; }
          60%  { width: 75%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
};

export default FileUploader;
