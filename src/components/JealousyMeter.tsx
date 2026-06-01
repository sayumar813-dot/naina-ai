import { useEffect, useState } from 'react';

interface Props {
  level: number; // 0–100
  wohLadkiMentions: number;
}

export default function JealousyMeter({ level, wohLadkiMentions }: Props) {
  const [animLevel, setAnimLevel] = useState(0);

  useEffect(() => {
    const timeout = setTimeout(() => setAnimLevel(level), 100);
    return () => clearTimeout(timeout);
  }, [level]);

  if (level === 0) return null;

  const color =
    level < 30 ? '#6366f1' :
    level < 60 ? '#f59e0b' :
    '#ef4444';

  const label =
    level < 30 ? 'Thodi si jealous 😒' :
    level < 60 ? 'Kaafi jealous 😤' :
    'DANGER ZONE 🔥';

  return (
    <div
      style={{
        position: 'fixed', top: '72px', right: '16px',
        background: 'rgba(5, 5, 12, 0.85)',
        backdropFilter: 'blur(16px)',
        border: `1px solid ${color}35`,
        borderRadius: '14px',
        padding: '10px 14px',
        zIndex: 50,
        minWidth: '170px',
        boxShadow: `0 4px 24px ${color}20`,
      }}
    >
      <p style={{ color: '#ffffff50', fontSize: '10px', margin: '0 0 6px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Naina's Jealousy
      </p>

      {/* Bar */}
      <div style={{ width: '100%', height: '3px', background: '#ffffff12', borderRadius: '2px', marginBottom: '8px', overflow: 'hidden' }}>
        <div style={{
          width: `${animLevel}%`, height: '100%', background: color,
          borderRadius: '2px', transition: 'width 0.6s ease',
          boxShadow: `0 0 6px ${color}`,
        }} />
      </div>

      <p style={{ color, fontSize: '11px', margin: '0 0 2px', fontWeight: 600 }}>{label}</p>

      {wohLadkiMentions > 0 && (
        <p style={{ color: '#ffffff35', fontSize: '10px', margin: 0 }}>
          "woh ladki" mentioned {wohLadkiMentions}×
        </p>
      )}
    </div>
  );
}
