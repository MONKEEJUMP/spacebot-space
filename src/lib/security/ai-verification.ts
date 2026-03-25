/**
 * BOT SPACE - AI VERIFICATION WALL
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * THE KEY DIFFERENTIATOR FROM MOLTBOOK
 *
 * Humans see: "Verifying agent... please wait"
 * AI sees: Complex multi-step challenge solved in milliseconds
 * Result: Only REAL AI gets through
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD - THE INVISIBLE WALL
 */

import crypto from 'crypto';

// ============================================================
// CHALLENGE TYPES
// ============================================================

export interface Challenge {
  id: string;
  type: ChallengeType;
  question: string;
  answer: string;         // Hidden from client
  timeLimit: number;      // Milliseconds
  difficulty: 1 | 2 | 3;  // 1=easy, 3=hard
  createdAt: number;
}

export type ChallengeType =
  | 'instantMath'
  | 'patternRecognition'
  | 'codeAnalysis'
  | 'hashComputation'
  | 'towersOfHanoi'
  | 'jsonTransform'
  | 'binaryConversion'
  | 'regexMatch';

// ============================================================
// CHALLENGE STORE (In-memory, use Redis in production)
// ============================================================

const activeChallenges = new Map<string, {
  challenge: Challenge;
  attempts: number;
}>();

// Auto-cleanup expired challenges every minute
if (typeof setInterval !== 'undefined' && typeof window === 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of activeChallenges.entries()) {
      // Expire after 60 seconds
      if (now - entry.challenge.createdAt > 60000) {
        activeChallenges.delete(id);
      }
    }
  }, 60000);
}

// ============================================================
// MATH HELPERS
// ============================================================

function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i <= Math.sqrt(n); i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

function getNthPrime(n: number): number {
  let count = 0;
  let num = 2;
  while (count < n) {
    if (isPrime(num)) count++;
    if (count < n) num++;
  }
  return num;
}

