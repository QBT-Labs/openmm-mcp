// Minimal winston shim for Cloudflare Workers.
// The @3rd-eye-labs/openmm package uses winston for logging, but winston's
// Console transport relies on Node.js streams unavailable in Workers.

const noop = () => {};

const noopFormat = { transform: (info: Record<string, unknown>) => info };

const format = {
  combine: () => noopFormat,
  timestamp: () => noopFormat,
  colorize: () => noopFormat,
  printf: () => noopFormat,
  json: () => noopFormat,
};

class NoopTransport {
  constructor(_opts?: unknown) {}
}

const transports = {
  Console: NoopTransport,
  File: NoopTransport,
};

interface LoggerLike {
  error: typeof noop;
  warn: typeof noop;
  info: typeof noop;
  debug: typeof noop;
}

function createLogger(_opts?: unknown): LoggerLike {
  return { error: noop, warn: noop, info: noop, debug: noop };
}

export { format, transports, createLogger };
export default { format, transports, createLogger };
