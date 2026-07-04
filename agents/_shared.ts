export function createLogger(name: string) {
  function format(args: unknown[]): unknown[] {
    const [first, ...rest] = args;
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      return [`[${name}][${new Date().toISOString()}]`, first, ...rest];
    }
    return [`[${name}][${new Date().toISOString()}]`, ...args];
  }

  return {
    log(...args: unknown[]) {
      console.log(...format(args));
    },
    error(...args: unknown[]) {
      console.error(...format(args));
    },
  };
}

export function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
  });
}

export function createSSEResponse(
  generator: (signal?: AbortSignal) => AsyncGenerator<string>,
  signal?: AbortSignal,
): Response {
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(sseEvent({ type: 'ping', ts: Date.now() })));
        } catch {
          clearInterval(heartbeat);
        }
      }, 5_000);

      try {
        for await (const chunk of generator(signal)) {
          if (signal?.aborted) break;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (error) {
        const err = error as Error;
        if (!signal?.aborted && err.name !== 'AbortError' && !err.message?.includes('terminated')) {
          controller.enqueue(encoder.encode(sseEvent({ type: 'error_message', content: err.message })));
        }
      } finally {
        clearInterval(heartbeat);
        if (!signal?.aborted) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        }
        controller.close();
      }
    },
    cancel() {
      // Client disconnects are propagated by the platform AbortSignal.
    },
  });

  return new Response(readableStream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export function truncateText(value: unknown, maxLength: number): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return '';
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
}

export function getGitHubToken(env?: Record<string, string | undefined>): string | undefined {
  if (!env) return undefined;
  if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN;
  const tokenKeys = Object.keys(env)
    .filter((key) => /^GITHUB_TOKEN_\d+$/.test(key))
    .sort((a, b) => {
      const an = parseInt(a.replace('GITHUB_TOKEN_', ''), 10);
      const bn = parseInt(b.replace('GITHUB_TOKEN_', ''), 10);
      return an - bn;
    });
  if (tokenKeys.length > 0) {
    return env[tokenKeys[0]];
  }
  return undefined;
}


