export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

export function sendNotification(title: string, body: string): void {
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
}

export function scheduleReminder(message: string, delayMinutes: number): void {
  const delayMs = delayMinutes * 60 * 1000;
  setTimeout(() => {
    sendNotification('Naina yaad dila rahi hai 💜', message);
  }, delayMs);
}

// Parse [REMINDER:30:drink water] from Naina's response
export function parseAndScheduleReminders(text: string): string {
  return text.replace(/\[REMINDER:(\d+):([^\]]+)\]/g, (_match, mins, msg) => {
    scheduleReminder(msg, parseInt(mins));
    return `(reminder set for ${mins} minute${parseInt(mins) !== 1 ? 's' : ''})`;
  });
}

// Parse [WEATHER:city] tags — returns cleaned text + cities requested
export function parseWeatherTags(text: string): { cleaned: string; cities: string[] } {
  const cities: string[] = [];
  const cleaned = text.replace(/\[WEATHER:([^\]]+)\]/g, (_match, city) => {
    cities.push(city.trim());
    return `[fetching weather for ${city}...]`;
  });
  return { cleaned, cities };
}
