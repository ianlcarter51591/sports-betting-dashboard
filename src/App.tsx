/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Upload, X, LoaderCircle, Zap, Clock, ShieldCheck } from 'lucide-react';

interface ImageItem {
  preview: string;
  file: File;
}

export default function App() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [prompt, setPrompt] = useState(
    `Act as an expert quantitative sports betting analyst. Cross-reference the uploaded DraftKings and Pinnacle screenshots.
STRICT REQUIREMENT: Output ONLY the simplified verdicts for each player prop identified. For each prop, output one of the 4 exact actions (BET, WAIT, PASS, or FADE) followed by a brief 1-2 sentence quantitative synopsis.

Format each selection strictly as:

### [ACTION: BET | WAIT | PASS | FADE] • Player Name — Market & Prop Line
- **DraftKings Line:** [e.g. Over 24.5 Pts (-110)] | **Pinnacle Benchmark:** [e.g. 24.5 (-125 / +105)]
- **Expected Value Edge:** [+X.X% EV / Fair Odds: -114]
- **Synopsis:** [1-2 sentence brief quantitative explanation of why to BET, WAIT, PASS, or FADE].`
  );
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(false);
  const [useSearch, setUseSearch] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [statusStep, setStatusStep] = useState('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      images.forEach((img) => URL.revokeObjectURL(img.preview));
    };
  }, [images]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer?.files) return;
    const files = Array.from(e.dataTransfer.files).filter((f) => {
      const isSupported = ['image/png', 'image/jpeg', 'image/webp'].includes(f.type);
      const isSmallEnough = f.size <= 15 * 1024 * 1024; // 15MB limit
      if (!isSupported || !isSmallEnough) {
        alert(`File ${f.name} is not supported or exceeds 15MB.`);
        return false;
      }
      return true;
    });
    const newImages = files.map((file) => ({
      preview: URL.createObjectURL(file),
      file,
    }));
    setImages((prev) => [...prev, ...newImages]);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files).filter((f) => {
      const isSupported = ['image/png', 'image/jpeg', 'image/webp'].includes(f.type);
      const isSmallEnough = f.size <= 15 * 1024 * 1024;
      return isSupported && isSmallEnough;
    });
    const newImages = files.map((file) => ({
      preview: URL.createObjectURL(file),
      file,
    }));
    setImages((prev) => [...prev, ...newImages]);
  };

  const removeImage = (indexToRemove: number) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[indexToRemove].preview);
      return prev.filter((_, idx) => idx !== indexToRemove);
    });
  };

  const clearAllImages = () => {
    images.forEach((img) => URL.revokeObjectURL(img.preview));
    setImages([]);
  };

  // High-performance image compressor: scales high-res mobile screenshots down to max 1200px
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const MAX_DIM = 1200;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      };
      img.src = objectUrl;
    });
  };

  const handleAnalyze = async () => {
    if (images.length === 0) return;
    setLoading(true);
    setAnalysis('');
    setStatusStep('Optimizing screenshots (downscaling to 1200px)...');
    
    const startTime = Date.now();
    setElapsedMs(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 100);

    try {
      const optimizedImages = await Promise.all(images.map((img) => compressImage(img.file)));
      
      setStatusStep('Connecting to Gemini AI background engine...');

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: optimizedImages,
          prompt,
          useSearch,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'Server error occurred during analysis.');
      }

      setStatusStep('Streaming real-time +EV verdict...');

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Streaming is not supported by your browser.');
      }

      const decoder = new TextDecoder();
      let streamAccumulator = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        streamAccumulator += chunk;
        setAnalysis(streamAccumulator);
      }

      setStatusStep('Analysis complete!');
    } catch (error: any) {
      console.warn('Analysis notice:', error?.message || error);
      setAnalysis(`**Analysis Error:** ${error.message || 'Analysis could not be completed. Please try again.'}`);
      setStatusStep('Failed');
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col bg-gray-50">
      <header className="h-16 border-b bg-white px-6 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="text-xl font-bold text-gray-800">Sports Betting +EV & Line Shopping Dashboard</h1>
        </div>
        <div className="text-xs font-semibold px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          Powered by Gemini AI
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[68%_minmax(0,1fr)] gap-6 p-4 sm:p-8 max-w-7xl mx-auto w-full">
        <section className="space-y-6">
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-gray-300 bg-white p-8 rounded-lg text-center cursor-pointer hover:border-blue-500 block transition-colors"
          >
            <Upload className="mx-auto mb-2 text-gray-500" />
            <p className="text-gray-600 font-medium">Drag and drop images here, or click to browse</p>
            <input type="file" multiple accept="image/png, image/jpeg, image/webp" onChange={handleFileInput} className="hidden" />
          </label>

          {images.length > 0 && (
            <div className="flex flex-wrap gap-4">
              <div className="w-full flex justify-between items-center mb-2">
                <h2 className="text-lg font-semibold text-gray-700">Uploaded Images</h2>
                <button onClick={clearAllImages} className="text-sm text-red-600 hover:text-red-800 font-medium cursor-pointer">Clear All Images</button>
              </div>
              {images.map((img, i) => (
                <div key={i} className="relative group">
                  <img src={img.preview} alt={`upload-${i}`} className="w-28 h-28 object-cover rounded-lg border shadow-sm" />
                  <button onClick={() => removeImage(i)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 shadow cursor-pointer"><X size={14} /></button>
                </div>
              ))}
            </div>
          )}

          <div className="bg-white p-4 rounded-lg border shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Zap className="text-amber-500 size-5" />
              <div>
                <span className="text-sm font-semibold text-gray-800">Turbo Vision Engine</span>
                <p className="text-xs text-gray-500">Auto-downscales screenshots & streams verdicts in real time</p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={useSearch}
                onChange={(e) => setUseSearch(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
              />
              Enable Google Search Grounding (adds ~5-8s)
            </label>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-gray-700">Analysis Prompt & Criteria</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPrompt(`Act as an expert quantitative sports betting analyst. Cross-reference the uploaded DraftKings and Pinnacle screenshots.
STRICT REQUIREMENT: Output ONLY the simplified verdicts for each player prop identified. For each prop, output one of the 4 exact actions (BET, WAIT, PASS, or FADE) followed by a brief 1-2 sentence quantitative synopsis.

Format each selection strictly as:

### [ACTION: BET | WAIT | PASS | FADE] • Player Name — Market & Prop Line
- **DraftKings Line:** [e.g. Over 24.5 Pts (-110)] | **Pinnacle Benchmark:** [e.g. 24.5 (-125 / +105)]
- **Expected Value Edge:** [+X.X% EV / Fair Odds: -114]
- **Synopsis:** [1-2 sentence brief quantitative explanation of why to BET, WAIT, PASS, or FADE].`
)}
                className="text-xs px-2.5 py-1 rounded bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 font-semibold cursor-pointer"
              >
                🎯 Simplified
              </button>
              <button
                type="button"
                onClick={() => setPrompt(`Act as an expert sports betting quantitative analyst specializing in +EV line shopping.
Target: Analyze these DraftKings vs Pinnacle sportsbook screenshots.
Output directly in Markdown:
1. ## Line Shopping & +EV Comparison Table (Player, DK Odds, Pin Fair Odds, EV %, Assessment)
2. ## Monte Carlo Variance & Staking Analysis (Quarter-Kelly % & Drawdown Risk)
3. ## Final Actionable Verdicts (Top +EV Bets on DK & Overpriced Traps)`)}
                className="text-xs px-2.5 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium cursor-pointer"
              >
                📊 Detailed Table
              </button>
            </div>
          </div>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full p-4 border rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-blue-500 outline-none text-sm text-gray-800"
            rows={7}
          />
          
          <div className="flex items-center justify-between gap-4">
            <button
              onClick={handleAnalyze}
              disabled={loading || images.length === 0}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-300 flex items-center gap-2 shadow transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <LoaderCircle className="animate-spin size-4" />
                  Streaming Verdict...
                </>
              ) : (
                <>
                  <Zap className="size-4" />
                  Run Instant Verdict Analysis
                </>
              )}
            </button>

            {loading && (
              <div className="flex items-center gap-3 text-xs text-blue-700 bg-blue-50 px-3.5 py-2 rounded-lg border border-blue-200 animate-pulse">
                <Clock className="size-4 text-blue-600" />
                <span className="font-semibold">{(elapsedMs / 1000).toFixed(1)}s</span>
                <span>•</span>
                <span>{statusStep}</span>
              </div>
            )}
          </div>
        </section>

        <aside className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 h-full overflow-y-auto min-h-[520px] flex flex-col">
          <div className="flex items-center justify-between mb-4 border-b pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-emerald-600 size-5" />
              <h2 className="text-lg font-bold text-gray-900 tracking-tight">Analysis Verdict</h2>
            </div>
            {analysis && (
              <button
                onClick={() => setAnalysis('')}
                className="text-xs text-gray-500 hover:text-red-600 font-medium transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Action Badge Legend */}
          <div className="grid grid-cols-4 gap-1.5 mb-4 p-2 bg-gray-50 rounded-lg border border-gray-100 text-center text-[11px] font-semibold">
            <div className="bg-emerald-100 text-emerald-800 border border-emerald-300 py-1 rounded">
              BET
            </div>
            <div className="bg-amber-100 text-amber-800 border border-amber-300 py-1 rounded">
              WAIT
            </div>
            <div className="bg-slate-200 text-slate-800 border border-slate-300 py-1 rounded">
              PASS
            </div>
            <div className="bg-rose-100 text-rose-800 border border-rose-300 py-1 rounded">
              FADE
            </div>
          </div>

          {analysis ? (
            <div className="prose max-w-none text-sm space-y-4">
              <ReactMarkdown
                components={{
                  h3({ children }) {
                    const text = String(children);
                    let badgeClass = 'bg-gray-100 text-gray-800 border-gray-300';
                    if (text.includes('BET')) {
                      badgeClass = 'bg-emerald-50 text-emerald-900 border-emerald-400 shadow-sm';
                    } else if (text.includes('WAIT')) {
                      badgeClass = 'bg-amber-50 text-amber-900 border-amber-400 shadow-sm';
                    } else if (text.includes('PASS')) {
                      badgeClass = 'bg-slate-100 text-slate-800 border-slate-300';
                    } else if (text.includes('FADE')) {
                      badgeClass = 'bg-rose-50 text-rose-900 border-rose-400 shadow-sm';
                    }
                    return (
                      <div className={`p-3 rounded-lg border font-bold text-base mt-4 mb-2 ${badgeClass}`}>
                        {children}
                      </div>
                    );
                  },
                  ul({ children }) {
                    return <ul className="space-y-1.5 my-2 pl-2 text-gray-700">{children}</ul>;
                  },
                  li({ children }) {
                    return <li className="text-sm leading-relaxed">{children}</li>;
                  },
                  strong({ children }) {
                    return <strong className="font-semibold text-gray-900">{children}</strong>;
                  }
                }}
              >
                {analysis}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-400 py-12">
              <Zap className="size-10 mb-3 stroke-1 text-gray-300" />
              <p className="text-sm font-semibold text-gray-600">Upload Screenshots to Get Verdicts</p>
              <p className="text-xs mt-1 text-gray-400 max-w-xs">
                DraftKings vs Pinnacle odds are cross-referenced to output immediate <strong>BET</strong>, <strong>WAIT</strong>, <strong>PASS</strong>, or <strong>FADE</strong> verdicts.
              </p>
            </div>
          )}
        </aside>
      </main>

      <footer className="border-t p-6 bg-white text-center text-gray-500 text-sm">
        &copy; 2026 Sports Betting Analytics Dashboard
      </footer>
    </div>
  );
}
