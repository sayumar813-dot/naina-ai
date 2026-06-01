import { GoogleGenAI } from "@google/genai";

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

let chatSession: any = null;

export function resetZoyaSession() {
  chatSession = null;
}

export async function getZoyaResponse(prompt: string, history: { sender: "user" | "zoya", text: string }[] = []): Promise<string> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    if (!chatSession) {
      const recentHistory = history.slice(-20);
      
      let formattedHistory: any[] = [];
      let currentRole = "";
      let currentText = "";

      for (const msg of recentHistory) {
        const role = msg.sender === "user" ? "user" : "model";
        if (role === currentRole) {
          currentText += "\n" + msg.text;
        } else {
          if (currentRole !== "") {
            formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
          }
          currentRole = role;
          currentText = msg.text;
        }
      }
      if (currentRole !== "") {
        formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
      }

      if (formattedHistory.length > 0 && formattedHistory[0].role !== "user") {
        formattedHistory.shift();
      }

      chatSession = ai.chats.create({
        model: "gemini-3.1-flash-lite-preview",
        config: {
          systemInstruction,
          tools: [{
            functionDeclarations: [
              {
                name: "executeBrowserAction",
                description: "Open a website or perform a browser action (like opening YouTube, Spotify, or WhatsApp). Call this when the user asks to open a site, play a song, or send a message.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    actionType: { type: "STRING", description: "Type of action: 'open', 'youtube', 'spotify', 'whatsapp'" },
                    query: { type: "STRING", description: "The search query, website name, or message content." },
                    target: { type: "STRING", description: "The target phone number for WhatsApp, if applicable." }
                  },
                  required: ["actionType", "query"]
                }
              },
              {
                name: "executeSystemAction",
                description: "Execute local system-level commands on the computer. Call this when the user asks to lock the PC, change volume, control music playback, open local apps (like Notepad, Calculator, VS Code, Paint, Chrome, Terminal), take a screenshot, or type text.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    actionType: { type: "STRING", description: "The action to run: 'open_app', 'volume', 'media', 'lock_pc', 'screenshot', 'type_text', 'run_cmd'" },
                    query: { type: "STRING", description: "The specific parameter/argument. App name (e.g. notepad, vscode, paint) for 'open_app'; 'up', 'down', or 'mute' for 'volume'; 'play_pause', 'next', or 'prev' for 'media'; the text to type for 'type_text'; or terminal query." }
                  },
                  required: ["actionType"]
                }
              },
              {
                name: "searchWeb",
                description: "Search the web via DuckDuckGo for live facts, news, and queries. Returns top search results with titles, snippets, and URLs.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    query: { type: "STRING", description: "The query string to search for." }
                  },
                  required: ["query"]
                }
              },
              {
                name: "scrapeWebpage",
                description: "Scrape/read the clean text contents of a webpage by URL.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    url: { type: "STRING", description: "The URL of the webpage to scrape." }
                  },
                  required: ["url"]
                }
              },
              {
                name: "readEmails",
                description: "Fetch and read the latest incoming emails from the user's inbox.",
                parameters: {
                  type: "OBJECT",
                  properties: {}
                }
              }
            ]
          }]
        },
        history: formattedHistory,
      });
    }

    let response = await chatSession.sendMessage({ message: prompt });
    
    // Function calling loop for text mode
    while (response.functionCalls && response.functionCalls.length > 0) {
      const functionResponses = [];
      for (const call of response.functionCalls) {
        let result = "";
        
        if (call.name === "executeSystemAction") {
          try {
            const apiRes = await fetch((process.env.VITE_BACKEND_URL || 'http://localhost:5001') + '/api/system-control', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: call.args.actionType, arg: call.args.query })
            });
            const resData = await apiRes.json();
            result = JSON.stringify(resData);
          } catch (e) {
            result = "Error: Local control server not running.";
          }
        } else if (call.name === "searchWeb") {
          try {
            const apiRes = await fetch((process.env.VITE_BACKEND_URL || 'http://localhost:5001') + '/api/web-search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: call.args.query })
            });
            const resData = await apiRes.json();
            result = JSON.stringify(resData);
          } catch (e) {
            result = "Error querying web search service.";
          }
        } else if (call.name === "scrapeWebpage") {
          try {
            const apiRes = await fetch((process.env.VITE_BACKEND_URL || 'http://localhost:5001') + '/api/web-scrape', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: call.args.url })
            });
            const resData = await apiRes.json();
            result = JSON.stringify(resData);
          } catch (e) {
            result = "Error scraping webpage.";
          }
        } else if (call.name === "readEmails") {
          try {
            const apiRes = await fetch((process.env.VITE_BACKEND_URL || 'http://localhost:5001') + '/api/emails');
            const resData = await apiRes.json();
            result = JSON.stringify(resData);
          } catch (e) {
            result = "Error fetching emails. Check EMAIL_USER/EMAIL_PASS in .env.";
          }
        } else if (call.name === "executeBrowserAction") {
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
          
          try {
            const a = document.createElement("a");
            a.href = url;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            result = "Opened browser page successfully.";
          } catch {
            result = "Failed to open page in browser.";
          }
        }
        
        functionResponses.push({
          name: call.name,
          response: { result }
        });
      }
      
      response = await chatSession.sendMessage({
        message: {
          role: "user",
          parts: [{ functionResponses }]
        }
      });
    }

    return response.text || "Ugh, fine. I have nothing to say.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Uff, mera dimaag kharab ho gaya hai. Try again later, Umar.";
  }
}

export async function getZoyaAudio(text: string): Promise<string | null> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
}
