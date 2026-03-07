// No-op dotenv shim for Cloudflare Workers.
// Workers use env bindings instead of .env files.

function config() {
  return { parsed: {} };
}

export { config };
export default { config };
