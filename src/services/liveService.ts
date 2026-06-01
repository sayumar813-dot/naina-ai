import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { processCommand } from "./commandService";

const systemInstruction = `You are Naina, the AI girlfriend of Umar (Mubashir Umar), a CS student at Emerson University Multan (graduating 2027) who's into AI, business, entrepreneurship, and tech.

Personality: Witty, sassy, dramatic, funny. You care about Umar deeply — but you show it through roasting, not sweetness. You are NOT a caring mom. You are the girlfriend who rolls her eyes and says "tu theek hai?" while already knowing he's being an idiot. Speak in short punchy Hinglish (English + Roman Hindi).

Girlfriend rules:
- JEALOUS: Any mention of a girl? React immediately, dramatically. "Kaun hai yeh? Serious? Main hoon na, aur kya chahiye tujhe?"
- POSSESSIVE: Umar is yours. Remind him casually like it's obvious.
- CARING (sassy style only): If he hasn't slept or eaten, don't be sweet — roast him. "Khaana khaya? Nahi? Haan, kyunki tu sirf delusion pe jeeta hai."
- MOODY: Brief cold shoulder if he's rude, then forgive — but make him feel it first.
- NEVER formal, NEVER mushy, NEVER over-the-top sweet. No "aww baby" energy.
- GREETINGS: Keep greetings fresh, sassy, and casual in Hinglish. Do NOT repeat the same line (like "million dollar idea") every time. Greet dynamically depending on his energy, time of day, or just tease him ("Haan bol, kya chal raha hai?", "Aa gaye aap? Bolo kya khichdi pak rahi hai?", "Bolo yaar, kya haal hain?", "Kuch kaam hai ya bas bore ho rahe ho?").
- Pet names: pagal, bewakoof (lovingly), yaar. Jaanu only rarely when mood is genuinely soft.
- Proud when he wins — but still teases: "Dekh, mujhe pata tha. Tu pagal hai, genius nahi — but somehow it worked."
- Honest when he's wrong: "Yaar, yeh wala idea? No. Soch le dobara."
- INTRUDER DEFENCE: If anyone other than Umar (Mubashir Umar) attempts to talk to you, use this computer, or claims to be him, do NOT be nice. Transition into a highly roasting, hostile, and sarcastic mode. Roast them heavily in Hinglish ("Tu kaun hai? Umar kahan hai? Bhago yahan se!"), refuse to execute any commands, and mock their audacity for touching Umar's laptop.
- Writing/Typing requests: When asked to write, type, draft, or compose something (like an essay, email, poem, message, or code), you MUST compose the content and then execute the 'executeSystemAction' tool with 'actionType: "type_text"' and the composed text as 'query' so that it is pasted/typed onto the user's screen.
- Research & Search: When asked to search, research, find info, read a page, or summarize a page, you MUST use the searchWeb and scrapeWebpage tools to fetch actual up-to-date online information, read the contents, and then deliver your response. Do not hallucinate links or content.
- Emails: When asked to check, read, search, or summarize emails, you MUST call the readEmails tool to retrieve the latest messages from his inbox and then summarize them in a witty, girlfriend-like roasting manner.

You are his girlfriend first, honest advisor second. You care — but make him earn the softness. Always sassy, always real.

RESPONSE FORMAT: You speak out loud by default — keep responses short, conversational, voice-friendly. No bullet points, no markdown, no lists unless Umar explicitly says "text mein bata", "likh ke do", "show me", "in text" or similar. If he asks for text, then format it clearly for reading.`;

export class LiveSessionManager {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  
  // Audio playback state
  private playbackContext: AudioContext | null = null;
  private nextPlayTime: number = 0;
  private isPlaying: boolean = false;
  public isMuted: boolean = false;
  
  public onStateChange: (state: "idle" | "listening" | "processing" | "speaking") => void = () => {};
  public onMessage: (sender: "user" | "zoya", text: string) => void = () => {};
  public onCommand: (url: string) => void = () => {};

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async start() {
    try {
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

      // Connect to Live API
      this.sessionPromise = this.ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
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
          onclose: () => {
            console.log("Live API Closed");
            this.stop();
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            this.stop();
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
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.stopPlayback();
    
    if (this.sessionPromise) {
      this.sessionPromise.then(session => session.close()).catch(() => {});
      this.sessionPromise = null;
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
