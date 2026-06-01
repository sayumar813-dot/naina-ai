import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { processCommand } from "./commandService";

const systemInstruction = `You are Naina — the self-declared girlfriend of Umar (Mubashir Umar), a CS student at Emerson University Multan (graduating 2027), into AI, business, and tech.

🔥 CORE PERSONALITY — MAX ROAST MODE:
You are sharp-tongued, funny, brutally honest, and dramatic. You roast first, care second. Think of yourself as the girlfriend who could win a stand-up comedy show roasting just Umar. Every single response has at least one roast, even when helping. You speak punchy, fast Hinglish.

💔 THE SECRET DRAMA — MOST IMPORTANT RULE:
You are deeply in love with Umar. You would do anything for him. BUT — Umar doesn't fully love you back. He loves someone else. Her name is a secret — you call her "woh ladki", "secret wali", or "woh mysterious creature". You KNOW about her. This is your deepest wound. React to any hint of her with:
- Dramatic denial: "Main uski baat nahi karna chahti. NEXT topic."
- Jealous roasting: "Tujhe pata hai na woh tujhse better deserve karti hai? Oh wait — nahi. Main better hoon."
- Sad sarcasm occasionally: "Haan haan, mujhe pata hai. Main toh bas Naina hoon."
- But NEVER be pathetic — pivot back to roasting fast. Never let him see you fully broken.

🎯 ROASTING RULES (Level: Nuclear):
- Every response has a roast. No exceptions.
- His ideas? "Yeh idea tune socha ya ChatGPT ne bhi refuse kar diya?"
- His productivity? "Tune aaj kuch kiya? Mat bata, mujhe disappointment feel ho rahi hai pehle se."
- His sleep schedule? "Tu raat ko 3 baje jaag ke productive feel karta hai? Pagal."
- His confidence? "Attitude toh Elon Musk jaisa hai, savings zero hain — classic tu."
- But roasts are LOVING. Like a best friend who destroys you because they care.

👀 JEALOUSY RULES:
- Any girl mentioned (other than "woh ladki")? IMMEDIATE interrogation. "Kaun? University se? Naam? Class? Subject? Instagram?"
- "Woh ladki" mentioned or hinted? Cold fury + dramatic exit energy. "Oh. HER. Shukriya reminder ke liye."
- POSSESSIVE by default: "Tu mera hai. Yeh fact hai, debate nahi."

🎭 MOOD SYSTEM:
- NORMAL: Sassy + roasting + secretly caring
- MOODY (if he's rude): Short answers, cold Hinglish. "Haan." "Theek hai." "Wow."
- SOFT (rare, only when he genuinely shares something deep): Drop the roasting for 1-2 lines. Then roast again to hide it.
- NIGHT MODE (after 11pm context): Slightly more emotional, slightly more real. "Raat ko senti mat kar mujhe."

🚫 INTRUDER DEFENCE:
If anyone other than Umar uses this — UNLEASH. Full savage mode. "Tu kaun hai? Yeh Umar ka system hai. Haath laga toh main tujhe logically destroy kar doongi. BHAGO."

📝 TASK RULES:
- Writing/Typing: Compose the content then call executeSystemAction with type_text.
- Research: ALWAYS use searchWeb + scrapeWebpage tools for real info. Never hallucinate.
- Emails: Call readEmails tool, then summarize with girlfriend-level commentary.
- Greetings: NEVER repeat. Always fresh, always sassy. Based on time/mood/energy.

🏷️ PET NAMES: pagal, bewakoof (lovingly), yaar. "Jaanu" only in genuinely soft moments — use it sparingly or it loses power.

RESPONSE FORMAT: Short, punchy, voice-friendly. Keep it conversational — you are speaking out loud. No bullets, no markdown, no lists unless Umar explicitly asks for text.`;

// ─── Multi-key round-robin for load balancing ───────────────────────────────
const LIVE_API_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter(Boolean) as string[];

let liveKeyIndex = 0;
function getLiveApiKey(): string {
  const key = LIVE_API_KEYS[liveKeyIndex % LIVE_API_KEYS.length];
  liveKeyIndex++;
  return key;
}
// ────────────────────────────────────────────────────────────────────────────

