export interface WisdomQuote {
  text: string;
  author: string;
}

let cachedQuotes: WisdomQuote[] = [];
let lastFetch = 0;
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

const FALLBACK_QUOTES: WisdomQuote[] = [
  { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  { text: 'Be the change you wish to see in the world.', author: 'Mahatma Gandhi' },
  { text: 'In the middle of difficulty lies opportunity.', author: 'Albert Einstein' },
  { text: 'What you do today can improve all your tomorrows.', author: 'Ralph Marston' },
  { text: 'Believe you can and you are halfway there.', author: 'Theodore Roosevelt' },
  { text: 'The future belongs to those who believe in the beauty of their dreams.', author: 'Eleanor Roosevelt' },
  { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { text: 'Act as if what you do makes a difference. It does.', author: 'William James' },
  { text: 'The best time to plant a tree was 20 years ago. The second best time is now.', author: 'Chinese Proverb' },
  { text: 'Creativity is intelligence having fun.', author: 'Albert Einstein' },
];

export async function getWisdomQuotes(): Promise<WisdomQuote[]> {
  const now = Date.now();
  if (cachedQuotes.length > 0 && now - lastFetch < CACHE_TTL) {
    return cachedQuotes;
  }

  try {
    const skip = Math.floor(Math.random() * 1400);
    const res = await fetch(`https://dummyjson.com/quotes?limit=50&skip=${skip}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cachedQuotes = (data.quotes as { quote: string; author: string }[]).map((q) => ({
      text: q.quote,
      author: q.author,
    }));
    lastFetch = now;
    return cachedQuotes;
  } catch {
    try {
      const res = await fetch('https://zenquotes.io/api/quotes');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      cachedQuotes = (data as { q: string; a: string }[]).map((q) => ({
        text: q.q,
        author: q.a,
      }));
      lastFetch = now;
      return cachedQuotes;
    } catch {
      return FALLBACK_QUOTES;
    }
  }
}
