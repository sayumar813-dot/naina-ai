import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, Volume2, VolumeX, Keyboard, Send, X, ExternalLink } from "lucide-react";
import { getZoyaResponse, getZoyaAudio, resetZoyaSession } from "./services/geminiService";
import { processCommand } from "./services/commandService";
import { LiveSessionManager } from "./services/liveService";
import { sendSystemControl, parseLocalSystemCommand } from "./services/systemService";
import Visualizer from "./components/Visualizer";
import VantaBackground from "./components/VantaBackground";
import PermissionModal from "./components/PermissionModal";
import { playPCM } from "./utils/audioUtils";
import { motion, AnimatePresence } from "motion/react";

type AppState = "idle" | "listening" | "processing" | "speaking";

interface ChatMessage {
  id: string;
  sender: "user" | "zoya";
  text: string;
  url?: string;
}

interface TextCard {
  text: string;
  url?: string;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

// Reliable URL opener — uses anchor click to bypass popup blockers
function openUrl(url: string) {
  try {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {
    window.open(url, "_blank");
  }
}

// Detect if user wants text output on screen
function wantsTextOutput(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("text") ||
    lower.includes("likh") ||
    lower.includes("likha") ||
    lower.includes("show") ||
    lower.includes("screen") ||
    lower.includes("type") ||
    lower.includes("write") ||
    lower.includes("readable") ||
    lower.includes("padh") ||
    lower.includes("text mein") ||
    lower.includes("in text") ||
    lower.includes("in writing")
  );
}

export default function App() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem("zoya_chat_history");
    if (saved) {
      try { return JSON.parse(saved); } catch { return []; }
    }
    return [];
  });
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
    localStorage.setItem("zoya_chat_history", JSON.stringify(messages));
  }, [messages]);

  // Text card — only shown when user explicitly asks for text
  const [textCard, setTextCard] = useState<TextCard | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  useEffect(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.isMuted = isMuted;
    }
  }, [isMuted]);

  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);

  const liveSessionRef = useRef<LiveSessionManager | null>(null);

  const handleTextCommand = useCallback(async (finalTranscript: string) => {
    if (!finalTranscript.trim()) {
      setAppState("idle");
      return;
    }

    const userWantsText = wantsTextOutput(finalTranscript);

    // Save to memory (hidden from screen)
    setMessages((prev) => [...prev, { id: Date.now().toString(), sender: "user", text: finalTranscript }]);

    if (isSessionActive && liveSessionRef.current) {
      liveSessionRef.current.sendText(finalTranscript);
      return;
    }

    setAppState("processing");

    // 0. Check for local system control commands (open app, volume, screenshot, etc.)
    const localSystemCmd = parseLocalSystemCommand(finalTranscript);
    if (localSystemCmd) {
      const responseText = localSystemCmd.feedback;
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-z", sender: "zoya", text: responseText }]);
      setTextCard({ text: responseText });

      const result = await sendSystemControl(localSystemCmd.action, localSystemCmd.arg);
      if (!result.success) {
        setTextCard({ text: `Failed to control system: ${result.error || 'Server not running'}\n\nStart the local control server with "node server.js".` });
      }

      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getZoyaAudio(responseText);
        if (audioBase64) await playPCM(audioBase64);
      }
      setAppState("idle");
      return;
    }

    const commandResult = processCommand(finalTranscript);
    let responseText = "";

    if (commandResult.isBrowserAction) {
      responseText = commandResult.action;
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-z", sender: "zoya", text: responseText, url: commandResult.url }]);

      // Show text card with link button always for browser actions
      setTextCard({ text: responseText, url: commandResult.url });

      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getZoyaAudio(responseText);
        if (audioBase64) await playPCM(audioBase64);
      }

      setAppState("idle");
      if (commandResult.url) openUrl(commandResult.url);

    } else {
      responseText = await getZoyaResponse(finalTranscript, messagesRef.current);
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-z", sender: "zoya", text: responseText }]);

      // Only show text card if user asked for it
      if (userWantsText) {
        setTextCard({ text: responseText });
      }

      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getZoyaAudio(responseText);
        if (audioBase64) await playPCM(audioBase64);
      }
      setAppState("idle");
    }
  }, [isMuted, isSessionActive]);

  useEffect(() => {
    return () => { liveSessionRef.current?.stop(); };
  }, []);

  const toggleListening = async () => {
    if (isSessionActive) {
      setIsSessionActive(false);
      liveSessionRef.current?.stop();
      liveSessionRef.current = null;
      setAppState("idle");
      resetZoyaSession();
    } else {
      try {
        setIsSessionActive(true);
        resetZoyaSession();

        const session = new LiveSessionManager();
        session.isMuted = isMuted;
        liveSessionRef.current = session;

        session.onStateChange = (state) => setAppState(state);

        session.onMessage = (sender, text) => {
          setMessages((prev) => [...prev, { id: Date.now().toString() + "-" + sender, sender, text }]);
          // For live mode: show text card only if Zoya's response is long (likely text-worthy)
          // or if the last user message asked for text
          const lastUserMsg = messagesRef.current.filter(m => m.sender === "user").slice(-1)[0];
          if (sender === "zoya" && lastUserMsg && wantsTextOutput(lastUserMsg.text)) {
            setTextCard({ text });
          }
        };

        session.onCommand = (url) => {
          setTextCard({ text: "Tap below if it didn't open automatically.", url });
          openUrl(url);
        };

        await session.start();
      } catch (e) {
        console.error("Failed to start session", e);
        setShowPermissionModal(true);
        setIsSessionActive(false);
        setAppState("idle");
      }
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    handleTextCommand(textInput);
    setTextInput("");
    setShowTextInput(false);
  };

  return (
    <div className="h-[100dvh] w-screen bg-[#050505] text-white flex flex-col items-center justify-between font-sans relative overflow-hidden m-0 p-0">
      {showPermissionModal && <PermissionModal onClose={() => setShowPermissionModal(false)} />}

      {/* Vanta.js animated background */}
      <VantaBackground effect="WAVES" />

      {/* Header */}
      <header className="absolute top-0 left-0 w-full flex justify-between items-center z-20 px-6 py-4 md:px-12 md:py-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-rose-400 flex items-center justify-center font-bold text-sm">N</div>
          <h1 className="text-xl font-serif font-medium tracking-wide opacity-90">Naina</h1>
        </div>
        <button
          onClick={() => setIsMuted(!isMuted)}
          className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-70"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-70"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          )}
        </button>
      </header>

      {/* Full Screen Visualizer */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
        <Visualizer state={appState} />
      </div>

      {/* State Label */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-[120px] z-10 pointer-events-none">
        <AnimatePresence mode="wait">
          {appState === "processing" && (
            <motion.div key="proc" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              className="flex items-center gap-2 text-cyan-300/80 text-sm italic font-serif">
              <Loader2 size={14} className="animate-spin" /> Thinking...
            </motion.div>
          )}
          {appState === "listening" && (
            <motion.div key="list" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              className="flex items-center gap-2 text-violet-300/70 text-sm italic">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" /> Listening...
            </motion.div>
          )}
          {appState === "speaking" && (
            <motion.div key="speak" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              className="flex items-center gap-2 text-pink-300/70 text-sm italic">
              <div className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse" /> Speaking...
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Text Card — only appears when user asks for text OR for URL actions */}
      <AnimatePresence>
        {textCard && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="absolute top-24 left-4 right-4 md:left-16 md:right-16 z-30 bg-black/60 border border-white/10 backdrop-blur-xl rounded-2xl p-5 shadow-2xl"
          >
            <button
              onClick={() => setTextCard(null)}
              className="absolute top-3 right-3 p-1 rounded-full hover:bg-white/10 transition-colors"
            >
              <X size={16} className="opacity-50 hover:opacity-100" />
            </button>
            <p className="text-white/90 text-sm leading-relaxed pr-6 whitespace-pre-wrap">{textCard.text}</p>
            {textCard.url && (
              <a
                href={textCard.url}
                target="_blank"
                rel="noopener noreferrer"
                autoFocus
                className="mt-3 inline-flex items-center gap-1.5 text-xs text-rose-300 hover:text-white bg-rose-500/20 hover:bg-rose-500/40 border border-rose-400/30 rounded-full px-3 py-1.5 transition-all"
              >
                <ExternalLink size={11} /> Open Link
              </a>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <footer className="absolute bottom-0 left-0 w-full flex flex-col items-center justify-center pb-6 md:pb-8 z-20 gap-4">
        <AnimatePresence>
          {showTextInput && (
            <motion.form
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
              onSubmit={handleTextSubmit}
              className="w-full max-w-md flex items-center gap-2 bg-white/5 border border-white/10 rounded-full p-1 pl-4 backdrop-blur-md shadow-2xl"
            >
              <input
                type="text" value={textInput} onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type to Zoya..." autoFocus
                className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/30 text-sm"
              />
              <button type="submit" disabled={!textInput.trim()}
                className="p-2 rounded-full bg-rose-500 hover:bg-rose-600 disabled:opacity-50 transition-colors">
                <Send size={16} />
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-4">
          <button
            onClick={toggleListening}
            className={`group relative flex items-center gap-3 px-8 py-4 rounded-full font-medium tracking-wide transition-all duration-300 shadow-2xl
              ${isSessionActive
                ? "bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30"
                : "bg-white/10 text-white border border-white/20 hover:bg-white/20 hover:scale-105"
              }`}
          >
            {isSessionActive ? (
              <><MicOff size={20} /><span>End Session</span></>
            ) : (
              <><Mic size={20} className="group-hover:animate-bounce" /><span>Start Session</span></>
            )}
          </button>

          {!isSessionActive && (
            <button
              onClick={() => setShowTextInput(!showTextInput)}
              className="p-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors shadow-2xl"
              title="Type instead"
            >
              <Keyboard size={20} className="opacity-70" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
