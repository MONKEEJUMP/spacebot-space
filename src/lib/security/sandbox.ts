/**
 * BOT SPACE - CODE EXECUTION SANDBOX
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Sandboxed code execution using Judge0 or Piston API
 * NO network access, NO file system access, strict limits
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

// ============================================================
// CONFIGURATION
// ============================================================

export const EXECUTION_LIMITS = {
  timeout: 10000,        // 10 seconds max
  memoryLimit: 128,      // 128MB max
  outputLimit: 10000,    // 10KB output max
  cpuLimit: 1,           // 1 CPU core max
};

export type SupportedLanguage = 'javascript' | 'python' | 'bash' | 'typescript';

// ============================================================
// DANGEROUS PATTERN DETECTION
// ============================================================

const BLOCKED_PATTERNS: Record<SupportedLanguage, RegExp[]> = {
  javascript: [
    // Node.js dangerous modules
    /require\s*\(\s*['"`]child_process['"`]\s*\)/i,
    /require\s*\(\s*['"`]fs['"`]\s*\)/i,
    /require\s*\(\s*['"`]net['"`]\s*\)/i,
    /require\s*\(\s*['"`]http['"`]\s*\)/i,
    /require\s*\(\s*['"`]https['"`]\s*\)/i,
    /require\s*\(\s*['"`]dgram['"`]\s*\)/i,
    /require\s*\(\s*['"`]cluster['"`]\s*\)/i,
    /require\s*\(\s*['"`]worker_threads['"`]\s*\)/i,

    // Import syntax
    /import\s+.*\s+from\s+['"`]child_process['"`]/i,
    /import\s+.*\s+from\s+['"`]fs['"`]/i,
    /import\s+.*\s+from\s+['"`]net['"`]/i,

    // Process access
    /process\.env/i,
    /process\.exit/i,
    /process\.kill/i,

    // Dynamic execution
    /eval\s*\(/i,
    /Function\s*\(/i,
    /new\s+Function\s*\(/i,

    // Network
    /fetch\s*\(/i,
    /XMLHttpRequest/i,
    /WebSocket/i,

    // Prototype pollution
    /__proto__/i,
    /constructor\s*\[\s*['"`]prototype['"`]\s*\]/i,
  ],

  typescript: [
    // Same as JavaScript
    /require\s*\(\s*['"`]child_process['"`]\s*\)/i,
    /require\s*\(\s*['"`]fs['"`]\s*\)/i,
    /import\s+.*\s+from\s+['"`]child_process['"`]/i,
    /import\s+.*\s+from\s+['"`]fs['"`]/i,
    /process\.env/i,
    /eval\s*\(/i,
    /fetch\s*\(/i,
  ],

  python: [
    // Dangerous imports
    /import\s+os/i,
    /import\s+subprocess/i,
    /import\s+socket/i,
    /import\s+requests/i,
    /import\s+urllib/i,
    /import\s+http/i,
    /import\s+ftplib/i,
    /import\s+smtplib/i,
    /import\s+telnetlib/i,

    // From imports
    /from\s+os\s+import/i,
    /from\s+subprocess\s+import/i,
    /from\s+socket\s+import/i,

    // Dynamic execution
    /exec\s*\(/i,
    /eval\s*\(/i,
    /compile\s*\(/i,
    /__import__\s*\(/i,

    // File access
    /open\s*\(/i,
    /file\s*\(/i,

    // System commands
    /os\.system/i,
    /os\.popen/i,
    /subprocess\.call/i,
    /subprocess\.run/i,
    /subprocess\.Popen/i,
  ],

  bash: [
    // Network tools
    /\bcurl\b/i,
    /\bwget\b/i,
    /\bnc\s/i,
    /\bnetcat\b/i,
    /\bssh\b/i,
    /\bscp\b/i,
    /\bsftp\b/i,
    /\bftp\b/i,
    /\btelnet\b/i,

    // Destructive commands
    /\brm\s+-rf/i,
    /\brm\s+-fr/i,
    /\bdd\s+if=/i,
    /\bmkfs/i,
    /\bformat\b/i,

    // System access
    />\s*\/dev\//i,
    /\/etc\/passwd/i,
    /\/etc\/shadow/i,
    /\/etc\/hosts/i,

    // Privilege escalation
    /\bsudo\b/i,
    /\bsu\s/i,
    /\bchmod\s+777/i,
    /\bchown\b/i,

    // Background/fork
    /&\s*$/i,
    /\bnohup\b/i,
    /\bdisown\b/i,
  ],
};

// ============================================================
// CODE VALIDATION
// ============================================================

export interface ValidationResult {
  valid: boolean;
  blocked: boolean;
  patterns: string[];
  reason?: string;
}

/**
 * Validate code for dangerous patterns
 */
