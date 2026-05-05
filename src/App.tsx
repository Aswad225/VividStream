/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Video, 
  Image as ImageIcon, 
  Send, 
  History, 
  Settings, 
  Download, 
  Play, 
  AlertCircle, 
  Loader2, 
  Type, 
  Monitor, 
  Maximize2,
  Plus,
  Trash2,
  Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GenerationStatus, VideoGenerationItem, AspectRatio, Resolution } from './types.ts';

// Add global window declarations for AI Studio methods
declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function App() {
  const [items, setItems] = useState<VideoGenerationItem[]>([]);
  const [prompt, setPrompt] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [resolution, setResolution] = useState<Resolution>('720p');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'generate' | 'gallery'>('generate');
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [hostType, setHostType] = useState<'cloud' | 'local'>('cloud');
  const [localEndpoint, setLocalEndpoint] = useState('http://127.0.0.1:5000/generate');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    checkApiKey();
    const saved = localStorage.getItem('vivid_history');
    if (saved) setItems(JSON.parse(saved));
    const savedHost = localStorage.getItem('vivid_host');
    if (savedHost) setHostType(savedHost as 'cloud' | 'local');
    const savedEndpoint = localStorage.getItem('vivid_endpoint');
    if (savedEndpoint) setLocalEndpoint(savedEndpoint);
  }, []);

  useEffect(() => {
    localStorage.setItem('vivid_history', JSON.stringify(items));
    localStorage.setItem('vivid_host', hostType);
    localStorage.setItem('vivid_endpoint', localEndpoint);
  }, [items, hostType, localEndpoint]);

  async function checkApiKey() {
    try {
      const selected = await window.aistudio.hasSelectedApiKey();
      setHasApiKey(selected);
    } catch (e) {
      setHasApiKey(false);
    }
  }

  async function handleOpenKeyDialog() {
    await window.aistudio.openSelectKey();
    await checkApiKey();
  }

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const generateVideo = async () => {
    if (!prompt && !selectedImage) {
      setError("Please provide a prompt or an image.");
      return;
    }

    if (hostType === 'cloud' && !hasApiKey) {
      await handleOpenKeyDialog();
      return;
    }

    setIsGenerating(true);
    setError(null);

    const newItem: VideoGenerationItem = {
      id: Date.now().toString(),
      prompt: prompt || (selectedImage ? "Image-to-Video generation" : "Untitled Video"),
      status: GenerationStatus.INITIALIZING,
      createdAt: Date.now(),
      previewUrl: selectedImage || undefined
    };

    setItems(prev => [newItem, ...prev]);
    setActiveTab('gallery');

    try {
      if (hostType === 'cloud') {
        const apiKey = process.env.GEMINI_API_KEY || "";
        const ai = new GoogleGenAI({ apiKey });
        const modelName = 'veo-3.1-lite-generate-preview';
        
        const payload: any = {
          model: modelName,
          prompt: prompt || undefined,
          config: { numberOfVideos: 1, resolution, aspectRatio }
        };

        if (selectedImage) {
          payload.image = {
            imageBytes: selectedImage.split(',')[1],
            mimeType: selectedImage.split(';')[0].split(':')[1],
          };
        }

        setItems(prev => prev.map(item => 
          item.id === newItem.id ? { ...item, status: GenerationStatus.POLLING } : item
        ));

        let operation = await ai.models.generateVideos(payload);
        while (!operation.done) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          operation = await ai.operations.getVideosOperation({ operation });
        }

        const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!uri) throw new Error("No video URI returned.");

        const videoResponse = await fetch(uri, { headers: { 'x-goog-api-key': apiKey } });
        if (!videoResponse.ok) throw new Error(`Failed to fetch video: ${videoResponse.statusText}`);

        const blob = await videoResponse.blob();
        const videoUrl = URL.createObjectURL(blob);

        setItems(prev => prev.map(item => 
          item.id === newItem.id ? { ...item, status: GenerationStatus.SUCCESS, videoUrl } : item
        ));
      } else {
        // LOCAL PC HOST LOGIC (FastAPI Compatible)
        setItems(prev => prev.map(item => 
          item.id === newItem.id ? { ...item, status: GenerationStatus.POLLING } : item
        ));

        const formData = new FormData();
        formData.append('prompt', prompt);
        
        if (selectedImage) {
          // Convert DataURL to Blob for the FastAPI File upload
          const res = await fetch(selectedImage);
          const blob = await res.blob();
          formData.append('image', blob, 'source_image.png');
        }

        const response = await fetch(localEndpoint, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Local host error: ${response.status}. Ensure your PC server is running and CORS is enabled.`);
        }

        const blob = await response.blob();
        const videoUrl = URL.createObjectURL(blob);

        setItems(prev => prev.map(item => 
          item.id === newItem.id ? { ...item, status: GenerationStatus.SUCCESS, videoUrl } : item
        ));
      }

    } catch (err: any) {
      const errorMessage = err.message || "Operation failed.";
      setError(errorMessage);
      setItems(prev => prev.map(item => 
        item.id === newItem.id ? { ...item, status: GenerationStatus.ERROR, error: errorMessage } : item
      ));
    } finally {
      setIsGenerating(false);
      setPrompt('');
      setSelectedImage(null);
    }
  };

  const removeHistoryItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-orange-500/30">
      {/* Top Banner / Key Warning */}
      {!hasApiKey && hasApiKey !== null && (
        <div className="bg-orange-600/20 border-b border-orange-500/30 px-4 py-2 flex items-center justify-between text-xs sm:text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-orange-500" />
            <span>AI Video requires a paid Gemini API key. <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="underline hover:text-orange-400">View billing docs</a>.</span>
          </div>
          <button 
            onClick={handleOpenKeyDialog}
            className="flex items-center gap-1 bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 rounded-full transition-colors font-medium"
          >
            <Key className="w-3 h-3" />
            Select Key
          </button>
        </div>
      )}

      {/* Main Layout */}
      <div className="flex flex-col h-screen overflow-hidden">
        {/* Navigation */}
        <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between bg-[#050505] z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-tr from-orange-500 to-red-600 rounded-lg flex items-center justify-center shadow-lg shadow-orange-600/20">
              <Video className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
              VividStream <span className="text-orange-500 font-mono text-sm tracking-tighter ml-1">v3.1</span>
            </h1>
          </div>
          
          <nav className="flex items-center gap-1 bg-white/5 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab('generate')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm ${activeTab === 'generate' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
            >
              <Plus className="w-4 h-4" />
              Studio
            </button>
            <button 
              onClick={() => setActiveTab('gallery')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm ${activeTab === 'gallery' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
            >
              <History className="w-4 h-4" />
              History
              {items.length > 0 && <span className="bg-orange-500 text-white text-[10px] px-1.5 rounded-full">{items.length}</span>}
            </button>
          </nav>

          <div className="flex items-center gap-3">
             <button 
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-full transition-all ${showSettings ? 'bg-orange-500 text-white' : 'hover:bg-white/5 text-gray-400 hover:text-white'}`}
             >
                <Settings className="w-5 h-5" />
             </button>
          </div>
        </header>

        <AnimatePresence>
          {showSettings && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-white/5 border-b border-white/10 overflow-hidden"
            >
              <div className="max-w-4xl mx-auto px-6 py-6 flex flex-col md:flex-row gap-8">
                <div className="flex-1 space-y-4">
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Host Source</h4>
                  <div className="flex gap-2 p-1 bg-black/40 rounded-xl w-fit">
                    <button 
                      onClick={() => setHostType('cloud')}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${hostType === 'cloud' ? 'bg-white text-black' : 'text-gray-500 hover:text-white'}`}
                    >
                      Google Veo (Cloud)
                    </button>
                    <button 
                      onClick={() => setHostType('local')}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${hostType === 'local' ? 'bg-orange-500 text-white' : 'text-gray-500 hover:text-white'}`}
                    >
                      My Local PC (Free)
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {hostType === 'cloud' 
                      ? "Uses Google's industrial servers via the Gemini API. High quality, but requires a paid key." 
                      : "Uses your computer's GPU. Completely free, depends on your PC hardware."}
                  </p>
                </div>

                {hostType === 'local' && (
                  <div className="flex-[2] space-y-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Local PC Configuration</h4>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={localEndpoint}
                        onChange={(e) => setLocalEndpoint(e.target.value)}
                        placeholder="http://localhost:5000/generate"
                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-orange-500"
                      />
                      <button className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-xs hover:bg-white/10 transition-colors">
                        Test Connection
                      </button>
                    </div>
                    <div className="p-4 bg-orange-500/5 border border-orange-500/10 rounded-xl">
                      <p className="text-[10px] uppercase font-bold text-orange-500 mb-2">Setup Guide</p>
                      <ul className="text-[11px] text-gray-400 space-y-1 list-disc pl-4">
                        <li>Start an API server on your PC (Flask/FastAPI/ComfyUI-Bridge).</li>
                        <li>Ensure CORS is enabled for all origins.</li>
                        <li>This app sends a JSON with <code className="text-gray-300">prompt</code> and <code className="text-gray-300">image</code>.</li>
                        <li>The server should respond with a video blob or file.</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
          <AnimatePresence mode="wait">
            {activeTab === 'generate' ? (
              <motion.div 
                key="generate"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-4xl mx-auto px-6 py-12 flex flex-col items-center"
              >
                <div className="text-center mb-12">
                  <h2 className="text-4xl sm:text-5xl font-light tracking-tight mb-4">
                    Cinematic Video <span className="italic serif">at your fingertips.</span>
                  </h2>
                  <p className="text-gray-500 max-w-xl mx-auto">
                    Generate production-grade videos from text or images using the same architecture as Sora and Veo.
                  </p>
                </div>

                <div className="w-full space-y-6">
                  {/* Media Dropzone / Preview */}
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative w-full aspect-video rounded-3xl border-2 border-dashed transition-all cursor-pointer overflow-hidden group ${selectedImage ? 'border-orange-500/50 bg-orange-500/5' : 'border-white/10 hover:border-white/20 bg-white/5'}`}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleImageUpload} 
                      accept="image/*" 
                      className="hidden" 
                    />
                    
                    {selectedImage ? (
                      <>
                        <img src={selectedImage} alt="Reference" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-sm font-medium">Click to change image</p>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setSelectedImage(null); }}
                          className="absolute top-4 right-4 p-2 bg-black/60 hover:bg-red-600 rounded-full transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
                        <div className="p-4 bg-white/5 rounded-full group-hover:scale-110 transition-transform">
                          <ImageIcon className="w-8 h-8 text-gray-400" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-semibold">Drop an image or click to upload</p>
                          <p className="text-xs text-gray-500 mt-1">Starting frame for Image-to-Video (Optional)</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Settings Row */}
                  <div className="flex flex-wrap gap-4 items-center justify-center py-4 px-6 bg-white/5 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-2">
                       <Maximize2 className="w-4 h-4 text-gray-500" />
                       <select 
                        value={aspectRatio} 
                        onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                        className="bg-transparent text-sm font-medium border-none focus:ring-0 cursor-pointer"
                       >
                         <option value="16:9" className="bg-[#1a1a1a]">16:9 Landscape</option>
                         <option value="9:16" className="bg-[#1a1a1a]">9:16 Portrait</option>
                       </select>
                    </div>
                    <div className="w-px h-4 bg-white/10 hidden sm:block"></div>
                    <div className="flex items-center gap-2">
                       <Monitor className="w-4 h-4 text-gray-500" />
                       <select 
                        value={resolution} 
                        onChange={(e) => setResolution(e.target.value as Resolution)}
                        className="bg-transparent text-sm font-medium border-none focus:ring-0 cursor-pointer"
                       >
                         <option value="720p" className="bg-[#1a1a1a]">720p HD</option>
                         <option value="1080p" className="bg-[#1a1a1a]">1080p Full HD</option>
                       </select>
                    </div>
                    <div className="w-px h-4 bg-white/10 hidden sm:block"></div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                       <Type className="w-4 h-4" />
                       <span>Model: Veo 3.1 Lite</span>
                    </div>
                  </div>

                  {/* Prompt Bar */}
                  <div className="relative group">
                    <textarea 
                      placeholder="Describe the cinematic masterpiece you want to create..."
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-6 pr-20 text-lg focus:outline-none focus:border-white/20 focus:ring-1 focus:ring-white/10 transition-all placeholder:text-gray-600 resize-none h-32"
                    />
                    <button 
                      onClick={generateVideo}
                      disabled={isGenerating || (!prompt && !selectedImage)}
                      className="absolute bottom-6 right-6 p-4 rounded-xl bg-white text-black hover:bg-gray-200 disabled:bg-gray-800 disabled:text-gray-600 transition-all shadow-xl shadow-white/5 flex items-center justify-center"
                    >
                      {isGenerating ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <Send className="w-6 h-6" />
                      )}
                    </button>
                  </div>

                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-sm"
                    >
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <span>{error}</span>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="gallery"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="max-w-7xl mx-auto px-6 py-8"
              >
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-semibold">Your Studio History</h3>
                  <button 
                    onClick={() => { if(confirm("Clear all history?")) setItems([]); }}
                    className="text-xs text-gray-500 hover:text-red-500 transition-colors uppercase tracking-widest font-bold"
                  >
                    Clear History
                  </button>
                </div>

                {items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-white/5 rounded-3xl">
                    <History className="w-12 h-12 text-white/10 mb-4" />
                    <p className="text-gray-500">No videos generated yet.</p>
                    <button 
                      onClick={() => setActiveTab('generate')}
                      className="mt-4 text-orange-500 hover:underline"
                    >
                      Go to Studio
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {items.map((item) => (
                      <HistoryCard key={item.id} item={item} onRemove={removeHistoryItem} />
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Aesthetic Background Accents */}
      <div className="fixed inset-0 pointer-events-none z-[-1]">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-orange-600/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-600/10 blur-[120px] rounded-full"></div>
      </div>
    </div>
  );
}

function HistoryCard({ item, onRemove }: { item: VideoGenerationItem, onRemove: (id: string) => void, key?: string }) {
  const [isHovered, setIsHovered] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="group relative bg-white/5 rounded-2xl overflow-hidden border border-white/10 hover:border-white/20 transition-all flex flex-col"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative aspect-video bg-black overflow-hidden">
        {item.status === GenerationStatus.SUCCESS && item.videoUrl ? (
          <video 
            ref={videoRef}
            src={item.videoUrl} 
            className="w-full h-full object-cover" 
            loop 
            muted 
            playsInline
            onMouseEnter={(e) => e.currentTarget.play()}
            onMouseLeave={(e) => {
              e.currentTarget.pause();
              e.currentTarget.currentTime = 0;
            }}
          />
        ) : item.status === GenerationStatus.ERROR ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-red-500/5">
            <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
            <p className="text-xs text-red-400 line-clamp-3">{item.error || "Failed to generate"}</p>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center space-y-4">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            <div className="text-center">
              <p className="text-xs font-mono uppercase tracking-widest text-orange-500">
                {item.status === GenerationStatus.INITIALIZING ? 'Initializing...' : 'Synthesizing...'}
              </p>
              <p className="text-[10px] text-gray-500 mt-1">This may take 1-3 minutes</p>
            </div>
            {item.previewUrl && (
              <img src={item.previewUrl} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-20 blur-sm grayscale" />
            )}
          </div>
        )}

        {/* Overlay Controls */}
        {item.status === GenerationStatus.SUCCESS && (
          <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
            <a 
              href={item.videoUrl} 
              download={`vividstream-${item.id}.mp4`}
              className="p-3 bg-white text-black rounded-full hover:scale-110 transition-transform"
            >
              <Download className="w-5 h-5" />
            </a>
          </div>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <p className="text-sm font-medium line-clamp-2 text-gray-200 mb-1">{item.prompt}</p>
          <p className="text-[10px] text-gray-500 font-mono">
            {new Date(item.createdAt).toLocaleString()}
          </p>
        </div>
        
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${
              item.status === GenerationStatus.SUCCESS ? 'bg-green-500' : 
              item.status === GenerationStatus.ERROR ? 'bg-red-500' : 
              'bg-orange-500 animate-pulse'
            }`} />
            <span className="text-[10px] uppercase tracking-tighter text-gray-400">
              {item.status}
            </span>
          </div>
          <button 
            onClick={() => onRemove(item.id)}
            className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
