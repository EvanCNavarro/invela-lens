// Simplified ULID generator for Cloudflare Workers
export function ulid(): string {
  const t = Date.now().toString(36).padStart(10, '0');
  const r = Array.from(crypto.getRandomValues(new Uint8Array(10)))
    .map(b => b.toString(36).padStart(2, '0').slice(-1))
    .join('');
  return (t + r).toUpperCase().slice(0, 26);
}
