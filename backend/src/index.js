import { sign, verify } from '@tsndr/cloudflare-worker-jwt';

// SECURITY NOTE:
// API keys are NOT stored in any local file or .env.
// All API keys are managed via Cloudflare KV storage.
// The /ai/save-key endpoint is the only way to update keys from the UI.
// Ensure this endpoint is protected if needed.
// ===== Auth helpers =====
// Uses JWT if `ADMIN_JWT_SECRET` is set in Worker env, otherwise falls back
// to a static admin token `ADMIN_API_TOKEN` for simple setups.
async function verifyTokenString(token, env) {
  if (!token) return false
  try {
    // Prefer ADMIN_JWT_SECRET (production). If not available (dev), fall back to JWT_SECRET for verification.
    const secret = (env && (env.ADMIN_JWT_SECRET || env.JWT_SECRET)) || null
    if (secret) {
      const decoded = await verify(token, secret)
      if (decoded && typeof decoded === 'object' && decoded.exp) {
        const now = Math.floor(Date.now() / 1000)
        if (typeof decoded.exp === 'number' && decoded.exp < now) return false
      }
      return true
    }

    // Legacy: allow static admin token when explicitly configured (ADMIN_API_TOKEN)
    if (env && env.ADMIN_API_TOKEN) {
      return String(token) === String(env.ADMIN_API_TOKEN)
    }
    return false
  } catch (e) {
    return false
  }
}

