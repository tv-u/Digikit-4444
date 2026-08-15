// worker.js – Enterprise Cloudflare Worker for Quantum Cognitive Engine
// Provides static asset serving, SPA fallback, security headers,
// caching, compression, rate limiting, and optional API proxy.

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const origin = env.ORIGIN || 'https://example.github.io'; // set in dashboard or wrangler.toml

    // ---------- Rate limiting (per IP) ----------
    if (env.RATE_LIMIT_ENABLED === 'true') {
      const ip = request.headers.get('CF-Connecting-IP') || 'anonymous';
      const rateLimitKey = `rate:${ip}`;
      const window = parseInt(env.RATE_LIMIT_WINDOW) || 60; // seconds
      const maxRequests = parseInt(env.RATE_LIMIT_MAX) || 300;
      const current = await env.RATE_LIMITER.get(rateLimitKey);
      const count = current ? parseInt(current) : 0;
      if (count >= maxRequests) {
        return new Response('Too many requests', { status: 429 });
      }
      ctx.waitUntil(env.RATE_LIMITER.put(rateLimitKey, String(count + 1), { expirationTtl: window }));
    }

    // ---------- Static asset request ----------
    if (pathname.match(/\.(js|css|svg|png|jpg|jpeg|gif|ico|woff2?|ttf|eot|json|xml|txt|webmanifest)$/i)) {
      return serveStatic(request, url, origin, env);
    }

    // ---------- API proxy (placeholder) ----------
    if (pathname.startsWith('/api/')) {
      return handleApiProxy(request, url, env);
    }

    // ---------- SPA fallback: serve index.html ----------
    const response = await fetch(`${origin}/index.html`, {
      method: request.method,
      headers: request.headers,
      redirect: 'follow'
    });

    return addSecurityHeaders(response, 'html', env);
  }
};

async function serveStatic(request, url, origin, env) {
  // Fetch from origin
  const response = await fetch(`${origin}${url.pathname}${url.search}`, {
    method: request.method,
    headers: request.headers,
    redirect: 'follow'
  });

  if (!response.ok && response.status !== 304) {
    return new Response('Not Found', { status: 404 });
  }

  // Clone to add security & caching headers
  const headers = new Headers(response.headers);
  if (env.CACHE_STATIC !== 'false') {
    const ttl = parseInt(env.CACHE_TTL_STATIC) || 86400;
    headers.set('Cache-Control', `public, max-age=${ttl}, immutable`);
    headers.set('CDN-Cache-Control', `max-age=${ttl}`);
  }

  const finalResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });

  return addSecurityHeaders(finalResponse, 'static', env);
}

function addSecurityHeaders(response, type, env) {
  const headers = new Headers(response.headers);

  // Security headers (can be overridden via env)
  const securityHeaders = {
    'Strict-Transport-Security': env.STS || 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': env.X_FRAME_OPTIONS || 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': env.PERMISSIONS_POLICY || 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  };
  for (const [key, value] of Object.entries(securityHeaders)) {
    headers.set(key, value);
  }

  // Content-Security-Policy (strict but allows inline scripts/styles needed by the SPA)
  const csp = env.CSP || "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';";
  headers.set('Content-Security-Policy', csp.replace(/\s+/g, ' '));

  // HTML specific
  if (type === 'html') {
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    headers.set('Content-Type', 'text/html; charset=utf-8');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function handleApiProxy(request, url, env) {
  // Placeholder for future API proxy logic
  return new Response(JSON.stringify({ error: 'API not implemented' }), {
    status: 501,
    headers: { 'Content-Type': 'application/json' }
  });
}
