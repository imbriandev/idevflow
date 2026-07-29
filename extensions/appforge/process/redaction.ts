const INLINE_PATTERNS: readonly RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
];

export function containsSensitiveText(value: string): boolean {
  return (
    /\bBearer\s+[A-Za-z0-9._~+/=-]+/i.test(value) ||
    /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/i.test(value) ||
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(value) ||
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(value)
  );
}

export function redactText(value: string): string {
  let redacted = value;
  for (const pattern of INLINE_PATTERNS) redacted = redacted.replace(pattern, "[REDACTED]");
  return redacted;
}

export class StreamingRedactor {
  private pending = "";
  private privateKey = false;

  push(chunk: string): string {
    this.pending += chunk;
    const lines = this.pending.split("\n");
    this.pending = lines.pop() ?? "";
    let output = lines.map((line) => this.redactLine(line)).join("\n") + (lines.length ? "\n" : "");
    if (this.pending.length > 128 * 1024) {
      const safePrefix = this.pending.slice(0, -512);
      this.pending = this.pending.slice(-512);
      output += this.redactLine(safePrefix);
    }
    return output;
  }

  flush(): string {
    const value = this.pending ? this.redactLine(this.pending) : "";
    this.pending = "";
    return value;
  }

  private redactLine(line: string): string {
    if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(line)) {
      this.privateKey = true;
      return "[REDACTED PRIVATE KEY]";
    }
    if (this.privateKey) {
      if (/-----END [A-Z0-9 ]*PRIVATE KEY-----/.test(line)) this.privateKey = false;
      return "[REDACTED PRIVATE KEY]";
    }
    return redactText(line);
  }
}