function getTokenFromRequest(request) {
  try {
    // Only accept token from Authorization header (Bearer)
    const auth = request.headers.get('Authorization') || ''
    if (auth && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim()
  } catch (e) { }
  return null
}

async function requireAuth(request, env) {
  const token = getTokenFromRequest(request)
  return await verifyTokenString(token, env)
}

// Create a signed JWT (returns token string) — requires ADMIN_JWT_SECRET
async function createSignedToken(payload, env, opts = {}) {
  // Use ADMIN_JWT_SECRET as canonical signing secret (production).
  // For dev convenience, fall back to JWT_SECRET if ADMIN_JWT_SECRET is not present.
  const secret = (env && (env.ADMIN_JWT_SECRET || env.JWT_SECRET)) || null
  if (!secret) return null
  try {
    // JWT expiry: 60 minutes (per project standard)
    const minutes = 60
    const nowSec = Math.floor(Date.now() / 1000)
    const exp = nowSec + Math.max(60, Math.min(60 * 24 * 60, Math.floor(minutes) * 60)) // clamp 1min..1440min (safety)
    const payloadWithExp = Object.assign({}, payload, { iat: nowSec, exp })
    const token = await sign(payloadWithExp, secret)
    return token
  } catch (e) {
    return null
  }
}
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url)

      // CORS preflight
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: corsHeaders(request, env)
        })
      }

    // Authentication removed: the legacy /auth/login endpoint and JWT protection
    // for /ai and /presets have been disabled so the frontend can operate
    // without requiring a login token. If you want to re-enable auth later,
    // restore the previous handler and verification logic.

    if (url.pathname === "/ai/summarize" && request.method === "POST") {
      try {
        // require admin auth to call summarize
        if (!await requireAuth(request, env)) return json({ error: 'Unauthorized' }, 401, request, env)
        const body = await request.json()
        const { provider, apiKey: clientApiKey, prompt, model } = body

        if (!provider || !prompt) {
          return json({ error: "Missing parameters: provider and prompt are required" }, 400, request, env)
        }
        // Resolve API key: env/KV, atau client key hanya jika origin lokal (dev)
        const { key: apiKey, source } = await resolveApiKey(provider, clientApiKey, env, request)
        if (source === 'client-not-allowed') return json({ error: 'Client-supplied API keys are not allowed' }, 400, request, env)
        if (source === 'kv-error') return json({ error: 'Error reading keys from KV' }, 500, request, env)
        if (!apiKey) return json({ error: 'Missing API key for provider on server (env or KV)', source }, 500, request, env)

        let result

        if (provider === "gemini") {
          result = await callGemini(apiKey, prompt, model)
        }

        if (provider === "openai") {
          result = await callOpenAI(apiKey, prompt, model)
        }

        if (provider === "openrouter") {
          result = await callOpenRouter(apiKey, prompt, model)
        }

        if (provider === "groq") {
          result = await callGroq(apiKey, prompt, model)
        }

        if (provider === "together") {
          result = await callTogether(apiKey, prompt, model)
        }

        if (provider === "cohere") {
          result = await callCohere(apiKey, prompt, model)
        }

        if (provider === "huggingface") {
          result = await callHuggingFace(apiKey, prompt, model)
        }

        if (provider === "deepseek") {
          result = await callDeepSeek(apiKey, prompt, model)
        }

        if (!result) {
          return json({ error: `Unsupported provider or empty result: ${provider}` }, 400, request, env)
        }

        return json({ result }, 200, request, env)
      } catch (err) {
        // Log provider/internal error details for operator debugging (do NOT leak secrets to clients)
        try {
          console.error('[/ai/summarize] provider error:', {
            message: String(err.message || err),
            status: err._provider_status || err.status || null,
            provider: err._provider || provider,
            providerDataSummary: err._provider_data ? '[REDACTED]' : undefined,
            stack: err.stack
          })
        } catch (loggingErr) {
          console.error('[/ai/summarize] failed to log provider error:', loggingErr)
        }

        // Friendly hint for region-related failures to surface to the client
        const lower = String(err.message || '').toLowerCase()
        if (lower.includes('country') || lower.includes('region') || lower.includes('territory')) {
          return json({ error: 'Provider rejected request due to country/region restriction. Check API key application restrictions and provider account region.' }, 500, request, env)
        }

        return json({ error: err.message || 'Provider error' }, 500, request, env)
      }
    }

    // List available models for a provider (useful for debugging keys / permissions)
    // Usage: GET /ai/models?provider=gemini&apiKey=XXXX (legacy)
    //        POST /ai/models { provider, apiKey } (recommended - safer, key not in URL)
    if (url.pathname === "/ai/models" && (request.method === "GET" || request.method === "POST")) {
      try {
        let provider = ""
        let clientApiKey = ""
        
        if (request.method === "POST") {
          // POST method: safer, key in body
          try {
            const body = await request.json()
            provider = body.provider || ""
            clientApiKey = body.apiKey || ""
          } catch (e) {
            return json({ error: "Invalid JSON body" }, 400, request, env)
          }
        } else {
          // GET method: legacy support, key in query param
          provider = url.searchParams.get("provider") || ""
          clientApiKey = url.searchParams.get("apiKey") || ""
        }
        
        // Validate inputs
        if (!provider) return json({ error: "Missing parameters: provider is required" }, 400, request, env)
        
        const providerKeyName = `AI_API_KEY_${String(provider).toUpperCase()}`
        const apiKey = String(clientApiKey || env.AI_API_KEY || env[providerKeyName] || '').trim()
        
        if (!apiKey) {
          return json({ 
            error: 'Missing API key. Provide apiKey in body/query or set AI_API_KEY / AI_API_KEY_<PROVIDER> in server env' 
          }, 400, request, env)
        }

        if (provider === "gemini") {
          const models = await listGeminiModels(apiKey)
          return json({ provider, models }, 200, request, env)
        }

        if (provider === "openai") {
          const models = await listOpenAIModels(apiKey)
          return json({ provider, models }, 200, request, env)
        }

        if (provider === "openrouter") {
          const models = await listOpenRouterModels(apiKey)
          return json({ provider, models }, 200, request, env)
        }

        if (provider === "groq") {
          const models = await listGroqModels(apiKey)
          return json({ provider, models }, 200, request, env)
        }

        if (provider === "together") {
          const models = await listTogetherModels(apiKey)
          return json({ provider, models }, 200, request, env)
        }

        if (provider === "cohere") {
          const models = await listCohereModels(apiKey)
          return json({ provider, models }, 200, request, env)
        }

        if (provider === "huggingface") {
          const models = await listHuggingFaceModels(apiKey)
          return json({ provider, models }, 200, request, env)
        }

        if (provider === "deepseek") {
          const models = await listDeepSeekModels(apiKey)
          return json({ provider, models }, 200, request, env)
        }

        return json({ error: `Unsupported provider: ${provider}` }, 400, request, env)
      } catch (err) {
        console.error('[/ai/models] error:', err)
        // Better error messages untuk common issues
        const errorMsg = String(err.message || '').toLowerCase()
        
        // Detect API key errors (common keywords from different providers)
        if (errorMsg.includes('401') || 
            errorMsg.includes('unauthorized') || 
            errorMsg.includes('invalid') || 
            errorMsg.includes('api key') ||
            errorMsg.includes('authentication') ||
            errorMsg.includes('forbidden')) {
          return json({ error: `Invalid API key: ${err.message}` }, 500, request, env)
        }
        
        // Detect rate limit errors
        if (errorMsg.includes('429') || 
            errorMsg.includes('rate limit') ||
            errorMsg.includes('too many requests') ||
            errorMsg.includes('quota')) {
          return json({ error: `Rate limit exceeded: ${err.message}` }, 429, request, env)
        }
        
        return json({ error: err.message }, 500, request, env)
      }
    }

    // Save API key to storage (Cloudflare KV) - requires KV binding `KV_KEYS`
    // POST /ai/save-key  { provider, apiKey }
    if (url.pathname === "/ai/save-key" && request.method === "POST") {
      try {
        // require authentication for saving keys
        if (!await requireAuth(request, env)) return json({ error: 'Unauthorized' }, 401, request, env)
        const body = await request.json()
        const { provider, apiKey } = body
        if (!provider || !apiKey) return json({ error: 'Missing provider or apiKey' }, 400, request, env)
        const keyName = `key:${String(provider)}`

        if (env.KV_KEYS) {
          await env.KV_KEYS.put(keyName, String(apiKey))
          return json({ ok: true, kvBound: true }, 200, request, env)
        }
        return json({ error: 'KV_KEYS not bound in this runtime. Bind Cloudflare KV namespace to persist keys.' }, 500, request, env)
      } catch (err) {
        return json({ error: err.message }, 500, request, env)
      }
    }

    // New: Generic generation endpoint that mirrors /ai/summarize semantics
    // POST /ai/generate { provider, apiKey?, prompt, model }
    if (url.pathname === "/ai/generate" && request.method === "POST") {
      try {
        // require admin auth to call generate
        if (!await requireAuth(request, env)) return json({ error: 'Unauthorized' }, 401, request, env)
        const body = await request.json()
        const { provider, apiKey: clientApiKey, prompt, model } = body

        if (!provider || !prompt) {
          return json({ error: "Missing parameters: provider and prompt are required" }, 400, request, env)
        }

        // Resolve API key: env/KV, atau client key hanya jika origin lokal (dev)
        const { key: apiKey, source } = await resolveApiKey(provider, clientApiKey, env, request)
        if (source === 'client-not-allowed') return json({ error: 'Client-supplied API keys are not allowed' }, 400, request, env)
        if (source === 'kv-error') return json({ error: 'Error reading keys from KV' }, 500, request, env)
        if (!apiKey) return json({ error: 'Missing API key for provider on server (env or KV)', source }, 500, request, env)

        let result

        if (provider === "gemini") {
          result = await callGemini(apiKey, prompt, model)
        }

        if (provider === "openai") {
          result = await callOpenAI(apiKey, prompt, model)
        }

        if (provider === "openrouter") {
          result = await callOpenRouter(apiKey, prompt, model)
        }

        if (provider === "groq") {
          result = await callGroq(apiKey, prompt, model)
        }

        if (provider === "together") {
          result = await callTogether(apiKey, prompt, model)
        }

        if (provider === "cohere") {
          result = await callCohere(apiKey, prompt, model)
        }

        if (provider === "huggingface") {
          result = await callHuggingFace(apiKey, prompt, model)
        }

        if (provider === "deepseek") {
          result = await callDeepSeek(apiKey, prompt, model)
        }

        if (!result) {
          return json({ error: `Unsupported provider or empty result: ${provider}` }, 400, request, env)
        }

        return json({ result }, 200, request, env)
      } catch (err) {
        try {
          console.error('[/ai/generate] provider error:', {
            message: String(err.message || err),
            status: err._provider_status || err.status || null,
            provider: err._provider || provider,
            providerDataSummary: err._provider_data ? '[REDACTED]' : undefined,
            stack: err.stack
          })
        } catch (loggingErr) {
          console.error('[/ai/generate] failed to log provider error:', loggingErr)
        }

        const lower = String(err.message || '').toLowerCase()
        if (lower.includes('country') || lower.includes('region') || lower.includes('territory')) {
          return json({ error: 'Provider rejected request due to country/region restriction. Check API key application restrictions and provider account region.' }, 500, request, env)
        }

        return json({ error: err.message || 'Provider error' }, 500, request, env)
      }
    }

    // Get API key from storage (Cloudflare KV)
    // GET /ai/get-key?provider=gemini[&full=true]
    if (url.pathname === "/ai/get-key" && request.method === "GET") {
      try {
        const provider = url.searchParams.get('provider') || ''
        if (!provider) return json({ error: 'Missing provider' }, 400, request, env)
        const keyName = `key:${String(provider)}`
        const wantFull = String(url.searchParams.get('full') || '').toLowerCase() === 'true'
        if (env.KV_KEYS) {
          const value = await env.KV_KEYS.get(keyName)
          if (wantFull) {
            // Require authentication for returning full key
            if (!await requireAuth(request, env)) return json({ error: 'Unauthorized' }, 401, request, env)
            return json({ provider, apiKey: value || null }, 200, request, env)
          }
          // Mask the API key for safety in default calls
          return json({ provider, apiKey: value ? (value.slice(0, 4) + '...') : null }, 200, request, env)
        }
        // If KV isn't bound, fall back to environment variables only
        const providerKeyName = `AI_API_KEY_${String(provider).toUpperCase()}`
        const envKey = String(env[providerKeyName] || env.AI_API_KEY || '').trim()
        if (wantFull) {
          if (!await requireAuth(request, env)) return json({ error: 'Unauthorized' }, 401, request, env)
          return json({ provider, apiKey: envKey }, 200, request, env)
        }
        return json({ provider, apiKey: envKey ? (envKey.slice(0,4) + '...') : null }, 200, request, env)
      } catch (err) {
        return json({ error: err.message }, 500, request, env)
      }
    }

    // Delete API key from storage
    // DELETE /ai/delete-key?provider=gemini
    if (url.pathname === "/ai/delete-key" && request.method === "DELETE") {
      try {
        const provider = url.searchParams.get('provider') || ''
        if (!provider) return json({ error: 'Missing provider' }, 400, request, env)
        const keyName = `key:${String(provider)}`
        // Require auth for key deletion
        if (env.KV_KEYS) {
          if (!await requireAuth(request, env)) return json({ error: 'Unauthorized' }, 401, request, env)
          await env.KV_KEYS.delete(keyName)
          return json({ ok: true }, 200, request, env)
        }
        return json({ error: 'KV_KEYS not bound in this runtime. Bind Cloudflare KV namespace to delete persisted keys.' }, 500, request, env)
      } catch (err) {
        return json({ error: err.message }, 500, request, env)
      }
    }

    // Debug endpoint: shows whether KV binding is available in this runtime
    if (url.pathname === "/ai/debug" && request.method === "GET") {
      try {
        const kvPresent = !!env.KV_KEYS
        const providerKeys = {
          AI_API_KEY: !!env.AI_API_KEY,
        }
        // expose env binding keys for debugging (helps verify what bindings exist)
        let bindingKeys = []
        try{ bindingKeys = Object.keys(env || {}) }catch(e){ bindingKeys = [] }
        return json({ ok: true, kvBound: kvPresent, providerKeys, bindingKeys }, 200, request, env)
      } catch (e) {
        return json({ error: e.message }, 500, request, env)
      }
    }

    // GET /ai/keys-check?providers=gemini,openai
    // Returns which providers have keys available in env or KV.
    if (url.pathname === "/ai/keys-check" && request.method === "GET") {
      try {
        const providersParam = url.searchParams.get('providers') || ''
        const providers = providersParam ? providersParam.split(',').map(p => String(p || '').trim()).filter(Boolean) : ['gemini','openai','openrouter','groq','cohere','huggingface','together','deepseek']
        const results = {}
        for (const prov of providers) {
          const providerKeyName = `AI_API_KEY_${String(prov).toUpperCase()}`
          const envKey = String(env[providerKeyName] || env.AI_API_KEY || '').trim()
          let presentInEnv = !!envKey
          let presentInKV = false
          if (env.KV_KEYS) {
            try {
              const val = await env.KV_KEYS.get(`key:${prov}`)
              presentInKV = !!val
            } catch (e) {
              // ignore per-provider KV read errors; continue
              presentInKV = false
            }
          }
          results[prov] = { env: presentInEnv, kv: presentInKV }
        }
        return json({ ok: true, providers: results }, 200, request, env)
      } catch (e) {
        return json({ error: e.message }, 500, request, env)
      }
    }

    

    // POST /auth/logout — idempotent; clients should drop stored token on logout
    if (url.pathname === '/auth/logout' && request.method === 'POST') {
      try {
        return json({ ok: true }, 200, request, env)
      } catch (e) {
        return json({ error: e.message }, 500, request, env)
      }
    }

    // POST /auth/login — authenticate admin and return JWT in JSON (Authorization header flows)
    if (url.pathname === '/auth/login' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}))
        const { username, password } = body || {}
        if (!username || !password) return json({ error: 'Missing username or password' }, 400, request, env)

        // Build user map from environment with priority:
        // 1) LOGIN_USERS (format: user:pass,user:pass)
        // 2) USERn / PASSn pairs (legacy)
        // 3) LOGIN_USERNAME / LOGIN_PASSWORD (legacy single user)
        let authenticated = false
        try {
          const usersRaw = String(env.LOGIN_USERS || '').trim()
          if (usersRaw) {
            const pairs = usersRaw.split(',').map(s => String(s || '').trim()).filter(Boolean)
            for (const pair of pairs) {
              const [u, p] = pair.split(':')
              if (String(u) === String(username) && String(p) === String(password)) { authenticated = true; break }
            }
          }
        } catch (e) { /* ignore parsing errors */ }

        // Fallback: USERn/PASSn (legacy individual vars)
        if (!authenticated) {
          for (let i = 1; i <= 8; i++) {
            try {
              const u = String(env[`USER${i}`] || '').trim()
              const p = String(env[`PASS${i}`] || '').trim()
              if (u && p && u === username && p === password) { authenticated = true; break }
            } catch (e) { /* ignore */ }
          }
        }

        // Final fallback: single LOGIN_USERNAME / LOGIN_PASSWORD
        if (!authenticated && env.LOGIN_USERNAME && env.LOGIN_PASSWORD) {
          if (username === env.LOGIN_USERNAME && password === env.LOGIN_PASSWORD) authenticated = true
        }

        if (!authenticated) return json({ error: 'Unauthorized' }, 401, request, env)

        // Signing secret: prefer ADMIN_JWT_SECRET; if not available, allow JWT_SECRET for dev only
        const signingSecret = String(env.ADMIN_JWT_SECRET || env.JWT_SECRET || '').trim()
        if (!signingSecret) return json({ error: 'Signing secret not configured (ADMIN_JWT_SECRET or JWT_SECRET required)' }, 500, request, env)

        const token = await createSignedToken({ sub: username }, env)
        if (!token) return json({ error: 'Token issuance failed' }, 500, request, env)

        const headers = {
          'Content-Type': 'application/json',
          ...corsHeaders(request, env)
        }
        return new Response(JSON.stringify({ ok: true, token }), { status: 200, headers })
      } catch (e) {
        return json({ error: e.message }, 500, request, env)
      }
    }

    // ========== Presets (sync global via KV) ==========
    // Helper function: return hardcoded default presets
    function getDefaultPresetsFromBackend() {
      return {
        Informal: { label: 'Informal', platform: 'youtube', goal: ['Viewer', 'Viral'], tone: 'santai, friendly', length: 'short', cta: 'Follow for more', structure: 'Hook -> Benefit -> CTA', hashtagCount: 8, audioStyle: 'upbeat', musicMood: 'exciting, energetic', audioGenre: 'pop, electronic', musicSuggestion: 'Upbeat pop dengan beat yang catchy, cocok untuk comedy/relatable content', audioLength: '15s' },
        Jualan: { label: 'Jualan', platform: 'tiktok', goal: ['FYP', 'Penjualan'], tone: 'persuasif, santai', length: 'short', cta: 'Beli sekarang', structure: 'Hook -> Benefit -> Social proof -> CTA', hashtagCount: 10, audioStyle: 'energetic', musicMood: 'motivational, exciting', audioGenre: 'pop, hiphop, electronic', musicSuggestion: 'Trendy music dengan vibe premium, mendorong action/konversi', audioLength: '30s' },
        Edukasi: { label: 'Edukasi', platform: 'youtube', goal: ['SEO', 'Viewer'], tone: 'informative, clear', length: 'medium', cta: 'Pelajari lebih lanjut', structure: 'Hook -> 2 tips -> CTA', hashtagCount: 6, audioStyle: 'calm', musicMood: 'focusing, professional', audioGenre: 'ambient, lofi, classical', musicSuggestion: 'Background musik yang tidak mengganggu, fokus ke narasi', audioLength: 'flexible' },
        TikTokFYP: { label: 'TikTok FYP', platform: 'tiktok', goal: ['FYP', 'Viral', 'Follower'], tone: 'energetic, hooky, relatable', length: 'short', cta: 'Follow & save', structure: 'Hook 3 detik -> Value -> CTA', hashtagCount: 12, variationCount: 3, audioStyle: 'upbeat', musicMood: 'trending, viral', audioGenre: 'pop, hiphop, electronic', musicSuggestion: 'Musik trending di TikTok saat ini, mengikuti viral sound', audioLength: '15s-30s' },
        ReelsViral: { label: 'Reels Viral', platform: 'instagram', goal: ['FYP', 'Viral', 'Follower'], tone: 'energetic, aspirational', length: 'short', cta: 'Follow for more', structure: 'Hook -> Story/Value -> CTA', hashtagCount: 15, variationCount: 3, audioStyle: 'dramatic', musicMood: 'exciting, surprising', audioGenre: 'electronic, synth, pop', musicSuggestion: 'High-energy build-up music dengan plot twist element', audioLength: '15s-30s' },
        FollowerGrowth: { label: 'Follower Growth', platform: 'youtube', goal: ['Follower', 'Viewer', 'Viral'], tone: 'friendly, engaging', length: 'short', cta: 'Subscribe & like', structure: 'Hook -> Benefit -> CTA follow/subscribe', hashtagCount: 8, variationCount: 3, audioStyle: 'engaging', musicMood: 'motivational, relatable', audioGenre: 'pop, hiphop, lofi', musicSuggestion: 'Music yang relatable dengan target audience, encourage follow', audioLength: '30s' }
      }
    }

    // GET /presets — returns all presets from KV (global, same for all devices)
    if (url.pathname === "/presets" && request.method === "GET") {
      try {
        const KV_PRESETS_KEY = "genco_presets"
        if (env.KV_KEYS) {
          const raw = await env.KV_KEYS.get(KV_PRESETS_KEY)
          let data = raw ? JSON.parse(raw) : { userPresets: {} }
          // Handle backward compatibility: if data is flat object (old format), convert to new format
          if (data.userPresets === undefined && !data._version) {
            data = { userPresets: data }
          }
          const userPresets = data.userPresets || {}
          const defaults = getDefaultPresetsFromBackend()
          return json({ presets: userPresets, defaults }, 200, request, env)
        }
        const defaults = getDefaultPresetsFromBackend()
        return json({ presets: {}, defaults }, 200, request, env)
      } catch (e) {
        return json({ error: e.message }, 500, request, env)
      }
    }

    // POST /presets — save user presets to KV. Body: { presets: {...} } OR { userPresets: {...} }
    if (url.pathname === "/presets" && request.method === "POST") {
      try {
        const body = await request.json()
        // Accept both old format (presets) and new format (userPresets) for backward compatibility
        const userPresets = body && typeof body.userPresets === "object" ? body.userPresets : 
                            body && typeof body.presets === "object" ? body.presets : {}
        const KV_PRESETS_KEY = "genco_presets"
        if (env.KV_KEYS) {
          // require auth for saving presets to server KV
          if (!await requireAuth(request, env)) return json({ error: 'Unauthorized' }, 401, request, env)
          const storageData = { userPresets, timestamp: Date.now() }
          await env.KV_KEYS.put(KV_PRESETS_KEY, JSON.stringify(storageData))
          return json({ ok: true }, 200, request, env)
        }
        return json({ ok: true }, 200, request, env)
      } catch (e) {
        return json({ error: e.message }, 500, request, env)
      }
    }

    // DELETE /presets/:key — delete a preset from KV
    if (url.pathname.startsWith("/presets/") && request.method === "DELETE") {
      try {
        const key = decodeURIComponent(url.pathname.replace("/presets/", ""))
        if (!key) return json({ error: "Missing preset key" }, 400, request, env)
        const KV_PRESETS_KEY = "genco_presets"
        if (env.KV_KEYS) {
          // require auth for deleting presets from server KV
          if (!await requireAuth(request, env)) return json({ error: 'Unauthorized' }, 401, request, env)
          const raw = await env.KV_KEYS.get(KV_PRESETS_KEY)
          let data = raw ? JSON.parse(raw) : { userPresets: {} }
          // Handle backward compatibility
          if (data.userPresets === undefined && !data._version) {
            data = { userPresets: data }
          }
          if (data.userPresets && data.userPresets[key]) {
            delete data.userPresets[key]
            data.timestamp = Date.now()
            await env.KV_KEYS.put(KV_PRESETS_KEY, JSON.stringify(data))
            return json({ ok: true }, 200, request, env)
          }
          return json({ error: "Preset not found" }, 404, request, env)
        }
        return json({ ok: true }, 200, request, env)
      } catch (e) {
        return json({ error: e.message }, 500, request, env)
      }
    }

      return new Response("AI Backend OK", { status: 200, headers: corsHeaders(request, env) })
    } catch (err) {
      // Ensure CORS headers are always present on unexpected errors
      console.error('Unhandled error in fetch:', err)
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) }
      })
    }
  }
}
function corsHeaders(request, env) {
  const origin = request && request.headers ? (request.headers.get('Origin') || request.headers.get('origin')) : null
  const allowedRaw = String((env && env.ALLOWED_ORIGINS) || '').trim()

  // If ALLOWED_ORIGINS is configured (comma-separated), echo the origin only when allowed.
  if (allowedRaw) {
    const allowed = allowedRaw.split(',').map(s => String(s || '').trim()).filter(Boolean)
    // Normalize and allow flexible matching for localhost and host-only entries (ignore port differences)
    try {
      if (origin) {
        const originUrl = new URL(origin)
        const originHost = originUrl.hostname
        // exact match first (including port)
        if (allowed.includes(origin)) {
          return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Credentials": "true"
          }
        }

        // allow when allowed list contains same hostname (e.g. "http://127.0.0.1" or "http://localhost")
        for (const a of allowed) {
          try {
            const parsed = new URL(a)
            if (parsed.hostname === originHost) {
              return {
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
                "Access-Control-Allow-Credentials": "true"
              }
            }
          } catch (e) {
            // if allowed entry is just a hostname or malformed URL, allow simple hostname match
            if (String(a).trim() === originHost) {
              return {
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
                "Access-Control-Allow-Credentials": "true"
              }
            }
          }
        }
        // Allow localhost/127.0.0.1 origins for developer convenience even if not explicitly listed
        if (originHost === '127.0.0.1' || originHost === 'localhost') {
          return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Credentials": "true"
          }
        }
        // Allow private IP (LAN) untuk development: 192.168.x.x, 10.x.x.x, 172.16-31.x.x
        if (/^192\.168\.\d+\.\d+$/.test(originHost) || /^10\.\d+\.\d+\.\d+$/.test(originHost) || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(originHost)) {
          return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Credentials": "true"
          }
        }
      }
    } catch (e) {
      // ignore parsing errors and fall through to restrictive behavior
    }

    // Origin not allowed: return restrictive header (browser will block)
    return {
      "Access-Control-Allow-Origin": "null",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS"
    }
  }

  // Default fallback: permissive for development if no allowlist configured
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS"
  }
}

