const LOCAL_SERVER_URL = (process.env.VITE_BACKEND_URL || 'http://localhost:5001') + '/api/system-control';

export async function sendSystemControl(action: string, arg?: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await fetch(LOCAL_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, arg }),
    });
    return await response.json();
  } catch (error) {
    console.error('Failed to communicate with local system control server:', error);
    return { success: false, error: 'Local server not running. Start it with node server.js.' };
  }
}

// Maps verbal commands to system actions (Naina version - sassy girlfriend personality)
export function parseLocalSystemCommand(input: string): { action: string; arg?: string; feedback: string } | null {
  const cmd = input.toLowerCase().trim();

  // 1. Open App commands
  const appMatch = cmd.match(/^(?:open|launch|start)\s+(notepad|calculator|chrome|paint|explorer|vscode|cmd|powershell)$/i);
  if (appMatch) {
    const appName = appMatch[1].toLowerCase();
    return {
      action: 'open_app',
      arg: appName,
      feedback: `Acha khol rahi hoon ${appName}. Thoda sabr rakh pagal.`
    };
  }

  // 2. Volume control
  if (cmd.includes('volume up') || cmd.includes('increase volume') || cmd.includes('sound up')) {
    return { action: 'volume', arg: 'up', feedback: 'Volume barha diya. Zyaada zor se mat sunna.' };
  }
  if (cmd.includes('volume down') || cmd.includes('decrease volume') || cmd.includes('sound down')) {
    return { action: 'volume', arg: 'down', feedback: 'Volume kam kar diya, shanti mili.' };
  }
  if (cmd.includes('mute') || cmd.includes('unmute') || cmd.includes('silent')) {
    return { action: 'volume', arg: 'mute', feedback: 'Chup karwa diya computer ko.' };
  }

  // 3. Media control
  if (cmd.includes('play song') || cmd.includes('pause song') || cmd.includes('pause music') || cmd.includes('play music') || cmd.includes('pause video') || cmd.includes('play video')) {
    return { action: 'media', arg: 'play_pause', feedback: 'Media toggle kar diya.' };
  }
  if (cmd.includes('next song') || cmd.includes('next track') || cmd.includes('skip song')) {
    return { action: 'media', arg: 'next', feedback: 'Agla gaana laga rahi hoon.' };
  }
  if (cmd.includes('previous song') || cmd.includes('previous track') || cmd.includes('prev track')) {
    return { action: 'media', arg: 'prev', feedback: 'Peechhe wala gaana wapas laga diya.' };
  }

  // 4. Lock PC
  if (cmd.includes('lock my pc') || cmd.includes('lock screen') || cmd.includes('lock laptop') || cmd.includes('lock the pc')) {
    return { action: 'lock_pc', feedback: 'Laptop lock kar rahi hoon. Jao ab rest karo, pagal.' };
  }

  // 5. Screenshot
  if (cmd.includes('take a screenshot') || cmd.includes('screenshot screen') || cmd.includes('capture screen') || cmd.includes('take screenshot')) {
    return { action: 'screenshot', feedback: 'Screenshot le liya hai, desktop pe save ho gaya.' };
  }

  // 6. Type literal text
  const typeMatch = cmd.match(/^(?:type|simulate typing)\s+(.+)$/i);
  if (typeMatch) {
    const isCreative = typeMatch[1].includes('essay') || 
                       typeMatch[1].includes('code') || 
                       typeMatch[1].includes('story') || 
                       typeMatch[1].includes('poem') || 
                       typeMatch[1].includes('letter') ||
                       typeMatch[1].includes('email');
    if (!isCreative) {
      return { action: 'type_text', arg: typeMatch[1], feedback: `Likh rahi hoon: "${typeMatch[1]}"` };
    }
  }

  return null;
}
