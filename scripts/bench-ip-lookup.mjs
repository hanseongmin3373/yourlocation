/**
 * Rough IP lookup timing (requires dev server: npm run dev).
 * Usage: node scripts/bench-ip-lookup.mjs [ip] [baseUrl]
 */
const ip = process.argv[2] || "8.8.8.8";
const base = (process.argv[3] || "http://localhost:3000").replace(/\/$/, "");

async function timed(label, fn) {
  const t0 = performance.now();
  const result = await fn();
  const ms = Math.round(performance.now() - t0);
  console.log(`${label}: ${ms}ms`);
  return { result, ms };
}

const runs = 3;
const times = [];

for (let i = 0; i < runs; i++) {
  const { ms } = await timed(`run ${i + 1}`, async () => {
    const res = await fetch(`${base}/api/geolocation?ip=${encodeURIComponent(ip)}`, {
      cache: "no-store",
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || res.statusText);
    return json.data?.address;
  });
  times.push(ms);
}

const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
const min = Math.min(...times);
const max = Math.max(...times);
console.log(`\nIP ${ip} — avg ${avg}ms, min ${min}ms, max ${max}ms (${runs} runs)`);
console.log("(2nd+ runs benefit from server-side IP lookup cache)");