function json(data, status = 200, request = null, env = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(request, env)
    }
  })
}

// ===== PROVIDERS =====

async function callGemini(apiKey, prompt, model) {
  // Prefer stable v1 endpoint for newer models; fall back to v1beta + gemini-pro if needed.
  const payload = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }]
  })

  const tryCall = async (url) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg =
        data?.error?.message ||
        data?.message ||
        `Gemini request failed (${res.status})`
      const err = new Error(msg)
      err._provider = 'gemini'
      err._provider_status = res.status
      err._provider_data = data
      throw err
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error("Gemini returned empty response")
    return text
  }

  const requested = String(model || "").trim()
  // expected format from listModels: "models/...."
  const hasPrefix = requested.startsWith("models/")
  const chosen = hasPrefix ? requested : ""

  try {
    // If caller provided a concrete model (models/...), try it on v1 first.
    if (chosen) {
      return await tryCall(
        `https://generativelanguage.googleapis.com/v1/${chosen}:generateContent?key=${apiKey}`
      )
    }
    // Default (safe): let backend choose a reasonable model.
    return await tryCall(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`
    )
  } catch (e) {
    // Fallback for projects/accounts where the v1 model isn't available.
    if (chosen) {
      return await tryCall(
        `https://generativelanguage.googleapis.com/v1beta/${chosen}:generateContent?key=${apiKey}`
      )
    }
    return await tryCall(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`
    )
  }
}

async function callOpenRouter(apiKey, prompt, model) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: String(model || "openai/gpt-4o-mini"),
      messages: [{ role: "user", content: prompt }]
    })
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||

      `OpenRouter request failed (${res.status})`
    throw new Error(msg)
  }
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error("OpenRouter returned empty response")
  return text
}

async function callOpenAI(apiKey, prompt, model) {
  if (!apiKey) throw new Error('Missing OpenAI API key')
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: String(model || "gpt-4o-mini"),
        messages: [{ role: "user", content: prompt }]
      })
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = data?.error?.message || data?.message || `OpenAI request failed (${res.status})`
      const err = new Error(msg)
      err._provider = 'openai'
      err._provider_status = res.status
      err._provider_data = data
      throw err
    }
    const text = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || ''
    if (!text) {
      const err = new Error('OpenAI returned empty response')
      err._provider = 'openai'
      err._provider_status = res.status
      err._provider_data = data
      throw err
    }
    return text
  } catch (e) {
    // Re-throw to be handled by caller; ensure we don't include apiKey in the error
    if (!e._provider) { e._provider = 'openai' }
    throw e
  }
}

// Groq: OpenAI-compatible API (https://api.groq.com/openai/v1)
async function callGroq(apiKey, prompt, model) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: String(model || "llama-3.1-8b-instant"),
      messages: [{ role: "user", content: prompt }]
    })
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      `Groq request failed (${res.status})`
    throw new Error(msg)
  }
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error("Groq returned empty response")
  return text
}

// Together AI: OpenAI-compatible API (https://api.together.xyz/v1)
async function callTogether(apiKey, prompt, model) {
  const res = await fetch("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: String(model || "meta-llama/Llama-3-70b-chat-hf"),
      messages: [{ role: "user", content: prompt }]
    })
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      `Together request failed (${res.status})`
    throw new Error(msg)
  }
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error("Together returned empty response")
  return text
}

// Cohere: v2 Chat API (https://api.cohere.com/v2/chat). Response: message.content[].text
async function callCohere(apiKey, prompt, model) {
  const res = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: String(model || "command-r-plus-08-2024"),
      messages: [{ role: "user", content: prompt }]
    })
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      data?.message ||
      data?.error?.message ||
      `Cohere request failed (${res.status})`
    throw new Error(msg)
  }
  const content = data?.message?.content
  if (!Array.isArray(content) || content.length === 0) throw new Error("Cohere returned empty response")
  const text = content
    .filter(c => c?.type === "text" && c?.text != null)
    .map(c => c.text)
    .join("")
  if (!text) throw new Error("Cohere returned no text")
  return text
}

// Hugging Face: OpenAI-compatible router (https://router.huggingface.co/v1)
async function callHuggingFace(apiKey, prompt, model) {
  const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: String(model || "meta-llama/Llama-3-70b-chat-hf"),
      messages: [{ role: "user", content: prompt }]
    })
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      `Hugging Face request failed (${res.status})`
    throw new Error(msg)
  }
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error("Hugging Face returned empty response")
  return text
}

// DeepSeek: OpenAI-compatible API (https://api.deepseek.com/v1)
async function callDeepSeek(apiKey, prompt, model) {
  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: String(model || "deepseek-chat"),
      messages: [{ role: "user", content: prompt }]
    })
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      `DeepSeek request failed (${res.status})`
    throw new Error(msg)
  }
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error("DeepSeek returned empty response")
  return text
}

async function listGeminiModels(apiKey) {
  // Try v1 first, then v1beta fallback
  const tryList = async (url) => {
    const res = await fetch(url)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg =
        data?.error?.message ||
        data?.message ||
        `Gemini listModels failed (${res.status})`
      throw new Error(msg)
    }
    const raw = Array.isArray(data?.models) ? data.models : []
    // Keep only high-signal fields; include supported methods
    return raw.map(m => ({
      name: m.name,
      displayName: m.displayName,
      description: m.description,
      supportedGenerationMethods: m.supportedGenerationMethods
    }))
  }

  try {
    return await tryList(
      `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`
    )
  } catch (e) {
    return await tryList(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    )
  }
}

async function listOpenAIModels(apiKey) {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { "Authorization": `Bearer ${apiKey}` }
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      `OpenAI listModels failed (${res.status})`
    throw new Error(msg)
  }
  const items = Array.isArray(data?.data) ? data.data : []
  // return high-signal subset; sort by id
  return items
    .map(m => ({
      id: m.id,
      owned_by: m.owned_by,
      // OpenAI API doesn't expose "free" models; billing/credits required for chat completions.
      is_free: false
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
}

async function listGroqModels(apiKey) {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { "Authorization": `Bearer ${apiKey}` }
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      `Groq listModels failed (${res.status})`
    throw new Error(msg)
  }
  const items = Array.isArray(data?.data) ? data.data : []
  return items
    .map(m => ({
      id: m.id,
      owned_by: m.owned_by,
      is_free: true
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
}

async function listCohereModels(apiKey) {
  const res = await fetch("https://api.cohere.com/v1/models", {
    headers: { "Authorization": `Bearer ${apiKey}` }
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      data?.message ||
      data?.error?.message ||
      `Cohere listModels failed (${res.status})`
    throw new Error(msg)
  }
  const items = Array.isArray(data?.models) ? data.models : []
  return items
    .filter(m => !m?.endpoints || m.endpoints.includes("chat"))
    .map(m => ({
      id: m.name,
      name: m.name,
      display_name: m.name,
      context_length: m.context_length,
      endpoints: m.endpoints
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
}

// Hugging Face router has no public /models list; return static list of popular chat models.
async function listHuggingFaceModels(apiKey) {
  const staticModels = [
    "meta-llama/Llama-3-70b-chat-hf",
    "meta-llama/Llama-3-8b-chat-hf",
    "mistralai/Mixtral-8x7B-Instruct-v0.1",
    "Qwen/Qwen2.5-72B-Instruct",
    "Qwen/Qwen2.5-7B-Instruct",
    "google/gemma-2-27b-it",
    "HuggingFaceH4/zephyr-7b-beta",
    "microsoft/Phi-3-mini-4k-instruct"
  ]
  return staticModels.map(id => ({ id, name: id }))
}

async function listDeepSeekModels(apiKey) {
  const res = await fetch("https://api.deepseek.com/v1/models", {
    headers: { "Authorization": `Bearer ${apiKey}` }
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      `DeepSeek listModels failed (${res.status})`
    throw new Error(msg)
  }
  const items = Array.isArray(data?.data) ? data.data : []
  return items
    .map(m => ({
      id: m.id,
      name: m.id,
      owned_by: m.owned_by
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
}

async function listTogetherModels(apiKey) {
  const res = await fetch("https://api.together.xyz/v1/models", {
    headers: { "Authorization": `Bearer ${apiKey}` }
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      `Together listModels failed (${res.status})`
    throw new Error(msg)
  }
  const items = Array.isArray(data?.data) ? data.data : []
  return items
    .map(m => ({
      id: m.id,
      name: m.id,
      display_name: m.display_name,
      context_length: m.context_length,
      type: m.type
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
}

async function listOpenRouterModels(apiKey) {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { "Authorization": `Bearer ${apiKey}` }
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      `OpenRouter listModels failed (${res.status})`
    throw new Error(msg)
  }
  const items = Array.isArray(data?.data) ? data.data : []
  return items.map(m => {
    const promptPrice = String(m?.pricing?.prompt ?? "")
    const completionPrice = String(m?.pricing?.completion ?? "")
    const isFreeByPricing = promptPrice === "0" && completionPrice === "0"
    const isFreeById = String(m?.id || "").includes(":free")
    const is_free = isFreeByPricing || isFreeById
    return {
      id: m.id,
      name: m.name,
      context_length: m.context_length,
      pricing: m.pricing,
      is_free
    }
  })
}

// Resolve API key for provider.
// Production: only env/KV. Local/dev: allow client-supplied key when Origin is localhost/127.0.0.1/private IP.
async function resolveApiKey(provider, clientApiKey, env, request) {
  const isLocalOrigin = (req) => {
    try {
      const origin = req && req.headers && (req.headers.get('Origin') || req.headers.get('origin'))
      if (!origin) return false
      const host = new URL(origin).hostname
      return host === 'localhost' || host === '127.0.0.1' || host === '::1' ||
        /^192\.168\.\d+\.\d+$/.test(host) || /^10\.\d+\.\d+\.\d+$/.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)
    } catch (e) { return false }
  }

  // Allow client-supplied key hanya saat request dari origin lokal (development)
  if (clientApiKey && typeof clientApiKey === 'string' && clientApiKey.trim()) {
    if (request && isLocalOrigin(request)) {
      return { key: String(clientApiKey).trim(), source: 'client' }
    }
    return { key: null, source: 'client-not-allowed' }
  }

  const p = String(provider || '').toLowerCase()
  if (!p) return { key: null, source: 'missing-provider' }

  // check explicit env names
  const explicitNames = {
    openai: ['OPENAI_API_KEY', 'AI_API_KEY_OPENAI'],
    gemini: ['GEMINI_API_KEY', 'AI_API_KEY_GEMINI']
  }

  const candidates = (explicitNames[p] || []).concat([`AI_API_KEY_${String(p).toUpperCase()}`, 'AI_API_KEY'])
  for (const name of candidates) {
    try {
      const val = env && env[name]
      if (val && String(val).trim()) return { key: String(val).trim(), source: 'env:' + name }
    } catch (e) {}
  }

  // Fallback to KV
  if (env && env.KV_KEYS) {
    try {
      const val = await env.KV_KEYS.get(`key:${p}`)
      if (val && String(val).trim()) return { key: String(val).trim(), source: 'kv' }
    } catch (e) {
      // ignore KV errors; caller will handle
      return { key: null, source: 'kv-error' }
    }
  }

  return { key: null, source: 'not-found' }
}
