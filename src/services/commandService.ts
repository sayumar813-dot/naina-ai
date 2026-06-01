export function processCommand(command: string): {
  action: string;
  url?: string;
  isBrowserAction: boolean;
} {
  const lowerCmd = command.toLowerCase().trim();

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
    facebook: "https://www.facebook.com",
    instagram: "https://www.instagram.com",
    twitter: "https://www.twitter.com",
    chatgpt: "https://chatgpt.com",
  };

  // General Browsing: "Open [website name]"
  const openMatch = lowerCmd.match(/^(?:open|launch|go to)\s+(.+)$/);
  if (openMatch) {
    const query = openMatch[1].trim();
    
    // Check if it's a known app/site shortcut
    if (appUrls[query]) {
      return {
        action: `Opening ${query} for you, Umar.`,
        url: appUrls[query],
        isBrowserAction: true,
      };
    }

    const wordCount = query.split(/\s+/).length;
    const looksLikeDomain = query.includes(".") || wordCount === 1;

    if (looksLikeDomain) {
      // Single word or has a dot → go directly to site
      let website = query.replace(/\s+/g, "");
      if (!website.includes(".")) website += ".com";
      return {
        action: `Opening ${query} for you.`,
        url: website.startsWith("http") ? website : `https://www.${website}`,
        isBrowserAction: true,
      };
    } else {
      // Multi-word phrase → Google Search
      return {
        action: `Searching "${query}" for you, Umar.`,
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        isBrowserAction: true,
      };
    }
  }

  // Media Search: "Play [song/video] on YouTube"
  const ytMatch = lowerCmd.match(/^play\s+(.+?)\s+on\s+youtube$/);
  if (ytMatch) {
    const query = encodeURIComponent(ytMatch[1].trim());
    return {
      action: `Playing ${ytMatch[1]} on YouTube.`,
      url: `https://www.youtube.com/results?search_query=${query}`,
      isBrowserAction: true,
    };
  }

  // Media Search: "Search [query] on Spotify"
  const spotifyMatch = lowerCmd.match(/^search\s+(.+?)\s+on\s+spotify$/);
  if (spotifyMatch) {
    const query = encodeURIComponent(spotifyMatch[1].trim());
    return {
      action: `Searching ${spotifyMatch[1]} on Spotify.`,
      url: `https://open.spotify.com/search/${query}`,
      isBrowserAction: true,
    };
  }

  // WhatsApp Web: "Send a WhatsApp message to [number] saying [message]"
  const waMatch = lowerCmd.match(
    /^send\s+a\s+whatsapp\s+message\s+to\s+([\d\+\s]+)\s+saying\s+(.+)$/,
  );
  if (waMatch) {
    const number = waMatch[1].replace(/\s+/g, "");
    const message = encodeURIComponent(waMatch[2].trim());
    return {
      action: `Opening WhatsApp to send your message.`,
      url: `https://web.whatsapp.com/send?phone=${number}&text=${message}`,
      isBrowserAction: true,
    };
  }

  return { action: "", isBrowserAction: false };
}
