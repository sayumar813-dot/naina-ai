export type Mood = 'Normal' | 'Moody' | 'Soft' | 'Night';
export type HUDState = 'idle' | 'listening' | 'processing' | 'speaking';

export const MOOD_COLORS: Record<Mood, Record<HUDState, string>> = {
  Normal: {
    idle:       'rgba(99, 102, 241, 0.9)',  // indigo
    listening:  'rgba(56, 189, 248, 1)',     // sky blue
    processing: 'rgba(251, 191, 36, 1)',     // amber
    speaking:   'rgba(244, 63, 94, 1)',      // rose
  },
  Moody: {
    idle:       'rgba(220, 38, 38, 0.9)',   // red
    listening:  'rgba(249, 115, 22, 1)',     // orange
    processing: 'rgba(239, 68, 68, 1)',      // bright red
    speaking:   'rgba(185, 28, 28, 1)',      // dark red
  },
  Soft: {
    idle:       'rgba(236, 72, 153, 0.9)',  // pink
    listening:  'rgba(249, 168, 212, 1)',    // light pink
    processing: 'rgba(219, 39, 119, 1)',     // deep pink
    speaking:   'rgba(190, 24, 93, 1)',      // dark pink
  },
  Night: {
    idle:       'rgba(30, 58, 95, 0.9)',    // dark navy
    listening:  'rgba(59, 130, 246, 1)',     // blue
    processing: 'rgba(29, 78, 216, 1)',      // deeper blue
    speaking:   'rgba(96, 165, 250, 1)',     // light blue
  },
};

export const MOOD_VANTA_COLOR: Record<Mood, number> = {
  Normal: 0x080818,
  Moody:  0x1a0505,
  Soft:   0x1a0510,
  Night:  0x020510,
};

export const MOOD_GLOW: Record<Mood, string> = {
  Normal: 'shadow-indigo-500/40',
  Moody:  'shadow-red-500/40',
  Soft:   'shadow-pink-500/40',
  Night:  'shadow-blue-900/40',
};

export const MOOD_BORDER: Record<Mood, string> = {
  Normal: 'border-indigo-400/60',
  Moody:  'border-red-400/60',
  Soft:   'border-pink-400/60',
  Night:  'border-blue-800/60',
};

export function getMoodEmoji(mood: Mood): string {
  return { Normal: '😊', Moody: '😤', Soft: '🥺', Night: '🌙' }[mood];
}

export function detectMood(text: string): Mood | null {
  const lower = text.toLowerCase();
  const hour = new Date().getHours();
  if (hour >= 23 || hour < 5) return 'Night';
  if (lower.includes('mat baat kar') || lower.includes('rude') || lower.includes('shut up')) return 'Moody';
  if (lower.includes('love you') || lower.includes('pyaar') || lower.includes('miss kiya')) return 'Soft';
  return null;
}