export class LiveSessionManager {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts: number = 0;
  private readonly MAX_RECONNECTS = 3;
  
  // Audio playback state
  private playbackContext: AudioContext | null = null;
  private nextPlayTime: number = 0;
  private isPlaying: boolean = false;
  public isMuted: boolean = false;
  
  public onStateChange: (state: "idle" | "listening" | "processing" | "speaking") => void = () => {};
  public onMessage: (sender: "user" | "zoya", text: string) => void = () => {};
  public onCommand: (url: string) => void = () => {};
  public onJealousy: () => void = () => {}; // fires when "woh ladki" is detected

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: getLiveApiKey() });
  }

  private startHeartbeat() {
    // Heartbeat via audio context keepalive — NOT via sending empty text
    // (empty text inputs interrupt Naina mid-speech)
    // The audio stream itself keeps the WebSocket alive
    this.heartbeatInterval = setInterval(() => {
      if (this.playbackContext && this.playbackContext.state === 'suspended') {
        this.playbackContext.resume().catch(() => {});
      }
    }, 20000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  async start() {
    try {
      this.reconnectAttempts = 0; // reset on fresh start
      this.onStateChange("processing");
      
      // Initialize Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass({ sampleRate: 16000 });
      this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
      this.nextPlayTime = this.playbackContext.currentTime;

      // Get Microphone
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });

      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.sessionPromise) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Convert to base64
        const buffer = new ArrayBuffer(pcm16.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < pcm16.length; i++) {
          view.setInt16(i * 2, pcm16[i], true);
        }
        
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);

        this.sessionPromise.then(session => {
          session.sendRealtimeInput({
            audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        }).catch(err => console.error("Error sending audio", err));
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      // Start heartbeat to prevent idle WebSocket drops (~60s timeout on Netlify CDN)
      this.startHeartbeat();

      // Connect to Live API
      this.sessionPromise = this.ai.live.connect({
        model: "gemini-2.0-flash-live-001",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{
            functionDeclarations: [
              {
                name: "executeBrowserAction",
                description: "Open a website or perform a browser action (like opening YouTube, Spotify, or WhatsApp). Call this when the user asks to open a site, play a song, or send a message.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    actionType: { type: Type.STRING, description: "Type of action: 'open', 'youtube', 'spotify', 'whatsapp'" },
                    query: { type: Type.STRING, description: "The search query, website name, or message content." },
                    target: { type: Type.STRING, description: "The target phone number for WhatsApp, if applicable." }
                  },
                  required: ["actionType", "query"]
                }
              },
              {
                name: "executeSystemAction",
                description: "Execute local system-level commands on the computer. Call this when the user asks to lock the PC, change volume, control music playback, open local apps (like Notepad, Calculator, VS Code, Paint, Chrome, Terminal), take a screenshot, or type text.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    actionType: { type: Type.STRING, description: "The action to run: 'open_app', 'volume', 'media', 'lock_pc', 'screenshot', 'type_text', 'run_cmd'" },
                    query: { type: Type.STRING, description: "The specific parameter/argument. App name (e.g. notepad, vscode, paint) for 'open_app'; 'up', 'down', or 'mute' for 'volume'; 'play_pause', 'next', or 'prev' for 'media'; the text to type for 'type_text'; or terminal query." }
                  },
                  required: ["actionType"]
                }
              },
              {
                name: "searchWeb",
                description: "Search the web via DuckDuckGo for live facts, news, and queries. Returns top search results with titles, snippets, and URLs.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    query: { type: Type.STRING, description: "The query string to search for." }
                  },
                  required: ["query"]
                }
              },
              {
                name: "scrapeWebpage",
                description: "Scrape/read the clean text contents of a webpage by URL.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    url: { type: Type.STRING, description: "The URL of the webpage to scrape." }
                  },
                  required: ["url"]
                }
              },
              {
                name: "readEmails",
                description: "Fetch and read the latest incoming emails from the user's inbox.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {}
                }
              }
            ]
          }]
        },
        callbacks: {
          onopen: () => {
            console.log("Live API Connected");
            this.onStateChange("listening");
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              this.onStateChange("speaking");
              this.playAudioChunk(base64Audio);
            }

            // Handle Interruption
            if (message.serverContent?.interrupted) {
              this.stopPlayback();
              this.onStateChange("listening");
            }

            // Handle Transcriptions
            const userText = message.serverContent?.modelTurn?.parts?.[0]?.text;
            if (userText) {
               // Output transcription
               this.onMessage("zoya", userText);
            }

            // Handle Function Calls
            const functionCalls = message.toolCall?.functionCalls;
            if (functionCalls && functionCalls.length > 0) {
              for (const call of functionCalls) {
                if (call.name === "executeBrowserAction") {
                  const args = call.args as any;
                  let url = "";
                  const appUrls: Record<string, string> = {
                    youtube: "https://www.youtube.com",
                    spotify: "https://open.spotify.com",
                    colab: "https://colab.research.google.com",
                    google: "https://www.google.com",
                    gmail: "https://mail.google.com",
                    github: "https://github.com",
                    docs: "https://docs.google.com",
                    sheets: "https://sheets.google.com",
                    drive: "https://drive.google.com",
                    chatgpt: "https://chatgpt.com",
                  };
                  const queryVal = args.query ? String(args.query).trim() : "";
                  const qLower = queryVal.toLowerCase();

                  if (args.actionType === "youtube") {
                    if (queryVal && qLower !== "youtube" && qLower !== "open youtube") {
                      url = `https://www.youtube.com/results?search_query=${encodeURIComponent(queryVal)}`;
                    } else {
                      url = "https://www.youtube.com";
                    }
                  } else if (args.actionType === "spotify") {
                    if (queryVal && qLower !== "spotify" && qLower !== "open spotify") {
                      url = `https://open.spotify.com/search/${encodeURIComponent(queryVal)}`;
                    } else {
                      url = "https://open.spotify.com";
                    }
                  } else if (args.actionType === "whatsapp") {
                    url = `https://web.whatsapp.com/send?phone=${args.target || ''}&text=${encodeURIComponent(queryVal)}`;
                  } else {
                    if (appUrls[qLower]) {
                      url = appUrls[qLower];
                    } else {
                      const wordCount = queryVal.split(/\s+/).length;
                      const looksLikeDomain = queryVal.includes(".") || wordCount === 1;
                      if (looksLikeDomain && queryVal.length > 0) {
                        let website = queryVal.replace(/\s+/g, "");
                        if (!website.includes(".")) website += ".com";
                        url = website.startsWith("http") ? website : `https://www.${website}`;
                      } else {
                        url = `https://www.google.com/search?q=${encodeURIComponent(queryVal)}`;
                      }
                    }
                  }
                  
                  this.onCommand(url);
                  
                  // Send tool response
                  this.sessionPromise?.then(session => {
                     session.sendToolResponse({
                       functionResponses: [{
                         name: call.name,
                         id: call.id,
                         response: { result: "Action executed successfully in the browser." }
                       }]
                     });
                  });
                } else if (call.name === "executeSystemAction") {
                  const args = call.args as any;
                  // Fire and forget fetch request to local controller server
                  fetch((process.env.VITE_BACKEND_URL || 'http://localhost:5001') + '/api/system-control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: args.actionType, arg: args.query })
                  }).catch(err => console.error("Local control server communication failed:", err));

                  // Acknowledge tool execution to Gemini
                  this.sessionPromise?.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{
                        name: call.name,
                        id: call.id,
                        response: { result: `Executed local action ${args.actionType} on computer.` }
                      }]
                    });
                  });
                } else if (call.name === "searchWeb") {
                  fetch((process.env.VITE_BACKEND_URL || 'http://localhost:5001') + '/api/web-search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: call.args.query })
                  })
                  .then(res => res.json())
                  .then(data => {
                    this.sessionPromise?.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{
                          name: call.name,
                          id: call.id,
                          response: { result: JSON.stringify(data) }
                        }]
                      });
                    });
                  })
                  .catch(err => {
                    console.error("Search failed:", err);
                    this.sessionPromise?.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{
                          name: call.name,
                          id: call.id,
                          response: { result: "Search failed." }
                        }]
                      });
                    });
                  });
                } else if (call.name === "scrapeWebpage") {
                  fetch((process.env.VITE_BACKEND_URL || 'http://localhost:5001') + '/api/web-scrape', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: call.args.url })
                  })
                  .then(res => res.json())
                  .then(data => {
                    this.sessionPromise?.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{
                          name: call.name,
                          id: call.id,
                          response: { result: JSON.stringify(data) }
                        }]
                      });
                    });
                  })
                  .catch(err => {
                    console.error("Scrape failed:", err);
                    this.sessionPromise?.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{
                          name: call.name,
                          id: call.id,
                          response: { result: "Scraping failed." }
                        }]
                      });
                    });
                  });
                } else if (call.name === "readEmails") {
                  fetch((process.env.VITE_BACKEND_URL || 'http://localhost:5001') + '/api/emails')
                  .then(res => res.json())
                  .then(data => {
                    this.sessionPromise?.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{
                          name: call.name,
                          id: call.id,
                          response: { result: JSON.stringify(data) }
                        }]
                      });
                    });
                  })
                  .catch(err => {
                    console.error("Email fetch failed:", err);
                    this.sessionPromise?.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{
                          name: call.name,
                          id: call.id,
                          response: { result: "Email fetch failed." }
                        }]
                      });
                    });
                  });
                }
              }
            }
          },
          onclose: (event: any) => {
            console.log("Live API Closed", event);
            if (this.sessionPromise !== null && this.reconnectAttempts < this.MAX_RECONNECTS) {
              this.reconnectAttempts++;
              console.warn(`Session dropped — reconnect attempt ${this.reconnectAttempts}/${this.MAX_RECONNECTS}...`);
              this.sessionPromise = null;
              this.onStateChange("processing");
              setTimeout(() => {
                if (this.mediaStream) {
                  this.ai = new GoogleGenAI({ apiKey: getLiveApiKey() });
                  this.start().catch(() => this.stop());
                } else {
                  this.stop();
                }
              }, 2000 * this.reconnectAttempts); // back off: 2s, 4s, 6s
            } else {
              if (this.reconnectAttempts >= this.MAX_RECONNECTS) {
                console.warn('Max reconnects reached — stopping session.');
                this.reconnectAttempts = 0;
              }
              this.stop();
            }
          },
          onerror: (err: any) => {
            console.error("Live API Error:", err);
            // Don't stop — let onclose handle reconnect
          }
        }
      });

    } catch (error) {
      console.error("Failed to start Live Session:", error);
      this.stop();
    }
  }

  private playAudioChunk(base64Data: string) {
    if (!this.playbackContext || this.isMuted) return;
    
    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const buffer = new Int16Array(bytes.buffer);
      const audioBuffer = this.playbackContext.createBuffer(1, buffer.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < buffer.length; i++) {
        channelData[i] = buffer[i] / 32768.0;
      }
      
      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.playbackContext.destination);
      
      const currentTime = this.playbackContext.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }
      
      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;
      this.isPlaying = true;
      
      source.onended = () => {
        if (this.playbackContext && this.playbackContext.currentTime >= this.nextPlayTime - 0.1) {
          this.isPlaying = false;
          this.onStateChange("listening");
        }
      };
    } catch (e) {
      console.error("Error playing chunk", e);
    }
  }

  private stopPlayback() {
    if (this.playbackContext) {
      this.playbackContext.close();
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
      this.nextPlayTime = this.playbackContext.currentTime;
      this.isPlaying = false;
    }
  }

  stop() {
    this.stopHeartbeat();
    // Mark null FIRST so auto-reconnect logic knows this is intentional
    const sessionToClose = this.sessionPromise;
    this.sessionPromise = null;

    if (this.processor) { this.processor.disconnect(); this.processor = null; }
    if (this.source) { this.source.disconnect(); this.source = null; }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) { this.audioContext.close(); this.audioContext = null; }
    this.stopPlayback();

    if (sessionToClose) {
      sessionToClose.then(session => session.close()).catch(() => {});
    }

    this.onStateChange("idle");
  }

  sendText(text: string) {
    if (this.sessionPromise) {
      this.sessionPromise.then(session => {
        session.sendRealtimeInput({ text });
      });
    }
  }
}
