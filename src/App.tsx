import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Play, 
  RotateCcw, 
  Download, 
  Loader2, 
  Video, 
  AlertCircle,
  Zap,
  LayoutGrid
} from "lucide-react";

type SlotStatus = "idle" | "starting" | "generating" | "completed" | "error";

interface Slot {
  id: number;
  prompt: string;
  status: SlotStatus;
  operationName: string | null;
  error: string | null;
  videoUrl: string | null;
}

const INITIAL_SLOTS: Slot[] = [
  { id: 1, prompt: "", status: "idle", operationName: null, error: null, videoUrl: null },
  { id: 2, prompt: "", status: "idle", operationName: null, error: null, videoUrl: null },
  { id: 3, prompt: "", status: "idle", operationName: null, error: null, videoUrl: null },
  { id: 4, prompt: "", status: "idle", operationName: null, error: null, videoUrl: null },
];

export default function App() {
  const [slots, setSlots] = useState<Slot[]>(INITIAL_SLOTS);
  const [globalResolution, setGlobalResolution] = useState("720p");
  const [globalAspectRatio, setGlobalAspectRatio] = useState("16:9");
  
  const pollIntervals = useRef<{ [key: number]: number | NodeJS.Timeout }>({});

  const updateSlot = (id: number, updates: Partial<Slot>) => {
    setSlots(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const startGeneration = async (id: number) => {
    const slot = slots.find(s => s.id === id);
    if (!slot || !slot.prompt.trim()) return;

    updateSlot(id, { status: "starting", error: null, videoUrl: null, operationName: null });

    try {
      const res = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt: slot.prompt,
          resolution: globalResolution,
          aspectRatio: globalAspectRatio
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start generation");

      updateSlot(id, { status: "generating", operationName: data.operationName });
      startPolling(id, data.operationName);
    } catch (err: any) {
      updateSlot(id, { status: "error", error: err.message });
    }
  };

  const startPolling = (id: number, operationName: string) => {
    // Clear any existing poll
    if (pollIntervals.current[id]) clearInterval(pollIntervals.current[id]);

    pollIntervals.current[id] = setInterval(async () => {
      try {
        const res = await fetch("/api/video-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operationName }),
        });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error || "Status check failed");

        if (data.done) {
          clearInterval(pollIntervals.current[id]);
          updateSlot(id, { status: "completed" });
          // Note: videoUrl is set to operationName so we can download it later
        }
      } catch (err: any) {
        clearInterval(pollIntervals.current[id]);
        updateSlot(id, { status: "error", error: err.message });
      }
    }, 5000); // Poll every 5 seconds
  };

  const downloadVideo = async (id: number) => {
    const slot = slots.find(s => s.id === id);
    if (!slot || !slot.operationName) return;

    try {
      const res = await fetch("/api/video-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationName: slot.operationName }),
      });

      if (!res.ok) throw new Error("Download failed");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `veo-video-${id}-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert("Download failed: " + err.message);
    }
  };

  const resetSlot = (id: number) => {
    if (pollIntervals.current[id]) clearInterval(pollIntervals.current[id]);
    updateSlot(id, { status: "idle", error: null, videoUrl: null, operationName: null });
  };

  const generateAll = () => {
    slots.forEach(s => {
      if (s.prompt.trim() && s.status === "idle") {
        startGeneration(s.id);
      }
    });
  };

  useEffect(() => {
    return () => {
      // Cleanup all polling on unmount
      Object.values(pollIntervals.current).forEach(clearInterval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#fafafa] text-[#1a1a1a] p-4 md:p-8 font-sans">
      <header className="max-w-6xl mx-auto mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2 text-[#F27D26]">
            <Zap className="w-5 h-5 fill-current" />
            <span className="text-xs font-bold uppercase tracking-widest">Sử dụng Veo3-Fast</span>
          </div>
          <h1 className="text-5xl font-medium tracking-tight leading-tight">
            Tạo Video <br />
            <span className="text-[#888]">Không gian làm việc song song</span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-white p-2 rounded-2xl shadow-sm border border-gray-100">
           <div className="flex flex-col px-3 border-r border-gray-100">
            <span className="text-[10px] uppercase font-bold text-gray-400 mb-1">Độ phân giải</span>
            <select 
              value={globalResolution} 
              onChange={(e) => setGlobalResolution(e.target.value)}
              className="bg-transparent text-sm font-medium outline-hidden cursor-pointer"
            >
              <option value="720p">720p (Nhanh)</option>
              <option value="1080p">1080p (HD)</option>
            </select>
          </div>
          <div className="flex flex-col px-3 border-r border-gray-100">
            <span className="text-[10px] uppercase font-bold text-gray-400 mb-1">Tỷ lệ khung hình</span>
            <select 
              value={globalAspectRatio} 
              onChange={(e) => setGlobalAspectRatio(e.target.value)}
              className="bg-transparent text-sm font-medium outline-hidden cursor-pointer"
            >
              <option value="16:9">16:9 Nằm ngang</option>
              <option value="9:16">9:16 Nằm dọc</option>
            </select>
          </div>
          <button 
            onClick={generateAll}
            className="bg-[#1a1a1a] text-white px-6 py-3 rounded-xl font-medium text-sm hover:bg-[#333] transition-colors flex items-center gap-2"
          >
            <Play className="w-4 h-4 fill-current" />
            Tạo tất cả
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        {slots.map((slot) => (
          <motion.div 
            key={slot.id}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: slot.id * 0.1 }}
            className="group relative bg-white rounded-3xl p-6 shadow-sm border border-gray-100 hover:border-[#F27D26]/30 transition-all duration-500 overflow-hidden"
          >
            {/* Status Background Overlay */}
            <AnimatePresence>
              {slot.status === "generating" && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.05 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-[#F27D26] pointer-events-none"
                />
              )}
            </AnimatePresence>

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  slot.status === "completed" ? "bg-green-50 text-green-600" : 
                  slot.status === "error" ? "bg-red-50 text-red-600" :
                  slot.status === "idle" ? "bg-gray-50 text-gray-400" : "bg-[#F27D26]/10 text-[#F27D26]"
                }`}>
                  {slot.status === "completed" ? <Video className="w-5 h-5" /> : 
                   slot.status === "error" ? <AlertCircle className="w-5 h-5" /> : 
                   <LayoutGrid className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-tighter">Luồng 0{slot.id}</h3>
                  <p className="text-xs font-medium capitalize text-gray-400">{slot.status === 'idle' ? 'Chế độ chờ' : slot.status === 'starting' ? 'Đang khởi tạo' : slot.status === 'generating' ? 'Đang xử lý' : slot.status === 'completed' ? 'Hoàn thành' : 'Lỗi'}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {slot.status !== "idle" && (
                  <button 
                    onClick={() => resetSlot(slot.id)}
                    className="p-2 text-gray-300 hover:text-gray-500 rounded-lg transition-colors"
                    title="Đặt lại"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="relative">
              <textarea
                value={slot.prompt}
                onChange={(e) => updateSlot(slot.id, { prompt: e.target.value })}
                placeholder="Nhập mô tả cho video của bạn..."
                disabled={slot.status !== "idle" && slot.status !== "error"}
                className="w-full h-32 bg-gray-50 rounded-2xl p-4 text-sm md:text-base border-none focus:ring-2 focus:ring-[#F27D26]/20 resize-none transition-all placeholder:text-gray-300"
              />
              
              <AnimatePresence>
                {slot.status !== "idle" && slot.status !== "error" && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-gray-50/80 backdrop-blur-[2px] rounded-2xl flex flex-col items-center justify-center gap-4 text-center p-4"
                  >
                    {slot.status === "completed" ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 bg-green-500 text-white rounded-full flex items-center justify-center">
                          <Video className="w-6 h-6" />
                        </div>
                        <p className="text-sm font-bold text-gray-700">Video đã sẵn sàng!</p>
                        <button 
                          onClick={() => downloadVideo(slot.id)}
                          className="bg-black text-white px-6 py-2 rounded-xl text-sm font-medium hover:bg-neutral-800 transition-colors flex items-center gap-2"
                        >
                          <Download className="w-4 h-4" />
                          Lưu về máy
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <div className="relative">
                          <Loader2 className="w-10 h-10 text-[#F27D26] animate-spin" />
                          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[#F27D26]">
                            AI
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-700">
                            {slot.status === "starting" ? "Đang khởi tạo..." : "Đang vẽ khung hình..."}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest font-bold">Dự kiến 1-3 phút</p>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {slot.error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-600 font-medium leading-relaxed">{slot.error}</p>
              </div>
            )}

            <div className="mt-6 flex items-center justify-end">
              {slot.status === "idle" && (
                <button
                  onClick={() => startGeneration(slot.id)}
                  disabled={!slot.prompt.trim()}
                  className="bg-[#1a1a1a] text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-[#333] disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                >
                  Tạo Video
                </button>
              )}
            </div>
            
            {/* Thread indicator */}
            <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
               <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    slot.status === "generating" ? "bg-orange-500 animate-pulse" : 
                    slot.status === "completed" ? "bg-green-500" : "bg-gray-200"
                  }`} />
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Luồng xử lý 0x{slot.id}</span>
               </div>
            </div>
          </motion.div>
        ))}
      </main>

      <footer className="max-w-6xl mx-auto mt-20 mb-10 text-center">
        <p className="text-xs font-bold text-gray-300 uppercase tracking-[0.2em]">
          Veo3-Fast / Generative Video Engine / Standard-05
        </p>
      </footer>
    </div>
  );
}