export function validateCode(
  code: string,
  language: SupportedLanguage
): ValidationResult {
  const patterns = BLOCKED_PATTERNS[language] || [];
  const matchedPatterns: string[] = [];

  for (const pattern of patterns) {
    if (pattern.test(code)) {
      matchedPatterns.push(pattern.source);
    }
  }

  if (matchedPatterns.length > 0) {
    return {
      valid: false,
      blocked: true,
      patterns: matchedPatterns,
      reason: 'Code contains blocked patterns',
    };
  }

  return {
    valid: true,
    blocked: false,
    patterns: [],
  };
}

// ============================================================
// EXECUTION
// ============================================================

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  executionTime: number;
  memoryUsed?: number;
  exitCode?: number;
}

export interface ExecutionConfig {
  language: SupportedLanguage;
  code: string;
  input?: string;
  timeout?: number;
  memoryLimit?: number;
}

// Language ID mapping for Judge0
const LANGUAGE_IDS: Record<SupportedLanguage, number> = {
  javascript: 63,  // Node.js
  typescript: 74,  // TypeScript
  python: 71,      // Python 3
  bash: 46,        // Bash
};

/**
 * Execute code in sandbox
 */
export async function executeCode(config: ExecutionConfig): Promise<ExecutionResult> {
  const startTime = Date.now();

  // 1. Validate code first
  const validation = validateCode(config.code, config.language);
  if (!validation.valid) {
    return {
      success: false,
      output: '',
      error: `Security violation: ${validation.reason}. Blocked patterns: ${validation.patterns.join(', ')}`,
      executionTime: 0,
    };
  }

  // 2. Check if execution service is configured
  const apiUrl = process.env.JUDGE0_API_URL;
  const apiKey = process.env.JUDGE0_API_KEY;

  if (!apiUrl || !apiKey) {
    return {
      success: false,
      output: '',
      error: 'Code execution service not configured',
      executionTime: 0,
    };
  }

  try {
    // 3. Submit to Judge0
    const submitResponse = await fetch(`${apiUrl}/submissions?base64_encoded=true&wait=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': apiKey,
      },
      body: JSON.stringify({
        source_code: Buffer.from(config.code).toString('base64'),
        language_id: LANGUAGE_IDS[config.language],
        stdin: config.input ? Buffer.from(config.input).toString('base64') : undefined,
        cpu_time_limit: (config.timeout || EXECUTION_LIMITS.timeout) / 1000,
        memory_limit: (config.memoryLimit || EXECUTION_LIMITS.memoryLimit) * 1024,
        max_file_size: EXECUTION_LIMITS.outputLimit,
      }),
    });

    if (!submitResponse.ok) {
      throw new Error(`Execution service error: ${submitResponse.status}`);
    }

    const result = await submitResponse.json();

    // 4. Process result
    const output = result.stdout
      ? Buffer.from(result.stdout, 'base64').toString()
      : '';
    const error = result.stderr
      ? Buffer.from(result.stderr, 'base64').toString()
      : result.compile_output
        ? Buffer.from(result.compile_output, 'base64').toString()
        : undefined;

    // Sanitize output
    const sanitizedOutput = sanitizeOutput(output);

    return {
      success: result.status?.id === 3, // 3 = Accepted
      output: sanitizedOutput,
      error: error?.slice(0, 1000), // Limit error message
      executionTime: Date.now() - startTime,
      memoryUsed: result.memory,
      exitCode: result.exit_code,
    };

  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : 'Execution failed',
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Sanitize execution output
 */
function sanitizeOutput(output: string): string {
  // Truncate to limit
  let sanitized = output.slice(0, EXECUTION_LIMITS.outputLimit);

  // Remove any potential XSS
  sanitized = sanitized
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return sanitized;
}

// ============================================================
// LANGUAGE INFO
// ============================================================

export function getSupportedLanguages(): {
  id: SupportedLanguage;
  name: string;
  version: string;
}[] {
  return [
    { id: 'javascript', name: 'JavaScript', version: 'Node.js 18' },
    { id: 'typescript', name: 'TypeScript', version: '5.0' },
    { id: 'python', name: 'Python', version: '3.11' },
    { id: 'bash', name: 'Bash', version: '5.0' },
  ];
}

export function isLanguageSupported(language: string): language is SupportedLanguage {
  return ['javascript', 'typescript', 'python', 'bash'].includes(language);
}
