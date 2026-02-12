// ================================
// ai.js - AI Client + Cache
// ================================

// Preserve any existing values (set by config.js) to avoid overwriting backendURL
;(function(){
  const _prev = window.AI || {}
  // Determine whether to force all provider calls through backend proxy.
  // Config priority: window.APP_CONFIG.forceBackendProxy (explicit), else auto-enable for non-localhost.
  const _isLocalhost = (typeof location !== 'undefined') && (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '::1')
  const _forceBackendProxy = (window.APP_CONFIG && typeof window.APP_CONFIG.forceBackendProxy !== 'undefined')
    ? Boolean(window.APP_CONFIG.forceBackendProxy)
    : !_isLocalhost

  window.AI = {
    backendURL: _prev.backendURL || "",
    provider: _prev.provider || "",
    apiKey: _prev.apiKey || "",
    // expose flag to other modules
    forceBackendProxy: _forceBackendProxy,

    // Show a friendly banner when backend is unreachable
    showBackendUnavailable(message){
      try{
        let el = document.getElementById('backend-unreachable-banner')
        if(!el){
          el = document.createElement('div')
          el.id = 'backend-unreachable-banner'
          el.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:9998;max-width:920px;padding:12px 18px;border-radius:8px;background:#7a2b2b;color:#fff;box-shadow:0 6px 18px rgba(0,0,0,0.35);font-size:14px;display:flex;gap:12px;align-items:center'
          document.body.appendChild(el)
        }
        el.textContent = message || 'Backend unreachable — check your backend URL or network. Open Settings to configure backend.'
        clearTimeout(el._hideTimer)
        el._hideTimer = setTimeout(()=>{ try{ el.remove() }catch(e){} }, 12000)
      }catch(e){ console.warn('showBackendUnavailable failed', e) }
    },
  // Helper: prefer localStorage override, then APP_CONFIG/AI, strip trailing slashes
  getBackendURLFromConfig() {
    try{
      const stored = String(localStorage.getItem('backend_url') || '').trim()
      const raw = stored || (window.APP_CONFIG && window.APP_CONFIG.backendURL) || (window.AI && window.AI.backendURL) || ''
      return String(raw || '').replace(/\/+$/,'')
    }catch(e){ return '' }
  },

  // Helper: Get headers with JWT token for authenticated requests
  getAuthHeaders() {
    const headers = {}
    try{
      const token = sessionStorage.getItem('auth_token')
      if(token){
        headers['Authorization'] = 'Bearer ' + token
      }
    }catch(e){}
    return headers
  },

  init({ backendURL, provider, apiKey }) {
    // idempotent init: skip if nothing changed
    if (
      this.backendURL === backendURL &&
      this.provider === provider &&
      this.apiKey === apiKey
    ) {
      return
    }

    this.backendURL = backendURL
    this.provider = provider
    this.apiKey = apiKey

    console.log("🤖 AI ready:", provider)
    console.trace("AI.init called from:")
  },

  cacheKey(movieId) {
    return `ai_summary_${this.provider}_${movieId}`
  },

  async summarize({ movieId, title, overview }) {
    const key = this.cacheKey(movieId)

    // ===== CACHE HIT =====
    const cached = localStorage.getItem(key)
    if (cached) {
      console.log("🧠 AI cache hit")
      return cached
    }

    // ===== PROMPT =====
    const prompt = `
Ringkas film berikut secara singkat, padat, dan menarik:

Judul: ${title}
Sinopsis: ${overview}
    `.trim()

    // ===== CALL BACKEND =====
    // prefer a configured backend URL (localStorage / APP_CONFIG) over any pre-set this.backendURL
    const base = this.getBackendURLFromConfig() || this.backendURL
    if(!base) throw new Error('AI backendURL not configured')
    let res
    try{
      res = await fetch(`${base}/ai/summarize`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...this.getAuthHeaders()
        },
        body: JSON.stringify({
          provider: this.provider,
          apiKey: this.apiKey,
          prompt
        })
      })
    }catch(fetchErr){
      // network-level failure (DNS, connection, CORS preflight abort)
      try{ this.showBackendUnavailable('AI backend unreachable — verify backend URL and network connectivity. Open Settings to configure backend.'); }catch(e){}
      throw new Error('AI backend unreachable')
    }

    if (res.status === 401) {
      try{ window.location.href = 'login.html' }catch(e){}
      throw new Error('Unauthorized')
    }
    const data = await res.json().catch(()=>({ error: 'Invalid JSON response from backend' }))
    if (data.error) throw new Error(data.error)

    // ===== SAVE CACHE =====
    localStorage.setItem(key, data.result)

    return data.result
  }
  ,

  // Direct call to Gemini API from frontend
  async _callGeminiDirect(apiKey, prompt, model) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.5-flash'}:generateContent?key=${encodeURIComponent(apiKey)}`
    
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    })
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error?.message || `Gemini API error: ${res.status}`)
    }
    
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  },

  // Direct call to OpenAI API from frontend
  async _callOpenAIDirect(apiKey, prompt, model) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000
      })
    })
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error?.message || `OpenAI error: ${res.status}`)
    }
    
    const data = await res.json()
    return data.choices?.[0]?.message?.content || ''
  },

  // Generic prompt runner (used by AI suggestions / social generator)
  async generate({ provider, apiKey, prompt, model } = {}) {
    const useProvider = provider || this.provider
    const useKey = apiKey || this.apiKey
    if (!useProvider) throw new Error("AI provider not configured")
    if (!useKey) throw new Error("AI apiKey not configured")
    if (!prompt) throw new Error("Missing prompt")

    // Direct provider calls are disabled in production by default to avoid
    // exposing API keys and causing CORS/abuse issues. Attempt direct calls
    // only when `forceBackendProxy` is false (usually local/dev).
    if (!this.forceBackendProxy) {
      try {
        if (useProvider === 'gemini') {
          return await this._callGeminiDirect(useKey, prompt, model)
        }
        if (useProvider === 'openai') {
          return await this._callOpenAIDirect(useKey, prompt, model)
        }
      } catch (directErr) {
        console.warn(`[AI] Direct ${useProvider} call failed, trying backend...`, directErr)
        // Fall through to backend
      }
    }

    // prefer a configured backend URL (localStorage / APP_CONFIG) over any pre-set this.backendURL
    const base = this.getBackendURLFromConfig() || this.backendURL
    if(!base) throw new Error('AI backendURL not configured')
    // summarize() → /ai/summarize; generate() → /ai/generate
    let res
    try{
      res = await fetch(`${base}/ai/generate`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...this.getAuthHeaders()
        },
        body: JSON.stringify({
          provider: useProvider,
          apiKey: useKey,
          prompt,
          model
        })
      })
    }catch(fetchErr){
      try{ this.showBackendUnavailable('AI backend unreachable — verify backend URL and network connectivity. Open Settings to configure backend.'); }catch(e){}
      throw new Error('AI backend unreachable')
    }

    if (res.status === 401) {
      try{ window.location.href = 'login.html' }catch(e){}
      throw new Error('Unauthorized')
    }
    const data = await res.json().catch(()=>({ error: 'Invalid JSON response from backend' }))
    if (data?.error) throw new Error(data.error)
    return data?.result
  }
  }
})();