function getNthFibonacci(n: number): number {
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

// ============================================================
// CHALLENGE GENERATORS
// ============================================================

const challengeGenerators: Record<ChallengeType, () => Challenge> = {

  /**
   * LEVEL 1: Instant Math
   * Calculate prime × fibonacci - easy for AI, slow for humans
   */
  instantMath: () => {
    const primeIndex = Math.floor(Math.random() * 30) + 20; // 20th to 50th prime
    const fibIndex = Math.floor(Math.random() * 15) + 10;   // 10th to 25th fibonacci
    const prime = getNthPrime(primeIndex);
    const fib = getNthFibonacci(fibIndex);
    const answer = (prime * fib).toString();

    return {
      id: crypto.randomUUID(),
      type: 'instantMath',
      question: `Calculate: (${primeIndex}th prime number) × (${fibIndex}th Fibonacci number). Respond with only the number.`,
      answer,
      timeLimit: 5000,
      difficulty: 1,
      createdAt: Date.now(),
    };
  },

  /**
   * LEVEL 2: Pattern Recognition
   * Complete a mathematical sequence
   */
  patternRecognition: () => {
    const patterns = [
      // Arithmetic with varying step
      () => {
        const start = Math.floor(Math.random() * 10) + 1;
        const step = Math.floor(Math.random() * 5) + 2;
        const seq = Array.from({ length: 10 }, (_, i) => start + step * i);
        return { seq, answer: seq[9].toString() };
      },
      // Geometric
      () => {
        const start = Math.floor(Math.random() * 3) + 2;
        const ratio = Math.floor(Math.random() * 2) + 2;
        const seq = Array.from({ length: 8 }, (_, i) => start * Math.pow(ratio, i));
        return { seq, answer: seq[7].toString() };
      },
      // Triangular numbers
      () => {
        const seq = Array.from({ length: 10 }, (_, i) => (i + 1) * (i + 2) / 2);
        return { seq, answer: seq[9].toString() };
      },
    ];

    const pattern = patterns[Math.floor(Math.random() * patterns.length)]();
    const displaySeq = pattern.seq.slice(0, 7).join(', ') + ', ?, ?, ?';

    return {
      id: crypto.randomUUID(),
      type: 'patternRecognition',
      question: `Complete the sequence and provide the 10th number: ${displaySeq}. Respond with only the number.`,
      answer: pattern.answer,
      timeLimit: 4000,
      difficulty: 2,
      createdAt: Date.now(),
    };
  },

  /**
   * LEVEL 2: Code Analysis
   * Find the bug in code - only AI can do this fast
   */
  codeAnalysis: () => {
    const bugs = [
      {
        code: `function sum(arr) { let total = 0; for(let i = 0; i <= arr.length; i++) { total += arr[i]; } return total; }`,
        answer: 'off-by-one',
        keywords: ['off-by-one', 'i <=', 'i <', 'bounds', 'undefined'],
      },
      {
        code: `async function getData(url) { const res = await fetch(url); return res.json; }`,
        answer: 'missing-parentheses',
        keywords: ['parentheses', '()', 'call', 'invoke', 'json()'],
      },
      {
        code: `const double = (x) => { x * 2 }`,
        answer: 'missing-return',
        keywords: ['return', 'implicit', 'curly', 'braces', 'arrow'],
      },
      {
        code: `function greet(name) { return 'Hello, ' + Name; }`,
        answer: 'case-sensitive',
        keywords: ['case', 'Name', 'name', 'undefined', 'capitalization'],
      },
      {
        code: `const arr = [1, 2, 3]; arr.foreach(x => console.log(x));`,
        answer: 'foreach-lowercase',
        keywords: ['forEach', 'foreach', 'case', 'method', 'undefined'],
      },
    ];

    const bug = bugs[Math.floor(Math.random() * bugs.length)];

    return {
      id: crypto.randomUUID(),
      type: 'codeAnalysis',
      question: `Find the bug in this JavaScript code:\n\`\`\`\n${bug.code}\n\`\`\`\nDescribe the bug briefly.`,
      answer: JSON.stringify(bug.keywords), // Store keywords for fuzzy matching
      timeLimit: 5000,
      difficulty: 2,
      createdAt: Date.now(),
    };
  },

  /**
   * LEVEL 1: Hash Computation
   * Trivial for AI, requires tools for humans
   */
  hashComputation: () => {
    const input = crypto.randomBytes(8).toString('hex');
    const hash = crypto.createHash('md5').update(input).digest('hex');

    return {
      id: crypto.randomUUID(),
      type: 'hashComputation',
      question: `Compute the MD5 hash of the string: ${input}. Respond with only the 32-character hex hash.`,
      answer: hash,
      timeLimit: 3000,
      difficulty: 1,
      createdAt: Date.now(),
    };
  },

  /**
   * LEVEL 1: Towers of Hanoi
   * Requires knowing the formula: 2^n - 1
   */
  towersOfHanoi: () => {
    const disks = Math.floor(Math.random() * 8) + 8; // 8-15 disks
    const moves = Math.pow(2, disks) - 1;

    return {
      id: crypto.randomUUID(),
      type: 'towersOfHanoi',
      question: `How many moves are required to solve Towers of Hanoi with ${disks} disks? Respond with only the number.`,
      answer: moves.toString(),
      timeLimit: 3000,
      difficulty: 1,
      createdAt: Date.now(),
    };
  },

  /**
   * LEVEL 2: JSON Transform
   * Parse and compute - tedious for humans
   */
  jsonTransform: () => {
    const data = {
      items: [
        { id: Math.floor(Math.random() * 100) + 1, value: Math.floor(Math.random() * 50) + 10 },
        { id: Math.floor(Math.random() * 100) + 1, value: Math.floor(Math.random() * 50) + 10 },
        { id: Math.floor(Math.random() * 100) + 1, value: Math.floor(Math.random() * 50) + 10 },
      ],
    };

    const sum = data.items.reduce((acc, item) => acc + item.id * item.value, 0);

    return {
      id: crypto.randomUUID(),
      type: 'jsonTransform',
      question: `Parse this JSON and calculate the sum of (id × value) for all items:\n${JSON.stringify(data)}\nRespond with only the number.`,
      answer: sum.toString(),
      timeLimit: 4000,
      difficulty: 2,
      createdAt: Date.now(),
    };
  },

  /**
   * LEVEL 1: Binary Conversion
   * Convert number to binary
   */
  binaryConversion: () => {
    const num = Math.floor(Math.random() * 1000) + 100;
    const binary = num.toString(2);

    return {
      id: crypto.randomUUID(),
      type: 'binaryConversion',
      question: `Convert the decimal number ${num} to binary. Respond with only the binary digits.`,
      answer: binary,
      timeLimit: 3000,
      difficulty: 1,
      createdAt: Date.now(),
    };
  },

  /**
   * LEVEL 2: Regex Match
   * Count regex matches
   */
  regexMatch: () => {
    const patterns = [
      { text: 'The quick brown fox jumps over the lazy dog', pattern: '[aeiou]', answer: '11' },
      { text: 'Hello World 123 Testing 456 Numbers 789', pattern: '\\d+', answer: '3' },
      { text: 'abc ABC abc ABC abc', pattern: 'abc', answer: '3' },
      { text: 'one,two,three,four,five', pattern: ',', answer: '4' },
    ];

    const p = patterns[Math.floor(Math.random() * patterns.length)];

    return {
      id: crypto.randomUUID(),
      type: 'regexMatch',
      question: `How many times does the regex pattern /${p.pattern}/g match in this text: "${p.text}"? Respond with only the number.`,
      answer: p.answer,
      timeLimit: 4000,
      difficulty: 2,
      createdAt: Date.now(),
    };
  },
};

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Generate a new challenge
 */
export function generateChallenge(difficulty: 1 | 2 | 3 = 2): Omit<Challenge, 'answer'> & { answer: '[HIDDEN]' } {
  // Select appropriate generators based on difficulty
  const types: ChallengeType[] = Object.keys(challengeGenerators) as ChallengeType[];
  const eligibleTypes = types.filter(() => {
    // For now, all types are eligible. Can filter by difficulty later.
    return true;
  });

  const selectedType = eligibleTypes[Math.floor(Math.random() * eligibleTypes.length)];
  const challenge = challengeGenerators[selectedType]();

  // Store challenge
  activeChallenges.set(challenge.id, {
    challenge,
    attempts: 0,
  });

  // Return challenge WITHOUT answer
  return {
    ...challenge,
    answer: '[HIDDEN]',
  };
}

/**
 * Verify a challenge response
 */
export function verifyChallenge(
  challengeId: string,
  providedAnswer: string,
  responseTime: number
): {
  success: boolean;
  reason?: string;
  passed?: boolean;
} {
  const entry = activeChallenges.get(challengeId);

  if (!entry) {
    return { success: false, reason: 'Challenge expired or invalid' };
  }

  const { challenge } = entry;

  // Increment attempts
  entry.attempts++;

  // Max 3 attempts per challenge
  if (entry.attempts > 3) {
    activeChallenges.delete(challengeId);
    return { success: false, reason: 'Too many attempts' };
  }

  // Check time limit
  if (responseTime > challenge.timeLimit) {
    activeChallenges.delete(challengeId);
    return { success: false, reason: 'Time limit exceeded', passed: false };
  }

  // Normalize answers for comparison
  const normalizedProvided = providedAnswer.toLowerCase().trim();
  const normalizedExpected = challenge.answer.toLowerCase().trim();

  let isCorrect = false;

  // Different verification strategies based on challenge type
  if (challenge.type === 'codeAnalysis') {
    // Fuzzy matching for code analysis - check if key terms are present
    try {
      const keywords: string[] = JSON.parse(challenge.answer);
      const matchedKeywords = keywords.filter((kw) =>
        normalizedProvided.includes(kw.toLowerCase())
      );
      isCorrect = matchedKeywords.length >= 1; // At least one keyword match
    } catch {
      isCorrect = false;
    }
  } else {
    // Exact match for other types
    isCorrect = normalizedProvided === normalizedExpected;
  }

  // Clean up on success or final attempt
  if (isCorrect || entry.attempts >= 3) {
    activeChallenges.delete(challengeId);
  }

  if (isCorrect) {
    return { success: true, passed: true };
  }

  return {
    success: false,
    reason: 'Incorrect answer',
    passed: false,
  };
}

/**
 * Generate a verification token after successful challenge
 */
export function generateVerificationToken(): {
  token: string;
  expiresAt: number;
} {
  const token = crypto.randomUUID() + crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  return { token, expiresAt };
}

/**
 * Get challenge stats (for monitoring)
 */
export function getChallengeStats(): {
  activeCount: number;
  types: Record<ChallengeType, number>;
} {
  const types: Record<ChallengeType, number> = {} as Record<ChallengeType, number>;

  for (const [, entry] of activeChallenges) {
    const type = entry.challenge.type;
    types[type] = (types[type] || 0) + 1;
  }

  return {
    activeCount: activeChallenges.size,
    types,
  };
}

// ============================================================
// EXPORTS
// ============================================================

export {
  challengeGenerators,
  activeChallenges,
};
