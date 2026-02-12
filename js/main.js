// ================================

// Global AI logging helper (available to all functions in this file)
function aiLog(level, tag, data){
  try{
    const ts = new Date().toISOString()
    const out = Object.assign({ ts, tag }, data || {})
    if(level === 'error') console.error('[AI]', tag, out)
    else if(level === 'warn') console.warn('[AI]', tag, out)
    else if(level === 'info') console.info('[AI]', tag, out)
    else console.log('[AI]', tag, out)
  }catch(e){ /* ignore logging errors */ }
}
function getBackendURL(){
  try{
    const stored = String(localStorage.getItem('backend_url') || '').trim()
    const raw = stored || (window.APP_CONFIG && window.APP_CONFIG.backendURL) || (window.AI && window.AI.backendURL) || ''
    return String(raw || '').replace(/\/+$/,'')
  }catch(e){ return '' }
}

// Get headers for authenticated requests (includes JWT token)
function getAuthHeaders(additionalHeaders = {}){
  const headers = { ...additionalHeaders }
  try{
    const token = sessionStorage.getItem('auth_token')
    if(token){
      headers['Authorization'] = 'Bearer ' + token
    }
  }catch(e){}
  return headers
}

/** Update backend status indicator in real-time (used in header and presets page) */
function updateBackendStatusIndicator(elementId){
  const el = document.getElementById(elementId)
  if (!el) return

  const url = getBackendURL() || ''
  const token = sessionStorage.getItem('auth_token')
  const isLocal = /127\.0\.0\.1|localhost|^https?:\/\/\[?::1\]?/i.test(url)
  const statusKey = elementId || 'default'

  // default offline state
  function setOffline(){
    el.innerHTML = '🔴 OFFLINE'
    el.style.background = 'rgba(80,0,0,0.25)'
    el.dataset.status = 'offline'
    el.style.display = 'flex'
    el.style.alignItems = 'center'
    el.style.gap = '6px'
    el.style.fontFamily = 'monospace'
    el.style.padding = '6px 8px'
    el.style.borderRadius = '6px'
    el.style.fontSize = '12px'
    el.style.border = '1px solid rgba(106,168,136,0.2)'
  }

  if (!url) { setOffline(); return }

  const pingUrl = String(url).replace(/\/+$/,'') + '/ai/debug'
  const controller = new AbortController()
  const timeoutMs = 8000 // increase timeout to tolerate slow dev worker responses
  const timer = setTimeout(()=> controller.abort(), timeoutMs)

  // Do NOT send Authorization header for health check to avoid CORS preflight.
  // /ai/debug is intentionally exposed unauthenticated so frontend can poll it.
  fetch(pingUrl, { method: 'GET', headers: {}, signal: controller.signal })
    .then(async res => {
      clearTimeout(timer)
      // if not ok, treat as reachable but unauthenticated or error
      let data = null
      try{ data = await res.json() }catch(e){ data = null }

      let serverName = 'INVALD'
      try{ serverName = (new URL(url)).hostname.substring(0,7).toUpperCase() }catch(e){ serverName = 'INVALD' }

      // determine new state
      let newState = 'responded'
      if (res.ok && data && data.ok) newState = 'connected'
      else if (res.ok && data && !data.ok) newState = 'noauth'
      else if (res.status === 401) newState = 'noauth'

      // reset failure counter on any successful HTTP response
      try{ window._backendStatusFailCount = window._backendStatusFailCount || {}; window._backendStatusFailCount[statusKey] = 0 }catch(e){}

      // Only update DOM when state changed to avoid flicker
      if (el.dataset.status !== newState) {
        if (newState === 'connected'){
          el.innerHTML = `🟢 ${serverName} ${isLocal ? '(Local)' : '(Cloud)'} — Connected`
          el.style.background = isLocal ? 'rgba(0,40,20,0.3)' : 'rgba(0,30,60,0.3)'
        } else if (newState === 'noauth'){
          el.innerHTML = `🟡 ${serverName} ${isLocal ? '(Local)' : '(Cloud)'} — No Auth`
          el.style.background = 'rgba(80,60,0,0.3)'
        } else {
          el.innerHTML = `🟡 ${serverName} ${isLocal ? '(Local)' : '(Cloud)'} — Responded`
          el.style.background = 'rgba(80,60,0,0.2)'
        }
        el.dataset.status = newState
        // common styling
        el.style.display = 'flex'
        el.style.alignItems = 'center'
        el.style.gap = '6px'
        el.style.fontFamily = 'monospace'
        el.style.padding = '6px 8px'
        el.style.borderRadius = '6px'
        el.style.fontSize = '12px'
        el.style.border = '1px solid rgba(106,168,136,0.2)'
      }
    })
    .then(()=>{})
    .catch(err => {
      clearTimeout(timer)
      // implement simple hysteresis: require 2 consecutive failures before marking OFFLINE
      try{
        window._backendStatusFailCount = window._backendStatusFailCount || {}
        const key = elementId || 'default'
        window._backendStatusFailCount[key] = (window._backendStatusFailCount[key] || 0) + 1
        const fails = window._backendStatusFailCount[key]
        if(fails >= 2){
          setOffline()
        }else{
          // transient failure — show reconnecting state
          el.innerHTML = '🟡 RECONNECTING'
          el.style.background = 'rgba(80,60,0,0.2)'
          el.dataset.status = 'reconnecting'
          el.style.display = 'flex'
          el.style.alignItems = 'center'
          el.style.gap = '6px'
          el.style.fontFamily = 'monospace'
          el.style.padding = '6px 8px'
          el.style.borderRadius = '6px'
          el.style.fontSize = '12px'
          el.style.border = '1px solid rgba(106,168,136,0.2)'
        }
      }catch(e){ setOffline() }
    })
}

// Start periodic polling for both header and presets indicators (once)
if (!window._backendStatusPollStarted) {
  window._backendStatusPollStarted = true
  const pollIntervalMs = 8000
  const doPoll = ()=>{
    try{ updateBackendStatusIndicator('Status-server') }catch(e){}
    try{ updateBackendStatusIndicator('presetsBackendIndicator') }catch(e){}
  }
  // initial immediate check
  setTimeout(doPoll, 250)
  // periodic
  window._backendStatusPollHandle = setInterval(doPoll, pollIntervalMs)
}

/** Jika preset dipakai: tone & keyword dari preset; jika tidak: dari dropdown generator. */
function getEffectiveToneAndKeywords(){
  try{
    const presetSel = document.getElementById('aiPresetSelect')
    const presetKey = presetSel ? String(presetSel.value || '').trim() : ''
    const p = presetKey && window.PresetsManager ? window.PresetsManager.get(presetKey) : null
    if(p){
      const kwParts = [p.keywordMain, p.keywordExtra].filter(Boolean).map(s=>String(s).trim())
      if(p.keywordPriorityOrder && String(p.keywordPriorityOrder).trim()) kwParts.push(String(p.keywordPriorityOrder).trim())
      return { tone: String(p.tone || '').trim(), keywordText: kwParts.length ? kwParts.join(', ') : '' }
    }
    const tone = (document.getElementById('aiToneSelect')?.value || 'neutral').trim()
    const kwEl = document.getElementById('aiKeywordSelect')
    let keywordText = ''
    if(kwEl){
      const opts = Array.from(kwEl.selectedOptions || []).map(o=>o.value).filter(Boolean)
      keywordText = opts.length ? opts.join(', ') : (kwEl.value || '').trim()
    }
    return { tone, keywordText }
  }catch(e){ return { tone: 'neutral', keywordText: '' } }
}

/** Return comma-separated string of all selected keywords (from multi-select or preset). Use in all generate flows. */
function getSelectedKeywords(){
  const { keywordText } = getEffectiveToneAndKeywords()
  if(keywordText) return keywordText
  const kwEl = document.getElementById('aiKeywordSelect')
  if(!kwEl) return ''
  const opts = Array.from(kwEl.selectedOptions || []).map(o=>o.value).filter(Boolean)
  return opts.length ? opts.join(', ') : (kwEl.value || '').trim()
}

// Shared platform rules for buildFullPrompt
const PLATFORM_INSTRUCTIONS = {
  youtube: 'YouTube Shorts rules:\n- Title <= 60 chars, hooky.\n- Description 1–2 short sentences + CTA (watch/follow).\n- Hashtags: 6–10, mix broad + niche.',
  tiktok: 'TikTok rules:\n- Title <= 70 chars, punchy.\n- Description 1–2 short lines, conversational.\n- Hashtags: 8–15.',
  instagram: 'Instagram Reels rules:\n- Title <= 70 chars.\n- Description 2–3 lines, energetic.\n- Hashtags: 12–25.',
  facebook: 'Facebook post rules:\n- Title <= 80 chars.\n- Description 2–4 sentences with engagement question.\n- Hashtags: 3–8.',
  x: 'X (Twitter) rules:\n- Title <= 70 chars.\n- Description <= 240 chars.\n- Hashtags: 1–3 only.',
  shopee: 'Shopee listing rules:\n- Title <= 60 chars.\n- Description: 2–4 short bullet points focusing on benefits.\n- Tags: 5–12 product/category focused.'
}

// Platform limits for character/word counters (title max chars)
const PLATFORM_TITLE_LIMITS = { youtube: 60, tiktok: 70, instagram: 70, facebook: 80, x: 70, shopee: 60 }

function updateCharCounters(){
  const titleEl = document.getElementById('aiMainTitle')
  const overviewEl = document.getElementById('aiMainOverview')
  const titleCounterEl = document.getElementById('aiTitleCounter')
  const overviewCounterEl = document.getElementById('aiOverviewCounter')
  if(!titleEl || !overviewEl || !titleCounterEl || !overviewCounterEl) return
  const platform = (document.getElementById('aiPlatformSelect')?.value || 'youtube').trim() || 'youtube'
  const titleLimit = PLATFORM_TITLE_LIMITS[platform] != null ? PLATFORM_TITLE_LIMITS[platform] : 60
  const presetKey = (document.getElementById('aiPresetSelect')?.value || '').trim()
  const presetObj = presetKey && window.PresetsManager ? window.PresetsManager.get(presetKey) : null
  const wordLimit = (presetObj && presetObj.maxWords != null) ? presetObj.maxWords : 120
  const titleLen = String(titleEl.value || '').length
  const overviewText = String(overviewEl.value || '').trim()
  const wordCount = overviewText ? overviewText.split(/\s+/).filter(Boolean).length : 0
  function colorClass(current, max){ if(current <= max * 0.8) return '#7cb87c'; if(current <= max) return '#d4a84b'; return '#c75c5c' }
  titleCounterEl.textContent = `${titleLen} / ${titleLimit}`
  titleCounterEl.style.color = colorClass(titleLen, titleLimit)
  overviewCounterEl.textContent = `${wordCount} words${wordLimit ? ` (max ${wordLimit})` : ''}`
  overviewCounterEl.style.color = colorClass(wordCount, wordLimit)
}

const VIRALITY_RULES = `Virality rules:
- Start description with a hook in the first 6–10 words.
- Hook: kalimat pembuka menarik untuk 3 detik pertama (FYP); harus bikin scroll berhenti.
- Add a clear CTA. If goal includes Follower: add CTA for follow/subscribe/save/comment.`

/** Single source of truth for AI prompt. Used by generateFromMain and generateVariations. */
function buildFullPrompt(opts){
  const {
    title = '',
    overview = '',
    platform = 'youtube',
    lang = 'id',
    preset = null,
    tone = 'neutral',
    keywords = '',
    presetInstructions = ''
  } = opts
  const goalsArr = (preset && Array.isArray(preset.goal) && preset.goal.length) ? preset.goal : ['FYP', 'Viral']
  const goalsText = goalsArr.join(', ')
  const goalExplicit = `Konten harus dioptimalkan untuk: ${goalsText}. FYP = hook kuat 3 detik pertama; SEO = keyword alami di title/deskripsi; Viral = shareable & emosional; Penjualan = CTA beli jelas; Follower = CTA follow/subscribe/save.`
  let ctaGuide = 'CTA harus jelas dan sesuai tujuan konten (follow/subscribe/save atau beli).'
  if (preset && (preset.ctaMain || preset.cta)) {
    ctaGuide = `CTA harus sesuai tujuan: jika Penjualan → ${preset.ctaMain || preset.cta}; jika Follower → ajakan follow/subscribe/save.`
  }
  if (preset && preset.ctaAffiliate && String(preset.ctaAffiliate).trim()) {
    ctaGuide += ` Sertakan link/CTA affiliate: "${String(preset.ctaAffiliate).trim()}".`
  }
  const hashtagCount = (preset && preset.hashtagCount != null) ? preset.hashtagCount : 10
  const hashtagRule = `Hashtag: mix niche + keyword + 1–2 trending; total ${hashtagCount}; mendukung FYP dan SEO.`
  const maxWords = (preset && preset.maxWords != null) ? preset.maxWords : 120
  const languageInstruction = lang === 'en' ? 'Respond ONLY in English. Do not use any other language.' : 'Respond ONLY in Indonesian. Do not use any other language.'
  const platformInstruction = PLATFORM_INSTRUCTIONS[platform] || PLATFORM_INSTRUCTIONS.youtube
  const keywordFocus = keywords || 'none'
  let exampleBlock = ''
  if (preset && preset.exampleOutput && String(preset.exampleOutput).trim()) {
    exampleBlock = `\n\nContoh output yang diinginkan (ikuti gaya dan strukturnya):\n${String(preset.exampleOutput).trim()}\n\nGenerate konten baru dengan gaya serupa.\n`
  }
  const trendingBlock = (preset && preset.trendingContext && String(preset.trendingContext).trim())
    ? `\nKonteks trending: ${String(preset.trendingContext).trim()}\n`
    : ''
  return `${languageInstruction}\nYou are a creative social copywriter. Platform: ${platform}. Write in ${lang === 'id' ? 'Indonesian' : 'English'}.\n\nContext:\n- Title: "${title}"\n- Overview: "${overview}"\n- Keyword focus: ${keywordFocus}\n- Tone: ${tone}\n\n${goalExplicit}\n${ctaGuide}\n${hashtagRule}\nMax words description: ${maxWords}.\n\n${platformInstruction}\n${presetInstructions ? ('Preset rules: ' + presetInstructions + '\n\n') : ''}${VIRALITY_RULES}\n${trendingBlock}${exampleBlock}\n\nOutput JSON only with these exact keys: {"title":"...","description":"...","hashtags":["#..","#.."],"hook":"...","narratorScript":"..."}\n- hook: kalimat pembuka menarik untuk 3 detik pertama (FYP).\n- narratorScript: teks untuk voice/narator video (script yang dibacakan).\nReturn only the JSON.`.trim()

}

// ===== Keyword extraction & suggestions =====
const STOPWORDS_EN = new Set((`a,an,and,are,as,at,be,by,for,from,has,he,in,is,it,its,of,on,that,the,to,was,were,will,with`.split(',')));
const STOPWORDS_ID = new Set((`yang,dan,di,ke,dari,untuk,pada,adalah,ini,itu,sebuah,oleh,atau,karena,karna,adanya`.split(',')));

function normalizeTextForKeywords(text){
  try{
    const s = String(text||'').toLowerCase()
    // remove punctuation (keep unicode letters and numbers and spaces)
    return s.replace(/[^\p{L}0-9\s]+/gu, ' ')
  }catch(e){ return String(text||'').toLowerCase() }
}

function buildBigrams(tokens){
  const bs = []
  for(let i=0;i<tokens.length-1;i++){
    bs.push(tokens[i] + ' ' + tokens[i+1])
  }
  return bs
}

function extractKeywords(text, topN=5, platform){
  const raw = normalizeTextForKeywords(text)
  const toks = raw.split(/\s+/).filter(Boolean)
  // remove short tokens and stopwords
  const filtered = toks.filter(t => t.length >= 2 && !STOPWORDS_EN.has(t) && !STOPWORDS_ID.has(t) && !/^\d+$/.test(t))
  const bigrams = buildBigrams(filtered)
  const all = filtered.concat(bigrams)
  const freq = {}
  all.forEach(tok => { freq[tok] = (freq[tok]||0) + 1 })
  // weight title tokens slightly higher if platform suggests shorter focus
  const items = Object.keys(freq).map(k=>({k,v:freq[k]})).sort((a,b)=>b.v - a.v)
  return items.slice(0, topN).map(i=>i.k)
}

function getKeywordHistory(){
  try{ return JSON.parse(localStorage.getItem('keyword_history')||'[]') }catch(e){ return [] }
}
function pushKeywordHistory(list){
  try{
    const cur = getKeywordHistory()
    const merged = Array.from(new Set([...list, ...cur])).slice(0,50)
    localStorage.setItem('keyword_history', JSON.stringify(merged))
  }catch(e){}
}

const GENERATE_HISTORY_KEY = 'genco_generate_history'
const GENERATE_HISTORY_MAX = 50
const ACTIVE_PRESET_KEY = 'genco_active_preset'
const FEEDBACK_KEY = 'genco_feedback'
const FEEDBACK_MAX = 200
function getGenerateHistory(){
  try{ return JSON.parse(localStorage.getItem(GENERATE_HISTORY_KEY)||'[]') }catch(e){ return [] }
}
function pushGenerateHistory(entry){
  try{
    const list = getGenerateHistory()
    const id = 'h_' + Date.now()
    list.unshift(Object.assign({ id }, entry))
    const trimmed = list.slice(0, GENERATE_HISTORY_MAX)
    localStorage.setItem(GENERATE_HISTORY_KEY, JSON.stringify(trimmed))
  }catch(e){}
}
function getFeedbackStore(){
  try{ return JSON.parse(localStorage.getItem(FEEDBACK_KEY)||'[]') }catch(e){ return [] }
}
function setFeedback(id, rating){
  try{
    const list = getFeedbackStore().filter(x=> x.id !== id)
    list.unshift({ id, rating, ts: Date.now() })
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(list.slice(0, FEEDBACK_MAX)))
  }catch(e){}
}

async function suggestKeywords({useAI=false, provider='openrouter', apiKey='', title='', overview='', topN=5}){
  // if useAI and backend available, call AI to generate keywords
  if(useAI){
    try{
      const backend = getBackendURL()
      if(!backend) throw new Error('Backend not configured')
      const prompt = `Generate ${topN} short keyword phrases (comma separated) from the following TITLE and OVERVIEW. Return only a comma-separated list. TITLE: ${title} OVERVIEW: ${overview}`
      const out = await window.AI.generate({ provider, apiKey, prompt })
      if(!out) return []
      // split by comma
      return out.split(',').map(s=>s.trim()).filter(Boolean).slice(0, topN)
    }catch(e){ console.warn('AI keyword suggest failed', e); return [] }
  }
  // client-side extraction
  const baseText = ((title||'') + ' ' + (overview||'')).trim()
  if(!baseText) return []
  return extractKeywords(baseText, topN)
}
function maskKey(k){ try{ if(!k) return false; const s = String(k); return '***'+s.slice(-4) }catch(e){ return true } }

function showToast(message, type){
  type = type || 'info'
  let el = document.getElementById('genco-toast')
  if(!el){ el = document.createElement('div'); el.id = 'genco-toast'; el.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;max-width:320px;padding:12px 16px;border-radius:8px;background:#1a1f26;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.4);font-size:14px;transition:opacity 0.2s'; document.body.appendChild(el) }
  el.textContent = message
  el.style.background = type === 'error' ? '#4a2020' : type === 'success' ? '#1a3020' : '#1a1f26'
  el.style.opacity = '1'
  clearTimeout(el._toastTimer)
  el._toastTimer = setTimeout(()=>{ el.style.opacity = '0' }, 2800)
}

// -----------------------
// Core functions
// -----------------------

// Try to load full API key from backend (returns full key string or null)
// This is called during model loading when key is not in localStorage
async function loadApiKeyFromBackend(provider){
  try{
    const backendURL = getBackendURL()
    if(!backendURL) return null
    aiLog('info','loadApiKeyFromBackend.request',{ provider, backendURL })
    const controller = new AbortController()
    const timer = setTimeout(()=>controller.abort(), 5000)
    const res = await fetch(`${backendURL}/ai/get-key?provider=${encodeURIComponent(provider)}&full=true`, { headers: getAuthHeaders(), signal: controller.signal })
    clearTimeout(timer)
    if (res.status === 401) { try{ window.location.href = 'login.html' }catch(e){}; return null }
    if(!res.ok) return null
    const j = await res.json().catch(()=>({}))
    aiLog('info','loadApiKeyFromBackend.response',{ provider, result: j })
    if(j && j.apiKey) {
      const apiKey = String(j.apiKey)
      // 🆕 BARU: Save to localStorage cache
      localStorage.setItem(`ai_api_key_${provider}`, apiKey)
      aiLog('info','loadApiKeyFromBackend.cached',{ provider, cached: true })
      
      // 🆕 BARU: Populate input field if exists & empty
      const inputField = document.getElementById('settingsKey_single')
      if(inputField && !inputField.value){
        inputField.value = apiKey
        aiLog('info','loadApiKeyFromBackend.populateInput',{ provider })
      }
      
      return apiKey
    }
    return null
  }catch(e){ aiLog('warn','loadApiKeyFromBackend.error',{ provider, error: String(e) }); return null }
}

/**
 * 🆕 GLOBAL: Get API key untuk selected provider
 * Priority: localStorage cache → settings → input field → backend auto-load
 */
async function getKeyForProvider(provider) {
  if (!provider) return null
  
  try {
    // Priority 1: Check provider-specific localStorage cache (NEW)
    const cachedKey = localStorage.getItem(`ai_api_key_${provider}`)
    if (cachedKey && cachedKey.trim()) {
      aiLog('info','getKeyForProvider.fromCache',{ provider })
      return cachedKey
    }
    
    // Priority 2: Check ai-settings (OLD)
    try {
      const raw = localStorage.getItem('ai-settings')
      if (raw) {
        const s = JSON.parse(raw)
        const k = s?.keys?.[provider]
        if (k && String(k).trim()) {
          aiLog('info','getKeyForProvider.fromSettings',{ provider })
          // Cache it for next time
          localStorage.setItem(`ai_api_key_${provider}`, k)
          return String(k).trim()
        }
      }
    } catch (e) {}
    
    // Priority 3: Check general ai_api_key (OLD)
    const localKey = String(localStorage.getItem('ai_api_key')||'').trim()
    if (localKey) {
      aiLog('info','getKeyForProvider.fromLocalKey',{ provider })
      // Cache it for next time
      localStorage.setItem(`ai_api_key_${provider}`, localKey)
      return localKey
    }
    
    // Priority 4: Auto-load dari backend (NEW + FALLBACK)
    const backendKey = await loadApiKeyFromBackend(provider)
    if (backendKey) {
      aiLog('info','getKeyForProvider.fromBackend',{ provider })
      return backendKey
    }
    
    return null
  } catch (e) {
    aiLog('warn','getKeyForProvider.error',{ provider, error: String(e) })
    return null
  }
}

// Mount AI generator into the main page (#aiMainContainer)
function mountAIGeneratorMain(){
  try{
    console.debug('mountAIGeneratorMain: entry')
    const root = document.getElementById('aiMainContainer')
    if(!root){ console.error('mountAIGeneratorMain: aiMainContainer not found'); return }

    const displayName = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('auth_username')) || 'User'
    const profileInitial = (displayName.charAt(0) || 'U').toUpperCase()
    const esc = (s) => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML }

  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar panel">
        <div class="sidebar-profile">
          <div class="sidebar-avatar" aria-hidden="true">${esc(profileInitial)}</div>
          <span class="sidebar-username">${esc(displayName)}</span>
        </div>
        <div class="nav-item active" data-action="generator"><svg viewBox="0 0 24 24"><path d="M12 2L2 7v6c0 5 3.7 9.2 9 11 5.3-1.8 9-6 9-11V7l-10-5z"/></svg><span class="nav-label">Generator</span></div>
        <div class="nav-item" data-action="history"><svg viewBox="0 0 24 24"><path d="M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3z"/></svg><span class="nav-label">History</span></div>
        <div class="nav-item" data-action="presets"><svg viewBox="0 0 24 24"><path d="M12 7a5 5 0 1 0 5 5 5 5 0 0 0-5-5z"/></svg><span class="nav-label">Presets</span></div>
        <div style="flex:1"></div>
        <div class="nav-item" data-action="settings"><svg viewBox="0 0 24 24"><path d="M19.4 12.9a7.2 7.2 0 0 0 0-1.8l2.1-1.6-2-3.4-2.5.6a7 7 0 0 0-1.6-.9l-.4-2.6H9.9l-.4 2.6a7 7 0 0 0-1.6.9L5.4 6.1 3.4 9.5l2.1 1.6a7.2 7.2 0 0 0 0 1.8L3.4 15l2 3.4 2.5-.6c.5.4 1 .7 1.6.9l.4 2.6h4.2l.4-2.6c.6-.2 1.1-.5 1.6-.9l2.5.6 2-3.4z"/></svg><span class="nav-label">Settings</span></div>
        <div class="nav-item" data-action="logout"><svg viewBox="0 0 24 24"><path d="M16 13v-2H7V8l-5 4 5 4v-3zM20 3h-8v2h8v14h-8v2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/></svg><span class="nav-label">Logout</span></div>
      </aside>

      <main style="padding:6px">

        <div class="content-main">
          <section class="left-col">
            <div class="panel card">
              <input id="aiMainTitle" class="form-input" placeholder="Topic / Title" />
              <div id="aiTitleCounter" class="char-counter" style="font-size:11px;margin:5px;min-height:14px">0 / 60</div>
              <textarea id="aiMainOverview" class="form-textarea" placeholder="Overview / Description"></textarea>
              <div id="aiOverviewCounter" class="char-counter" style="font-size:11px;margin-top:4px;margin-left:5px;min-height:14px">0 words</div>
              <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">
                <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
                  <select id="aiLangSelect" class="form-select" style="flex:1;min-width:120px">
                    <option value="id">Indonesia</option>
                    <option value="en">English</option>
                  </select>
                  <select id="aiKeywordSelect" class="form-select" style="flex:1;min-width:120px">
                    <option value="">(auto)</option>
                  </select>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
                  <label style="font-size:12px;display:flex;align-items:center;gap:6px"><input id="aiKeywordUseAI" type="checkbox" /> Use AI</label>
                  <button id="aiKeywordSuggestBtn" class="secondary">Suggest</button>
                  <select id="aiToneSelect" class="form-select" style="flex:1;min-width:120px">
                    <option value="neutral">Neutral</option>
                    <option value="energetic">Energetic</option>
                    <option value="dramatic">Dramatic</option>
                    <option value="friendly">Friendly</option>
                  </select>
                </div>
                <div class="generate-row">
                  <button id="aiGenerateBtn" class="primary">Generate Content</button>
                  <button id="aiVariationsBtn" class="secondary">Buat 3 variasi</button>
                  <button id="aiClearBtn" class="secondary">Clear</button>
                </div>
              </div>
            </div>

            <div class="panel card">
              <h4 style="margin:0 0 8px 0">Presets</h4>
              <div style="display:flex;gap:8px;align-items:stretch;flex-wrap:wrap">
                <select id="aiPresetSelect" class="form-select" style="flex:1;min-width:150px">
                  <option value="">(Manual - no preset)</option>
                </select>
                <button id="managePresetsBtn" class="secondary" style="min-width:100px">Manage</button>
              </div>
            </div>

          </section>

          <aside class="right-col">
            <div class="panel output-panel">
              <h3>Output</h3>
              <div id="aiResultPanel">Hasil generate akan muncul di sini.</div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  `;

  // render header into <header id="aiMainHeader"> (semantic placement inside #ai-main)
  (function renderHeader(){
    const headerEl = document.getElementById('aiMainHeader')
    if(!headerEl) return
    console.debug('mountAIGeneratorMain: rendering header')
    try{ aiLog('info','startup',{ backendURL: getBackendURL() || null }) }catch(e){}
    headerEl.innerHTML = `
      <div class="panel" style="display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-direction: row-reverse;">
        <button id="sidebarToggle" class="burger-btn" aria-label="Menu" title="Menu"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
        <h1 class="app-header-title">AI Content Generator FYP &amp; Viral</h1>
        <div class="logo">
        <image src="./img/logo.svg" alt="Genco Logo" width="32" height="32" />
        </div>
      </div>
    `

    // create control panel (kept in main, not inside header)
    if(!document.getElementById('aiControlPanel')){
      const mainEl = document.querySelector('#aiMainContainer .app-shell main') || document.querySelector('#aiMainContainer main')
      const cp = document.createElement('div')
      cp.id = 'aiControlPanel'
      cp.className = 'panel header-controls'
      cp.innerHTML = `
        <div style="display:flex;gap:10px;align-items:center;flex:1">
          <select id="aiProviderSelect" class="select">
            <option value="gemini">Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="openrouter">OpenRouter</option>
            <option value="groq">Groq</option>
            <option value="together">Together</option>
            <option value="cohere">Cohere</option>
            <option value="huggingface">Hugging Face</option>
            <option value="deepseek">DeepSeek</option>
          </select>
          <select id="aiModelSelect" class="select">
            <option value="">(auto)</option>
          </select>
          <select id="aiPlatformSelect" class="small">
            <option value="tiktok">TikTok</option>
            <option value="youtube">YouTube Short</option>
            <option value="shopee">Shopee</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="x">X (Twitter)</option>
            <option value="linkedin">LinkedIn</option>
            <option value="pinterest">Pinterest</option>
          </select>
        </div>
        <div style="display:flex;gap:8px;justify-content:center">
          <div class="stat_serv" id="Status-server"></div>
           </div>
      `

      if(mainEl){
        const contentMain = mainEl.querySelector('.content-main')
        if(contentMain) mainEl.insertBefore(cp, contentMain)
        else mainEl.appendChild(cp)
      }else{
        headerEl.insertAdjacentElement('afterend', cp)
      }
      console.debug('mountAIGeneratorMain: control panel inserted')
      // populate backend status indicator in header
      updateBackendStatusIndicator('Status-server')
    }
  })()

  console.debug('mountAIGeneratorMain: innerHTML set, wiring events')

  // wiring
  document.getElementById('aiGenerateBtn')?.addEventListener('click', generateFromMain)
  document.getElementById('aiVariationsBtn')?.addEventListener('click', ()=> generateVariations())
  document.getElementById('aiClearBtn')?.addEventListener('click', ()=>{
    document.getElementById('aiMainTitle').value = ''
    document.getElementById('aiMainOverview').value = ''
    document.getElementById('aiResultPanel').innerHTML = 'Hasil generate akan muncul di sini.'
    try{ updateCharCounters() }catch(e){}
  })
  document.getElementById('aiMainTitle')?.addEventListener('input', updateCharCounters)
  document.getElementById('aiMainOverview')?.addEventListener('input', updateCharCounters)
  document.getElementById('aiPlatformSelect')?.addEventListener('change', updateCharCounters)
  try{ updateCharCounters() }catch(e){}

  // models wiring
  const providerEl = document.getElementById('aiProviderSelect')
  const modelEl = document.getElementById('aiModelSelect')
  // restore provider from settings if available
  const providerFromSettings = localStorage.getItem('ai_provider') || ''
  if(providerEl && providerFromSettings) providerEl.value = providerFromSettings
  providerEl?.addEventListener('change', ()=> loadModelsFor(providerEl.value || 'gemini', modelEl))
  // load models for initial provider (fire & forget, async)
  loadModelsFor(providerEl?.value || 'gemini', modelEl).catch(e => console.warn('initial loadModelsFor failed', e))

  // wire manage button (dropdown will be populated after updatePresetDropdown is defined)
  document.getElementById('managePresetsBtn')?.addEventListener('click', ()=> showView('presets'))
  const presetSel = document.getElementById('aiPresetSelect')
  if(presetSel){
    presetSel.addEventListener('change', ()=>{
      const key = String(presetSel.value || '').trim()
      try{ updatePresetPreview(key) }catch(e){}
      try{ updateCharCounters() }catch(e){}
    })
  }

  // Sidebar toggle (mobile): create overlay and wiring
  try{
    const sidebarToggle = document.getElementById('sidebarToggle')
    if(sidebarToggle){
      let overlay = document.querySelector('.sidebar-overlay')
      if(!overlay){ overlay = document.createElement('div'); overlay.className = 'sidebar-overlay'; document.body.appendChild(overlay) }
      const toggleSidebar = (open) => { document.body.classList.toggle('sidebar-open', !!open) }
      sidebarToggle.addEventListener('click', (e)=>{ e.preventDefault(); toggleSidebar(!document.body.classList.contains('sidebar-open')) })
      overlay.addEventListener('click', ()=> toggleSidebar(false))
      document.querySelectorAll('.sidebar .nav-item').forEach(n=> n.addEventListener('click', ()=> toggleSidebar(false)))
      window.addEventListener('resize', ()=> { if(window.innerWidth > 720 && document.body.classList.contains('sidebar-open')) document.body.classList.remove('sidebar-open') })
    }
  }catch(e){ console.warn('sidebar toggle wiring failed', e) }
  console.debug('mountAIGeneratorMain: sidebar wiring complete')

  // Navigation: sidebar items toggle views (generator / history / presets / settings)
  try{
    const navItems = document.querySelectorAll('#aiMainContainer .sidebar .nav-item')
    function showView(view){
      const set = document.getElementById('ai-settings-placeholder')
      const pres = document.getElementById('ai-presets-placeholder')
      const hist = document.getElementById('ai-history-placeholder')
      const gen = document.getElementById('aiMainContainer')
      if(view === 'settings'){
        if(gen) gen.style.display = 'none'
        if(pres) pres.style.display = 'none'
        if(hist) hist.style.display = 'none'
        if(set) set.style.display = 'block'
        renderSettingsPage()
      }else if(view === 'presets'){
        if(gen) gen.style.display = 'none'
        if(set) set.style.display = 'none'
        if(hist) hist.style.display = 'none'
        if(pres) pres.style.display = 'block'
        renderPresetsPage()
      }else if(view === 'history'){
        if(gen) gen.style.display = 'none'
        if(set) set.style.display = 'none'
        if(pres) pres.style.display = 'none'
        if(hist) hist.style.display = 'block'
        renderHistoryPage()
      }else{
        if(gen) gen.style.display = 'block'
        if(set) set.style.display = 'none'
        if(pres) pres.style.display = 'none'
        if(hist) hist.style.display = 'none'
      }
    }
    navItems.forEach(it=>{
      it.addEventListener('click', ()=>{
        navItems.forEach(n=>n.classList.remove('active'))
        it.classList.add('active')
        const action = it.getAttribute('data-action')
        if(action === 'settings') showView('settings')
        else if(action === 'presets') showView('presets')
        else if(action === 'history') showView('history')
        else if(action === 'logout') {
          (async ()=>{
            try{ sessionStorage.removeItem('auth_token'); sessionStorage.removeItem('auth_username') }catch(e){}
            try{
              // clear cached API keys inserted by app
              for(const k of Object.keys(localStorage)){
                if(String(k || '').startsWith('ai_api_key_')) localStorage.removeItem(k)
              }
            }catch(e){}
            window.location.href = 'login.html'
          })()
        }
        else showView('generator')
        // close sidebar on mobile
        if(document.body.classList.contains('sidebar-open')) document.body.classList.remove('sidebar-open')
      })
    })
  }catch(e){ console.warn('nav wiring failed', e) }

  // Settings page renderer + wiring
  function renderSettingsPage(){
    const placeholder = document.getElementById('ai-settings-placeholder')
    if(!placeholder) return

    // If already rendered, just update values
    const existing = placeholder.querySelector('.settings-page')
    if(existing){
      populateSettingsForm()
      return
    }

    placeholder.style.display = 'block'
    placeholder.innerHTML = `
      <div class="panel settings-page">
        <h2 style="margin-top:0">Settings</h2>
        <form id="settingsForm" onsubmit="event.preventDefault(); return false;">
          <div class="control-pane">
            <div class="control-group">
                <div class="control-label" style="display:flex;align-items:center;gap:8px">
                <label>Backend URL</label>
                <div id="presetsBackendIndicator" style="margin-left:8px;font-size:12px;color:#6a8;padding:6px 8px;background:rgba(0,40,20,0.3);border-radius:6px;border:1px solid rgba(106,168,136,0.2);display:flex;align-items:center;gap:6px;font-family:monospace">🔴 OFFLINE</div>
                </div>
                <div style="display:flex;gap:8px;align-items:center">
                  <div style="display:flex;gap:8px;align-items:center;flex:1">
                    <input id="settingsBackendURL" class="form-input" type="text" style="flex:1" placeholder="https://your-backend.workers.dev" />
                    <button type="button" id="settingsBackendTest" class="secondary">Test</button>
                    <button type="button" id="settingsBackendSave" class="primary">Save</button>
                  </div>
                  
                </div>
                <div style="font-size:12px;margin-top:6px;color:#c9d0b3">Backend untuk AI dan penyimpanan presets. Lokal (mis. http://127.0.0.1:8787) = simpan di project; external (mis. workers.dev) = simpan di server tersebut.</div>
              </div>

              <div class="control-group">
                <label>Default provider</label>
                <select id="settingsDefaultProvider" class="form-select">
                  <option value="gemini">Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="groq">Groq</option>
                  <option value="together">Together</option>
                  <option value="cohere">Cohere</option>
                  <option value="huggingface">Hugging Face</option>
                  <option value="deepseek">DeepSeek</option>
                </select>
              </div>

               <div class="control-group">
                 <label id="settingsKeyLabel">API Key</label>
                 <input id="settingsKey_single" class="form-input" type="password" style="flex:1" placeholder="sk-..." autocomplete="current-password" />
               </div>

            <div class="control-group">
             
              <div style="display:flex;gap:8px;align-items:center">
                
                <button type="button" id="settingsShowBtn" class="secondary">Show</button>
                <button type="button" id="testKey_single" class="primary">Test</button>
                <button type="button" id="settingsDeleteBtn" class="secondary">Delete from server</button>
              </div>
              <div id="settingsServerStatus" style="font-size:12px;margin-top:6px;color:#c9d0b3"></div>
            </div>

            <div style="display:flex;gap:10px;align-items:center">
              <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="settingsRemember" /> Remember API keys</label>
            </div>

            <div style="display:flex;gap:10px;align-items:center;margin-top:12px;padding-top:12px;border-top:1px solid var(--border-color)">
              <span style="font-size:14px">Theme:</span>
              <button type="button" id="settingsThemeToggle" class="theme-settings-btn secondary" aria-label="Toggle dark/light mode">
                <svg class="icon-sun-settings" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none; margin-right:4px;">
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
                <svg class="icon-moon-settings" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
                <span class="theme-label">Light</span>
              </button>
            </div>

            <div style="display:flex;gap:8px;margin-top:12px">
              <button type="button" id="settingsSaveBtn" class="primary">Save</button>
              <button type="button" id="settingsCancelBtn" class="secondary">Close</button>
            </div>

            <div id="settingsStatus" class="status info" style="display:none;margin-top:12px"></div>
          </div>
        </form>
      </div>
    `

        // update the backend status indicator now that element exists in Settings
        updateBackendStatusIndicator('presetsBackendIndicator')

    function showStatus(msg, type='info'){
      const el = document.getElementById('settingsStatus')
      if(!el) return
      el.textContent = msg
      el.className = 'status '+(type||'info')
      el.style.display = 'block'
      setTimeout(()=>{ if(el) el.style.display = 'none' }, 4000)
    }

    function getStoredAI(){ try{ return AppSettings.getAI() || { provider: 'gemini', keys: {} } }catch(e){ return { provider: 'gemini', keys: {} } } }

    // Save settings helper used by Settings UI and internal code
    function saveSettings(obj){
      try{
        const raw = localStorage.getItem('ai-settings')
        const s = raw ? JSON.parse(raw) : { provider: 'gemini', keys: {} }
        if(obj && typeof obj === 'object'){
          if(obj.provider) s.provider = obj.provider
          if(obj.keys && typeof obj.keys === 'object') s.keys = Object.assign(s.keys||{}, obj.keys)
        }
        localStorage.setItem('ai-settings', JSON.stringify(s))
        // also persist provider for convenience
        try{ if(s.provider) localStorage.setItem('ai_provider', s.provider) }catch(e){}
        // expose to other modules
        try{ window.AppSettings && typeof window.AppSettings.saveAI === 'function' && window.AppSettings.saveAI(s) }catch(e){}
        return s
      }catch(e){ console.warn('saveSettings failed', e); return null }
    }
    function populateSettingsForm(){
      const s = getStoredAI()
      const remember = localStorage.getItem('remember_api_keys')
      const prov = s.provider || 'gemini'
      document.getElementById('settingsDefaultProvider').value = prov
      document.getElementById('settingsKeyLabel').textContent = `API Key for ${prov}`
      document.getElementById('settingsRemember').checked = remember === null ? true : String(remember) === 'true'
      // delegate loading the key (only call backend if reachable to avoid console errors)
      ;(async ()=>{
        const backendURL = getBackendURL()
        const keyInput = document.getElementById('settingsKey_single')
        // if no backend configured, just populate from local settings
        if(!backendURL){ try{ if(keyInput) keyInput.value = s.keys?.[prov] || '' }catch(e){} return }

        // try a quick ping to /ai/debug with short timeout
        try{
          const controller = new AbortController()
          const timer = setTimeout(()=>controller.abort(), 800)
          const res = await fetch(backendURL + '/ai/debug', { 
            signal: controller.signal,
            headers: getAuthHeaders()
          })
          clearTimeout(timer)
          if(res && res.ok){
            try{ await loadKeyForProvider(prov) }catch(e){ /* ignore */ }
            return
          }
        }catch(e){ /* unreachable or timed out */ }

        // fallback: show stored key instead of calling backend
        try{ if(keyInput) keyInput.value = s.keys?.[prov] || '' }catch(e){}
      })()
    }

    // populate backend URL control from localStorage or app config
    try{
      const storedBackend = localStorage.getItem('backend_url') || ''
      const backendInput = document.getElementById('settingsBackendURL')
      if(backendInput){
        backendInput.value = storedBackend || (window.APP_CONFIG && window.APP_CONFIG.backendURL) || (window.AI && window.AI.backendURL) || ''
      }
    }catch(e){}

    // Load key for a specific provider (uses backend /ai/get-key when available)
    function loadKeyForProvider(provider){
      const s = getStoredAI()
      const backendURL = getBackendURL()

      document.getElementById('settingsKeyLabel').textContent = `API Key for ${provider}`
      // clear status while loading
      const statusEl = document.getElementById('settingsServerStatus')
      if(statusEl) statusEl.textContent = ''

      if(!backendURL){
        try{ document.getElementById('settingsKey_single').value = s.keys?.[provider] || '' }catch(e){}
        return
      }

      aiLog('info','getKey.request',{ provider, backendURL })
      // request full key when possible (frontend includes Authorization header)
      fetch(`${backendURL}/ai/get-key?provider=${encodeURIComponent(provider)}&full=true`, {
        headers: getAuthHeaders()
      })
        .then(r=>r.json())
        .then(j=>{
          aiLog('info','getKey.response',{ provider, result: j })
          try{
            // if server returned a masked key (fallback) use stored key instead
            const serverKey = (!j?.error ? (j.apiKey || '') : '')
            const useKey = (serverKey && serverKey.includes('...')) ? (s.keys?.[provider] || '') : serverKey || (s.keys?.[provider] || '')
            document.getElementById('settingsKey_single').value = useKey
          }catch(e){}
          // Query debug endpoint to show whether KV is bound in this runtime
          try{
            fetch(`${backendURL}/ai/debug`, {
              headers: getAuthHeaders()
            }).then(r2=>r2.json()).then(dj=>{
              const statusEl2 = document.getElementById('settingsServerStatus')
              if(!statusEl2) return
              if(dj && dj.kvBound) statusEl2.textContent = 'Server: KV bound (keys persisted)'
              else statusEl2.textContent = 'Server: KV not bound — keys may be ephemeral locally'
            }).catch(()=>{})
          }catch(e){}
        }).catch(err=>{ aiLog('error','getKey.error',{ provider, error: String(err) }); try{ document.getElementById('settingsKey_single').value = s.keys?.[provider] || '' }catch(e){} })
    }

    /**
     * Test API key dengan POST request (aman, tidak expose key di URL)
     * @returns {Promise<void>}
     */
    async function testKey(){
      const provider = document.getElementById('settingsDefaultProvider').value
      const input = document.getElementById('settingsKey_single')
      let key = input ? String(input.value||'').trim() : ''

      // If key looks masked (e.g. "abcd..."), try to restore full key from backend
      if(key && key.includes('...')){
        const full = await loadApiKeyFromBackend(provider)
        if(full){ key = String(full).trim(); try{ if(input) input.value = key }catch(e){} }
        else return showStatus('❌ API key ter-mask — silahkan login atau masukkan ulang API key', 'error')
      }

      if(!key) return showStatus('❌ API key tidak boleh kosong', 'error')
      
      const backendURL = getBackendURL()
      if(!backendURL) return showStatus('❌ Backend URL tidak dikonfigurasi', 'error')
      
      // Disable button, show loading
      const btn = document.getElementById('testKey_single')
      const originalText = btn?.textContent || 'Test'
      if(btn){ btn.disabled = true; btn.textContent = '⏳ Testing...' }
      
      try {
        // Setup timeout 8 detik
        const controller = new AbortController()
        const timeoutId = setTimeout(()=> controller.abort(), 8000)
        
        // POST request dengan API key di body (aman)
        const response = await fetch(`${backendURL}/ai/models`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ provider, apiKey: key }),
          signal: controller.signal
        })
        
        clearTimeout(timeoutId)
        
        // Handle status 401 (session expired)
        if(response.status === 401){
          showStatus('🔐 Session expired - silahkan login ulang', 'error')
          return
        }
        
        // Handle status 400 (invalid request)
        if(response.status === 400){
          const errorData = await response.json().catch(()=>({}))
          showStatus(`❌ ${errorData.error || 'Invalid request - periksa provider name'}`, 'error')
          aiLog('warn', 'testKey.400', { provider, error: errorData.error })
          return
        }
        
        // Handle status 429 (rate limit)
        if(response.status === 429){
          showStatus('⚠️ Rate limit - tunggu sebelum test lagi', 'warn')
          return
        }
        
        // Handle status 500 (server error)
        if(response.status === 500){
          const errorData = await response.json().catch(()=>({}))
          // Check if error adalah karena invalid key (common keywords dari API providers)
          const errorMsg = String(errorData.error || '').toLowerCase()
          const isInvalidKeyError = errorMsg.includes('invalid') || 
                                    errorMsg.includes('unauthorized') || 
                                    errorMsg.includes('not valid') ||
                                    errorMsg.includes('api key') ||
                                    errorMsg.includes('authentication')
          
          if(isInvalidKeyError){
            showStatus(`❌ Invalid API key - pastikan key benar\nDetail: ${errorData.error}`, 'error')
            aiLog('warn', 'testKey.invalid', { provider, error: errorData.error })
          } else {
            showStatus(`🔴 Backend error (500) - tim support sedang perbaiki\nDetail: ${errorData.error || 'Unknown error'}`, 'error')
            aiLog('error', 'testKey.500', { provider, error: errorData.error })
          }
          return
        }
        
        // Handle other errors
        if(!response.ok){
          showStatus(`❌ HTTP ${response.status} - ${response.statusText}`, 'error')
          aiLog('warn', 'testKey.http', { status: response.status, statusText: response.statusText })
          return
        }
        
        // Success response
        const data = await response.json()
        
        if(data.models && Array.isArray(data.models)){
          showStatus(`✅ API key valid!\nDitemukan ${data.models.length} model tersedia`, 'success')
          aiLog('info', 'testKey.success', { provider, modelCount: data.models.length })
        } else if(data.success || data.ok){
          showStatus('✅ API key valid!', 'success')
          aiLog('info', 'testKey.success', { provider })
        } else {
          showStatus('❌ API key validation gagal - cek format', 'error')
          aiLog('warn', 'testKey.noModels', { provider, response: data })
        }
        
      } catch(error){
        aiLog('error', 'testKey.catch', { provider, error: String(error) })
        
        if(error.name === 'AbortError'){
          showStatus('⏱️ Request timeout (>8s) - backend/AI provider lambat', 'error')
        } else if(error.message.includes('Failed to fetch')){
          showStatus('🌐 Network error - cek koneksi atau backend URL salah', 'error')
        } else {
          showStatus(`⚠️ Error: ${error.message}`, 'error')
        }
      } finally {
        // Restore button state
        if(btn){ 
          btn.disabled = false
          btn.textContent = originalText
        }
      }
    }

    async function saveSettingsFromForm(){
      const provider = document.getElementById('settingsDefaultProvider').value
      const apiKey = String(document.getElementById('settingsKey_single').value || '').trim()
      const remember = document.getElementById('settingsRemember').checked
      localStorage.setItem('remember_api_keys', remember ? 'true' : 'false')

      if(!apiKey) return showStatus('API key kosong', 'error')

        try{
        showStatus('Menyimpan kunci ke backend...', 'info')
          // read backend URL from settings input (allow overriding default)
          const backendInputEl = document.getElementById('settingsBackendURL')
          let backendURL = (backendInputEl && String(backendInputEl.value||'').trim()) || getBackendURL()
          backendURL = String(backendURL || '').replace(/\/+$/,'')
          if(!backendURL) throw new Error('Backend URL not configured')
          // persist chosen backend URL for future sessions and update runtime config
          try{ localStorage.setItem('backend_url', backendURL); window.APP_CONFIG = window.APP_CONFIG || {}; window.APP_CONFIG.backendURL = backendURL; window.AI = window.AI || {}; window.AI.backendURL = backendURL }catch(e){}
        aiLog('info','saveKey.request',{ provider, backendURL })
        const res = await fetch(`${backendURL}/ai/save-key`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ provider, apiKey })
        })
        const j = await res.json().catch(()=>({}))
        aiLog('info','saveKey.response',{ provider, result: j })
        if(res.ok && j?.ok){
          // save selected provider and key locally according to remember preference
          saveSettings({ provider, keys: { [provider]: apiKey } })
          try{
            if(remember){
              localStorage.setItem('ai_api_key', apiKey)
              localStorage.setItem('ai_provider', provider)
            }else{
              sessionStorage.setItem('ai_api_key', apiKey)
              sessionStorage.setItem('ai_provider', provider)
              // ensure persistent copies removed
              localStorage.removeItem('ai_api_key')
            }
          }catch(e){}
          showStatus('Settings disimpan di backend', 'success')
          const provEl = document.getElementById('aiProviderSelect')
          if(provEl){ provEl.value = provider; loadModelsFor(provider, document.getElementById('aiModelSelect')).catch(e => console.warn('loadModelsFor after save failed', e)) }
        }else{
          throw new Error(j?.error || 'Save failed')
        }
      }catch(e){ showStatus('Save failed: '+String(e?.message||e), 'error') }
    }

    // wire buttons
    populateSettingsForm()
    document.getElementById('testKey_single')?.addEventListener('click', ()=> testKey())
    document.getElementById('settingsDefaultProvider')?.addEventListener('change', (ev)=>{
      try{
        const p = (ev && ev.target && ev.target.value) || document.getElementById('settingsDefaultProvider').value
        // update label and load key for the selected provider (from backend or local)
        document.getElementById('settingsKeyLabel').textContent = `API Key for ${p}`
        try{ loadKeyForProvider(p) }catch(e){}
      }catch(e){ /* ignore */ }
    })

    // setup theme toggle button (settings page)
    const settingsThemeBtn = document.getElementById('settingsThemeToggle')
    if(settingsThemeBtn && window.ThemeManager){
      settingsThemeBtn.addEventListener('click', (e)=>{
        e.preventDefault()
        window.ThemeManager.toggle()
      })
    }

    // show/hide API key
    const showBtn = document.getElementById('settingsShowBtn')
    showBtn?.addEventListener('click', ()=>{
      const input = document.getElementById('settingsKey_single')
      if(!input) return
      if(input.type === 'password'){ input.type = 'text'; showBtn.textContent = 'Hide' }
      else { input.type = 'password'; showBtn.textContent = 'Show' }
    })

    // delete key from server (if backend bound)
    const delBtn = document.getElementById('settingsDeleteBtn')
    delBtn?.addEventListener('click', async ()=>{
      const provider = document.getElementById('settingsDefaultProvider').value
      // prefer getBackendURL() helper, fallback to globals
      let backendURL = ''
      try{ backendURL = getBackendURL() || (window.APP_CONFIG && window.APP_CONFIG.backendURL) || (window.AI && window.AI.backendURL) || '' }catch(e){ backendURL = '' }
      if(!backendURL) return showStatus('Backend URL tidak dikonfigurasi', 'error')

      // async confirm + delete with improved error handling and timeout
      (async ()=>{
        const debugEl = document.getElementById('settingsServerStatus') || document.getElementById('settingsStatus')
        try{
          let confirmed = false
          if(typeof window.showDeleteConfirm === 'function'){
            confirmed = await window.showDeleteConfirm('API Key untuk ' + provider)
          } else {
            confirmed = confirm('Hapus API key "'+provider+'" dari server? (Tindakan tidak bisa dibatalkan)')
          }
          if(!confirmed) return
          showStatus('Menghapus kunci API dari server...', 'info')
          if(debugEl) debugEl.textContent = 'DEBUG: initiating DELETE to server...'

          const controller = new AbortController()
          const to = setTimeout(()=> controller.abort(), 8000)
          let res
          const targetUrl = `${backendURL}/ai/delete-key?provider=${encodeURIComponent(provider)}`
          const authHeaders = getAuthHeaders()
          const authPresent = !!(authHeaders && (authHeaders.Authorization || authHeaders.authorization))
          if(debugEl) debugEl.textContent = `DEBUG: ${targetUrl} (auth: ${authPresent? 'present':'absent'})`
          try{
            res = await fetch(targetUrl, { 
              method: 'DELETE',
              headers: authHeaders,
              signal: controller.signal
            })
          }catch(fetchErr){
            clearTimeout(to)
            console.error('[settings.deleteKey] fetch error', fetchErr)
            if(debugEl) debugEl.textContent = 'Error: '+String(fetchErr?.message||fetchErr)
            return showStatus('Gagal menghubungi server: '+String(fetchErr?.message||fetchErr), 'error')
          }
          clearTimeout(to)

          let j = {}
          try{ j = await res.json() }catch(e){ j = {} }
          if(debugEl) debugEl.textContent = 'Response '+res.status+' - '+(j && j.error ? j.error : (j && j.ok? 'ok':'no body'))

          if(res.ok && j?.ok){
            showStatus('API key dihapus dari server', 'success')
            // clear displayed value and local copies (localStorage + sessionStorage)
            try{ document.getElementById('settingsKey_single').value = '' }catch(e){}
            try{
              const s = getStoredAI()
              if(s && s.keys) s.keys[provider] = ''
              saveSettings(s)
              // remove any persisted/session copies of the active provider key
              try{ localStorage.removeItem('ai_api_key') }catch(e){}
              try{ sessionStorage.removeItem('ai_api_key') }catch(e){}
              try{ localStorage.removeItem('ai_provider') }catch(e){}
              try{ sessionStorage.removeItem('ai_provider') }catch(e){}
              // propagate to AppSettings if present
              try{ window.AppSettings && typeof window.AppSettings.saveAI === 'function' && window.AppSettings.saveAI(s) }catch(e){}
            }catch(e){}
          }else{
            // Server-side deletion failed; log and still clear local copies so user isn't left with keys in browser
            const errMsg = j?.error || `${res.status} ${res.statusText}`
            console.warn('[settings.deleteKey] server error', res.status, errMsg)
            try{ document.getElementById('settingsKey_single').value = '' }catch(e){}
            try{
              const s = getStoredAI()
              if(s && s.keys) s.keys[provider] = ''
              saveSettings(s)
              try{ localStorage.removeItem('ai_api_key') }catch(e){}
              try{ sessionStorage.removeItem('ai_api_key') }catch(e){}
              try{ localStorage.removeItem('ai_provider') }catch(e){}
              try{ sessionStorage.removeItem('ai_provider') }catch(e){}
              try{ window.AppSettings && typeof window.AppSettings.saveAI === 'function' && window.AppSettings.saveAI(s) }catch(e){}
            }catch(e){}
            showStatus('Gagal menghapus di server: '+String(errMsg||'')+'. Local keys dihapus saja.', 'warning')
          }
        }catch(e){ 
          console.error('[settings.deleteKey] error:', e)
          if(document.getElementById('settingsServerStatus')) document.getElementById('settingsServerStatus').textContent = 'Error: '+String(e?.message||e)
          showStatus('Gagal menghapus API key: '+String(e?.message||e), 'error') 
        }
      })()
    })
    document.getElementById('settingsSaveBtn')?.addEventListener('click', saveSettingsFromForm)
    // backend test button: ping /ai/debug
    document.getElementById('settingsBackendTest')?.addEventListener('click', async ()=>{
      const be = document.getElementById('settingsBackendURL')
      if(!be) return showStatus('Backend input not found','error')
      let url = String(be.value||'').trim()
      url = url.replace(/\/+$/,'')
      if(!url) return showStatus('Backend URL kosong','error')
      showStatus('Testing backend...', 'info')
      try{
        const r = await fetch(url + '/ai/debug', {
          headers: getAuthHeaders()
        })
        const j = await r.json().catch(()=>({}))
        if(j && j.ok) showStatus('Backend reachable — KV bound: '+Boolean(j.kvBound), 'success')
        else showStatus('Backend responded but unexpected body', 'error')
      }catch(e){ showStatus('Backend test failed: '+String(e?.message||e), 'error') }
    })
    // save backend url button
    document.getElementById('settingsBackendSave')?.addEventListener('click', async ()=>{
      const be = document.getElementById('settingsBackendURL')
      if(!be) return showStatus('Backend input not found','error')
      let url = String(be.value||'').trim()
      url = url.replace(/\/+$/,'')
      if(!url) return showStatus('Backend URL kosong','error')
      try{
        localStorage.setItem('backend_url', url)
        window.APP_CONFIG = window.APP_CONFIG || {}; window.APP_CONFIG.backendURL = url
        window.AI = window.AI || {}; window.AI.backendURL = url
        showStatus('Backend URL disimpan', 'success')
      }catch(e){ showStatus('Save failed: '+String(e?.message||e), 'error') }
    })
    document.getElementById('settingsCancelBtn')?.addEventListener('click', ()=>{
      document.querySelectorAll('#aiMainContainer .sidebar .nav-item').forEach(n=>n.classList.remove('active'))
      const genNav = document.querySelector('#aiMainContainer .sidebar .nav-item[data-action="generator"]')
      if(genNav) genNav.classList.add('active')
      // show generator
      document.getElementById('ai-settings-placeholder').style.display = 'none'
      document.getElementById('aiMainContainer').style.display = 'block'
    })
  }

  console.debug('mountAIGeneratorMain: renderSettingsPage defined')

  function renderHistoryPage(){
    const placeholder = document.getElementById('ai-history-placeholder')
    if(!placeholder) return
    const list = getGenerateHistory()
    const feedbackList = getFeedbackStore()
    const byPlatform = {}
    const byPreset = {}
    list.forEach(e=>{
      const p = e.platform || '(none)'
      byPlatform[p] = (byPlatform[p]||0) + 1
      const k = e.presetKey || '(manual)'
      byPreset[k] = (byPreset[k]||0) + 1
    })
    const topPreset = Object.keys(byPreset).length ? Object.entries(byPreset).sort((a,b)=>b[1]-a[1])[0] : null
    const goodCount = feedbackList.filter(x=>x.rating==='good').length
    const badCount = feedbackList.filter(x=>x.rating==='bad').length
    const platformLines = Object.entries(byPlatform).map(([k,v])=>k+': '+v).join(' · ') || '-'
    placeholder.style.display = 'block'
    placeholder.innerHTML = `
      <div class="panel presets-page">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <h2>History Generate</h2>
          <div style="display:flex;gap:8px">
            <button id="historyExportCsvBtn" class="secondary">Export riwayat CSV</button>
            <button id="historyCloseBtn" class="secondary">Close</button>
          </div>
        </div>
        <div id="historyStats" style="margin-top:10px;padding:10px;background:rgba(255,255,255,0.03);border-radius:8px;font-size:13px;color:#aaa">
          <strong>Stats</strong>: Total ${list.length} generate. Platform: ${platformLines}. ${topPreset ? 'Preset terbanyak: ' + topPreset[0] + ' (' + topPreset[1] + ').' : ''} Feedback: ${goodCount} Bagus, ${badCount} Kurang.
        </div>
        <p style="font-size:13px;color:#888;margin-top:8px">Daftar generate terakhir. Klik "Pakai lagi" untuk mengisi Title & Overview dan kembali ke Generator.</p>
        <div id="historyList" style="margin-top:12px;display:flex;flex-direction:column;gap:8px"></div>
        ${list.length === 0 ? '<p style="color:#666;margin-top:12px">Belum ada riwayat.</p>' : ''}
      </div>
    `
    const listEl = document.getElementById('historyList')
    if(listEl && list.length){
      list.forEach(entry=>{
        const d = entry.ts ? new Date(entry.ts) : null
        const dateStr = d ? d.toLocaleString() : ''
        const titleSnippet = (entry.title || '').slice(0, 50) + ((entry.title||'').length > 50 ? '…' : '')
        const row = document.createElement('div')
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px;background:rgba(255,255,255,0.03);border-radius:8px;flex-wrap:wrap;gap:8px'
        row.innerHTML = `
          <div>
            <div style="font-weight:600">${(titleSnippet || '(no title)').replace(/</g,'&lt;')}</div>
            <div style="font-size:12px;color:#888;margin-top:4px">${entry.platform || ''}${entry.presetKey ? ' · ' + String(entry.presetKey).replace(/</g,'&lt;') : ''}${entry.goals ? ' · ' + String(entry.goals).replace(/</g,'&lt;') : ''} · ${entry.type || 'generate'} · ${dateStr}</div>
          </div>
          <button class="small primary" data-history-id="${entry.id || ''}" data-history-title="${String(entry.title||'').replace(/"/g,'&quot;')}" data-history-overview="${String(entry.overview||'').replace(/"/g,'&quot;').replace(/</g,'&lt;')}">Pakai lagi</button>
        `
        listEl.appendChild(row)
      })
      listEl.querySelectorAll('button[data-history-id]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const title = btn.getAttribute('data-history-title') || ''
          const overview = btn.getAttribute('data-history-overview') || ''
          const titleEl = document.getElementById('aiMainTitle')
          const overviewEl = document.getElementById('aiMainOverview')
          if(titleEl) titleEl.value = title
          if(overviewEl) overviewEl.value = overview
          showView('generator')
          document.querySelectorAll('#aiMainContainer .sidebar .nav-item').forEach(n=>n.classList.remove('active'))
          const genNav = document.querySelector('#aiMainContainer .sidebar .nav-item[data-action="generator"]')
          if(genNav) genNav.classList.add('active')
        })
      })
    }
    document.getElementById('historyExportCsvBtn')?.addEventListener('click', ()=>{
      const list = getGenerateHistory()
      const headers = ['ts','date','title','overview','platform','presetKey','goals','type']
      const rows = [headers]
      list.forEach(e=>{
        const d = e.ts ? new Date(e.ts) : null
        rows.push([
          e.ts || '',
          d ? d.toISOString() : '',
          (e.title||'').replace(/"/g,'""'),
          (e.overview||'').replace(/"/g,'""'),
          e.platform || '',
          e.presetKey || '',
          (e.goals||'').replace(/"/g,'""'),
          e.type || ''
        ])
      })
      const csv = rows.map(r=> r.map(c=>'"'+String(c)+'"').join(',')).join('\n')
      const blob = new Blob(['\ufeff'+csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'genco_history_' + new Date().toISOString().slice(0,10) + '.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      showToast('Riwayat di-export', 'success')
    })
    document.getElementById('historyCloseBtn')?.addEventListener('click', ()=>{
      placeholder.style.display = 'none'
      document.getElementById('aiMainContainer').style.display = 'block'
      document.querySelectorAll('#aiMainContainer .sidebar .nav-item').forEach(n=>n.classList.remove('active'))
      const genNav = document.querySelector('#aiMainContainer .sidebar .nav-item[data-action="generator"]')
      if(genNav) genNav.classList.add('active')
    })
  }

  // Presets page renderer (sync from backend first so list is global/cross-device)
  function renderPresetsPage(){
    const placeholder = document.getElementById('ai-presets-placeholder')
    if(!placeholder) return
    const existing = placeholder.querySelector('.presets-page')
    if(existing){ return }

    ;(window.PresetsManager.syncFromBackend || (()=>Promise.resolve()))().then(()=>{
    const presets = window.PresetsManager.list()
    placeholder.innerHTML = `
      <div class="panel presets-page">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h2 style="margin:0">Presets (Manage)</h2>
          <button id="presetsCloseBtn" class="secondary">Close</button>
        </div>
        
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
          <input id="presetSearchInput" type="text" class="form-input" placeholder="🔍 Cari preset..." style="flex:1;min-width:150px" />
          <select id="presetFilterPlatform" class="form-select" style="min-width:120px">
            <option value="">(Platform)</option>
            <option value="youtube">YouTube</option>
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram</option>
            <option value="shopee">Shopee</option>
          </select>
          <select id="presetFilterGoal" class="form-select" style="min-width:120px">
            <option value="">(Goal)</option>
            <option value="Viral">Viral</option>
            <option value="FYP">FYP</option>
            <option value="Follower">Follower</option>
            <option value="Penjualan">Penjualan</option>
          </select>
          <button id="presetResetFilterBtn" class="secondary">Reset</button>
        </div>
        
        <div id="presetFilterStats" style="font-size:11px;color:#888;margin-bottom:8px;padding:6px 8px;background:rgba(100,100,100,0.1);border-radius:4px">
          Menampilkan: <b><span id="presetCountShowing">0</span>/<span id="presetCountTotal">0</span></b> preset
        </div>
        
        <div id="presetsList" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:12px;margin-top:8px"></div>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <input id="newPresetName" class="form-input" placeholder="Nama preset baru" style="flex:1;min-width:160px" />
          <button id="createPresetBtn" class="primary">Buat</button>
        </div>
        
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.08);display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <span style="font-size:12px;color:#888">Backup aman (simpan ke file):</span>
          <button id="presetsExportBackupBtn" class="secondary" type="button">Export backup (.json)</button>
          <label style="margin:0;cursor:pointer">
            <input type="file" id="presetsImportBackupInput" accept=".json,application/json" style="display:none" />
            <span class="secondary" style="display:inline-block;padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2)">Import backup</span>
          </label>
        </div>
      </div>
    `

    // presetsBackendIndicator moved to Settings page; ensure no stale call remains here

    function renderList(){
      const listEl = document.getElementById('presetsList')
      listEl.innerHTML = ''
      const items = window.PresetsManager.list()
      // fetch storage to read _serverSynced flags
      const storage = (window.PresetsManager && typeof window.PresetsManager.getStorage === 'function') ? window.PresetsManager.getStorage() : { userPresets: {} }
      items.forEach(it=>{
        const el = document.createElement('div')
        el.style.display = 'flex'
        el.style.justifyContent = 'space-between'
        el.style.alignItems = 'center'
        el.style.gap = '8px'
        el.style.padding = '10px'
        el.style.borderRadius = '8px'
        el.style.background = 'rgba(255,255,255,0.02)'
        el.style.border = '1px solid rgba(255,255,255,0.04)'

        // left: status dot + title + subtitle (dot moved left of name for cleaner layout)
        const left = document.createElement('div')
        left.style.display = 'flex'
        left.style.alignItems = 'center'
        left.style.gap = '10px'

        // status dot (only for user presets)
        if(!it.builtin){
          const synced = storage.userPresets && storage.userPresets[it.key] && storage.userPresets[it.key]._serverSynced
          const dot = document.createElement('span')
          dot.style.width = '12px'
          dot.style.height = '12px'
          dot.style.borderRadius = '50%'
          dot.style.display = 'inline-block'
          dot.title = synced ? 'Tersinkron ke server' : 'Belum tersinkron (lokal)'
          dot.style.background = synced ? '#26a54a' : '#e09b2d'
          dot.style.flex = '0 0 auto'
          left.appendChild(dot)
        }

        const textWrap = document.createElement('div')
        textWrap.style.display = 'flex'
        textWrap.style.flexDirection = 'column'
        textWrap.style.gap = '4px'
        const title = document.createElement('div')
        title.style.fontWeight = '600'
        title.textContent = it.label
        const subtitle = document.createElement('div')
        subtitle.style.fontSize = '12px'
        subtitle.style.color = '#aaa'
        if(it.builtin) subtitle.textContent = 'Template • Built-in'
        else {
          const p = (storage.userPresets && storage.userPresets[it.key] && storage.userPresets[it.key].platform) ? storage.userPresets[it.key].platform : ''
          subtitle.textContent = p ? `User preset • ${p}` : 'User preset'
        }
        textWrap.appendChild(title)
        textWrap.appendChild(subtitle)
        left.appendChild(textWrap)

        // right: actions
        const actions = document.createElement('div')
        actions.style.display = 'flex'
        actions.style.gap = '8px'
        const editBtn = document.createElement('button')
        editBtn.className = 'small btn-edit'
        editBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="m8.492 11.265l-1.06 4.243l4.242-1.061l6.364-6.364L14.856 4.9zm13.259-6.894l1.06 1.06a1.5 1.5 0 0 1 0 2.122l-3.311 3.31m-1.462-2.78l3.713-3.712a1.5 1.5 0 0 0 0-2.121L20.69 1.189a1.5 1.5 0 0 0-2.121 0l-3.713 3.71"/><path d="M18.75 14.25v7.5a1.5 1.5 0 0 1-1.5 1.5h-15a1.5 1.5 0 0 1-1.5-1.5v-15a1.5 1.5 0 0 1 1.5-1.5h7.5"/></g></svg>'
        editBtn.title = 'Edit'
        editBtn.dataset.preset = it.key
        editBtn.dataset.action = 'edit'
        const delBtn = document.createElement('button')
        delBtn.className = 'small btn-delete'
        delBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M7.616 20q-.672 0-1.144-.472T6 18.385V6H5V5h4v-.77h6V5h4v1h-1v12.385q0 .69-.462 1.153T16.384 20zM17 6H7v12.385q0 .269.173.442t.443.173h8.769q.23 0 .423-.192t.192-.424zM9.808 17h1V8h-1zm3.384 0h1V8h-1zM7 6v13z"/></svg>'
        delBtn.title = 'Delete'
        delBtn.dataset.preset = it.key
        delBtn.dataset.action = 'delete'
        if(it.builtin){ delBtn.disabled = true; delBtn.title = 'Builtin template — tidak bisa dihapus' }
        const dlBtn = document.createElement('button')
        dlBtn.className = 'small btn-download'
        dlBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path stroke-dasharray="32" d="M12 21c-4.97 0 -9 -4.03 -9 -9c0 -4.97 4.03 -9 9 -9"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="32;0"/></path><path stroke-dasharray="2 4" stroke-dashoffset="6" d="M12 3c4.97 0 9 4.03 9 9c0 4.97 -4.03 9 -9 9" opacity="0"><set fill="freeze" attributeName="opacity" begin="0.45s" to="1"/><animateTransform fill="freeze" attributeName="transform" begin="0.45s" dur="0.6s" type="rotate" values="-180 12 12;0 12 12"/><animate attributeName="stroke-dashoffset" begin="0.85s" dur="0.6s" repeatCount="indefinite" to="0"/></path><path stroke-dasharray="10" stroke-dashoffset="10" d="M12 8v7.5"><animate fill="freeze" attributeName="stroke-dashoffset" begin="0.85s" dur="0.2s" to="0"/></path><path stroke-dasharray="8" stroke-dashoffset="8" d="M12 15.5l3.5 -3.5M12 15.5l-3.5 -3.5"><animate fill="freeze" attributeName="stroke-dashoffset" begin="1.05s" dur="0.2s" to="0"/></path></g></svg>'
        dlBtn.title = 'Download preset as JSON'
        dlBtn.dataset.preset = it.key
        dlBtn.dataset.action = 'download'
        actions.appendChild(editBtn)
        actions.appendChild(dlBtn)
        actions.appendChild(delBtn)

        el.appendChild(left)
        el.appendChild(actions)
        listEl.appendChild(el)
      })
    }

    function esc(v){ return String(v||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
    function getEditVal(id){ const el = document.getElementById(id); return el ? String(el.value||'').trim() : '' }
    function getEditNum(id, def){ const n = parseInt(document.getElementById(id)?.value, 10); return isNaN(n) ? def : n }
    function getEditChecks(name){ return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(el=>el.value) }

    function openEditor(key){
      const data = window.PresetsManager.get(key) || window.PresetsManager.getDefaultPreset({ label: key })
      const goalArr = Array.isArray(data.goal) ? data.goal : (data.goal ? String(data.goal).split(',').map(s=>s.trim()).filter(Boolean) : [])
      const emotionArr = Array.isArray(data.emotionTrigger) ? data.emotionTrigger : []
      const ctaEngArr = Array.isArray(data.ctaEngagement) ? data.ctaEngagement : []
      const modal = document.createElement('div')
      modal.className = 'panel preset-editor-modal'
      modal.style.marginTop = '12px'
      modal.style.maxHeight = '85vh'
      modal.style.overflowY = 'auto'
      modal.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          <h3 style="margin:0">Edit Preset: ${esc(key)}</h3>
          <div style="display:flex;gap:8px;flex-wrap: wrap;">
            <button type="button" class="small" data-template="JualanViral">Jualan Viral</button>
            <button type="button" class="small" data-template="EdukasiViral">Edukasi Viral</button>
            <button type="button" class="small" data-template="BrandingViral">Branding Viral</button>
            <button id="cancelPresetEd" class="secondary">Cancel</button>
            <button id="savePresetEd" class="primary">Save</button>
          </div>
        </div>
        <div class="preset-accordion" style="display:flex;flex-direction:column;gap:8px">
          <details class="preset-section" open>
            <summary style="cursor:pointer;font-weight:600;padding:6px 0">🧩 Section 1: Basic Info</summary>
            <div style="padding:8px 0 0 12px;display:flex;flex-direction:column;gap:8px">
              <label>Label Preset <span title="Digunakan untuk mengoptimalkan FYP dan SEO">?</span></label>
              <input id="editLabel" class="form-input" placeholder="Viral Jualan Pro" value="${esc(data.label||key)}" style="max-width:320px" />
              <label>Platform</label>
              <select id="editPlatform" class="form-select">
                <option value="tiktok" ${(data.platform||'')==='tiktok'?'selected':''}>TikTok</option>
                <option value="youtube" ${(data.platform||'')==='youtube'?'selected':''}>YouTube Shorts</option>
                <option value="shopee" ${(data.platform||'')==='shopee'?'selected':''}>Shopee</option>
                <option value="instagram" ${(data.platform||'')==='instagram'?'selected':''}>Instagram Reels</option>
                <option value="facebook" ${(data.platform||'')==='facebook'?'selected':''}>Facebook</option>
                <option value="X" ${(data.platform||'')==='X'?'selected':''}>X (Twitter)</option>
                 <option value="linkedin" ${(data.platform||'')==='linkedin'?'selected':''}>LinkedIn</option>
                <option value="pinterest" ${(data.platform||'')==='pinterest'?'selected':''}>Pinterest</option>
              </select>
              <label>Tujuan Utama (Goal)</label>
              <textarea id="editGoal" class="form-textarea" rows="3" placeholder="Contoh: FYP, SEO, Viewer atau Meningkatkan penjualan dengan hook kuat atau Viral di TikTok dan dapat follower baru. Jelaskan tujuan spesifik Anda...">${esc(Array.isArray(data.goal) ? data.goal.join(', ') : (data.goal || ''))}</textarea>
            </div>
          </details>
          <details class="preset-section">
            <summary style="cursor:pointer;font-weight:600;padding:6px 0">🧑‍💼 Section 2: AI Role & Audience</summary>
            <div style="padding:8px 0 0 12px;display:flex;flex-direction:column;gap:8px">
              <label>Peran AI (Role / Persona)</label>
              <textarea id="editRole" class="form-textarea" rows="2" placeholder="Kamu adalah viral content strategist dan social media copywriter profesional">${esc(data.role)}</textarea>
              <label>Target Audiens</label>
              <textarea id="editTargetAudience" class="form-textarea" rows="2" placeholder="Usia 18–35, suka belanja online, suka promo, pemula">${esc(data.targetAudience)}</textarea>
            </div>
          </details>
          <details class="preset-section">
            <summary style="cursor:pointer;font-weight:600;padding:6px 0">✍️ Section 3: Style & Emotion</summary>
            <div style="padding:8px 0 0 12px;display:flex;flex-direction:column;gap:8px">
              <label>Gaya / Tone</label>
              <input id="editTone" class="form-input" placeholder="Santai, persuasif, relatable, urgency ringan" value="${esc(data.tone)}" />
              <label>Aturan Bahasa (Language Rules)</label>
              <textarea id="editLanguageRules" class="form-textarea" rows="2" placeholder="Bahasa Indonesia santai, kalimat pendek, maksimal 2 emoji, tidak formal">${esc(data.languageRules)}</textarea>
              <label>Emosi Target (Emotion Trigger)</label>
              <textarea id="editEmotion" class="form-textarea" rows="3" placeholder="Contoh: Penasaran, Takut ketinggalan, Senang, Termotivasi, Ingin beli atau Gabungan emosi yang membuat viewer tertarik...">${esc(Array.isArray(data.emotionTrigger) ? data.emotionTrigger.join(', ') : (data.emotionTrigger || ''))}</textarea>
            </div>
          </details>
          <details class="preset-section">
            <summary style="cursor:pointer;font-weight:600;padding:6px 0">🧱 Section 4: Structure & Format</summary>
            <div style="padding:8px 0 0 12px;display:flex;flex-direction:column;gap:8px">
              <label>Struktur Output</label>
              <input id="editStructure" class="form-input" placeholder="Hook → Problem → Benefit → Proof → Question → CTA" value="${esc(data.structure)}" />
              <label>Hook Style</label>
              <textarea id="editHookStyle" class="form-textarea" rows="2" placeholder="Contoh: Pertanyaan, Fakta mengejutkan, Rahasia, Larangan, Cerita singkat atau Hook style custom kamu...">${esc(data.hookStyle || '')}</textarea>
              <label>Format Output</label>
              <select id="editFormatOutput" class="form-select">
                <option value="">—</option>
                <option value="Per baris sesuai struktur" ${(data.formatOutput||'')==='Per baris sesuai struktur'?'selected':''}>Per baris sesuai struktur</option>
                <option value="1 paragraf" ${(data.formatOutput||'')==='1 paragraf'?'selected':''}>1 paragraf</option>
                <option value="2 paragraf" ${(data.formatOutput||'')==='2 paragraf'?'selected':''}>2 paragraf</option>
              </select>
              <label>Panjang Konten</label>
              <select id="editLength" class="form-select">
                <option value="3–4 kalimat" ${(data.length||'')==='3–4 kalimat'?'selected':''}>3–4 kalimat</option>
                <option value="4–6 kalimat" ${(data.length||'')==='4–6 kalimat'?'selected':''}>4–6 kalimat</option>
                <option value="6–8 kalimat" ${(data.length||'')==='6–8 kalimat'?'selected':''}>6–8 kalimat</option>
                <option value="short" ${(data.length||'')==='short'?'selected':''}>short</option>
                <option value="medium" ${(data.length||'')==='medium'?'selected':''}>medium</option>
                <option value="long" ${(data.length||'')==='long'?'selected':''}>long</option>
              </select>
            </div>
          </details>
          <details class="preset-section">
            <summary style="cursor:pointer;font-weight:600;padding:6px 0">🔍 Section 5: SEO & Discovery</summary>
            <div style="padding:8px 0 0 12px;display:flex;flex-direction:column;gap:8px">
              <label>Keyword Utama (SEO Focus)</label>
              <input id="editKeywordMain" class="form-input" placeholder="skincare murah" value="${esc(data.keywordMain)}" />
              <label>Keyword Tambahan (comma separated)</label>
              <input id="editKeywordExtra" class="form-input" placeholder="glowing, wajah bersih, aman" value="${esc(data.keywordExtra)}" />
              <label>Hashtag Strategy</label>
              <textarea id="editHashtagStrategy" class="form-textarea" rows="2" placeholder="Contoh: Niche + keyword, Keyword + trending, Campuran atau strategi hashtag custom kamu...">${esc(data.hashtagStrategy || '')}</textarea>
              <label>Jumlah Hashtag</label>
              <input type="number" id="editHashtagCount" class="form-input" min="1" max="30" value="${data.hashtagCount != null ? data.hashtagCount : 10}" style="max-width:80px" />
            </div>
          </details>
          <details class="preset-section">
            <summary style="cursor:pointer;font-weight:600;padding:6px 0">📢 Section 6: Engagement & Conversion</summary>
            <div style="padding:8px 0 0 12px;display:flex;flex-direction:column;gap:8px">
              <label>CTA Utama (Penjualan)</label>
              <input id="editCtaMain" class="form-input" placeholder="Klik keranjang sekarang" value="${esc(data.ctaMain || data.cta)}" />
              <label>Link/CTA Affiliate (opsional)</label>
              <input id="editCtaAffiliate" class="form-input" placeholder="Link di bio / Klik link" value="${esc(data.ctaAffiliate || '')}" />
              <label>CTA Engagement</label>
              <textarea id="editCtaEngagement" class="form-textarea" rows="2" placeholder="Contoh: Comment, Save, Share, Follow atau kombinasi engagement yang diinginkan...">${esc(Array.isArray(data.ctaEngagement) ? data.ctaEngagement.join(', ') : (data.ctaEngagement || ''))}</textarea>
              <label>Engagement Goal</label>
              <textarea id="editEngagementGoal" class="form-textarea" rows="2" placeholder="Contoh: Komentar, Save, Share, Kombinasi atau engagement goal prioritas kamu...">${esc(data.engagementGoal || '')}</textarea>
            </div>
          </details>
          <details class="preset-section">
            <summary style="cursor:pointer;font-weight:600;padding:6px 0">🚫 Section 7: Control & Quality</summary>
            <div style="padding:8px 0 0 12px;display:flex;flex-direction:column;gap:8px">
              <label>Larangan (Negative Rules)</label>
              <textarea id="editNegativeRules" class="form-textarea" rows="2" placeholder="Jangan menyebut AI, jangan bahasa formal, jangan terlalu panjang">${esc(data.negativeRules)}</textarea>
              <label>Batas Kalimat / Karakter (Maks kata)</label>
              <input type="number" id="editMaxWords" class="form-input" min="1" max="500" value="${data.maxWords != null ? data.maxWords : 120}" style="max-width:80px" />
              <label>Forbidden Words (opsional)</label>
              <input id="editForbiddenWords" class="form-input" placeholder="gratis palsu, clickbait" value="${esc(data.forbiddenWords)}" />
            </div>
          </details>
          <details class="preset-section">
            <summary style="cursor:pointer;font-weight:600;padding:6px 0">🔁 Section 8: Productivity</summary>
            <div style="padding:8px 0 0 12px;display:flex;flex-direction:column;gap:8px">
              <label>Jumlah Variasi Output</label>
              <input type="number" id="editVariationCount" class="form-input" min="1" max="10" value="${data.variationCount != null ? data.variationCount : 3}" style="max-width:80px" />
              <label><input type="checkbox" id="editConsistencyRule" ${data.consistencyRule?'checked':''} /> Aktifkan preset ini untuk semua output sampai diganti</label>
            </div>
          </details>
          <details class="preset-section">
            <summary style="cursor:pointer;font-weight:600;padding:6px 0">🧪 Section 9: Advanced (Optional)</summary>
            <div style="padding:8px 0 0 12px;display:flex;flex-direction:column;gap:8px">
              <label>Example Output (Few-shot)</label>
              <textarea id="editExampleOutput" class="form-textarea" rows="3" placeholder="Contoh caption ideal...">${esc(data.exampleOutput)}</textarea>
              <label>Trending Context</label>
              <input id="editTrendingContext" class="form-input" placeholder="Tren skincare 2026" value="${esc(data.trendingContext)}" />
              <label>Keyword Priority Order</label>
              <input id="editKeywordPriorityOrder" class="form-input" placeholder="Keyword 1 → Keyword 2 → Keyword 3" value="${esc(data.keywordPriorityOrder)}" />
            </div>
          </details>
          <details class="preset-section">
            <summary style="cursor:pointer;font-weight:600;padding:6px 0">🎵 Section 10: Audio & Music (Optional)</summary>
            <div style="padding:8px 0 0 12px;display:flex;flex-direction:column;gap:8px">
              <label>Audio Style</label>
              <textarea id="editAudioStyle" class="form-textarea" rows="2" placeholder="Deskripsi gaya audio: e.g., Soft background music, calming, focuses on content. Music should support reading rhythm, not compete with content.">${esc(data.audioStyle)}</textarea>
              <label>Music Mood</label>
              <textarea id="editMusicMood" class="form-textarea" rows="2" placeholder="Contoh: energetic, motivational, relaxing, exciting">${esc(data.musicMood)}</textarea>
              <label>Audio Genre Recommendation</label>
              <input id="editAudioGenre" class="form-input" placeholder="Contoh: pop, electronic, lofi, classical, jazz, hiphop, ambient" value="${esc(data.audioGenre)}" />
              <label>Music Suggestion Details</label>
              <textarea id="editMusicSuggestion" class="form-textarea" rows="3" placeholder="Deskripsi musik yang cocok untuk konten ini...">${esc(data.musicSuggestion)}</textarea>
              <label>Recommended Audio Length untuk Video</label>
              <select id="editAudioLength" class="form-select" style="max-width:200px">
                <option value="">— Flexible —</option>
                <option value="15s" ${data.audioLength==='15s'?'selected':''}>15 detik</option>
                <option value="30s" ${data.audioLength==='30s'?'selected':''}>30 detik</option>
                <option value="60s" ${data.audioLength==='60s'?'selected':''}>60 detik</option>
                <option value="15s-30s" ${data.audioLength==='15s-30s'?'selected':''}>15-30 detik</option>
                <option value="flexible" ${data.audioLength==='flexible'?'selected':''}>Flexible</option>
              </select>
            </div>
          </details>
        </div>
      `
      // create overlay so modal floats above the grid
      const overlay = document.createElement('div')
      overlay.className = 'preset-editor-overlay'
      overlay.style.cssText = 'position:fixed;inset:0;display:flex;align-items:flex-start;justify-content:center;z-index:9999;overflow:auto;'
      modal.style.maxWidth = '920px'
      modal.style.width = '100%'
      modal.style.boxSizing = 'border-box'
      modal.style.padding = '16px'
      overlay.appendChild(modal)
      document.body.appendChild(overlay)

      function readForm(){
        return {
          label: getEditVal('editLabel') || key,
          platform: getEditVal('editPlatform') || 'tiktok',
          goal: String(document.getElementById('editGoal')?.value || '').trim().split(',').map(s=>s.trim()).filter(Boolean),
          role: getEditVal('editRole'),
          targetAudience: getEditVal('editTargetAudience'),
          tone: getEditVal('editTone'),
          languageRules: getEditVal('editLanguageRules'),
          emotionTrigger: String(document.getElementById('editEmotion')?.value || '').trim().split(',').map(s=>s.trim()).filter(Boolean),
          structure: getEditVal('editStructure'),
          hookStyle: String(document.getElementById('editHookStyle')?.value || '').trim(),
          formatOutput: getEditVal('editFormatOutput'),
          length: getEditVal('editLength'),
          keywordMain: getEditVal('editKeywordMain'),
          keywordExtra: getEditVal('editKeywordExtra'),
          hashtagStrategy: String(document.getElementById('editHashtagStrategy')?.value || '').trim(),
          hashtagCount: getEditNum('editHashtagCount', 10),
          ctaMain: getEditVal('editCtaMain'),
          cta: getEditVal('editCtaMain'),
          ctaAffiliate: getEditVal('editCtaAffiliate'),
          ctaEngagement: String(document.getElementById('editCtaEngagement')?.value || '').trim().split(',').map(s=>s.trim()).filter(Boolean),
          engagementGoal: String(document.getElementById('editEngagementGoal')?.value || '').trim(),
          negativeRules: getEditVal('editNegativeRules'),
          maxWords: getEditNum('editMaxWords', 120),
          forbiddenWords: getEditVal('editForbiddenWords'),
          variationCount: getEditNum('editVariationCount', 3),
          consistencyRule: !!document.getElementById('editConsistencyRule')?.checked,
          exampleOutput: getEditVal('editExampleOutput'),
          trendingContext: getEditVal('editTrendingContext'),
          keywordPriorityOrder: getEditVal('editKeywordPriorityOrder'),
          audioStyle: getEditVal('editAudioStyle'),
          musicMood: getEditVal('editMusicMood'),
          audioGenre: getEditVal('editAudioGenre'),
          musicSuggestion: getEditVal('editMusicSuggestion'),
          audioLength: getEditVal('editAudioLength')
        }
      }

      modal.querySelectorAll('button[data-template]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const t = window.PresetsManager.getTemplatePreset(btn.getAttribute('data-template'))
          if(!t) return
          document.getElementById('editLabel').value = t.label || ''
          document.getElementById('editPlatform').value = t.platform || 'tiktok'
          document.getElementById('editGoal').value = (Array.isArray(t.goal) ? t.goal.join(', ') : (t.goal || ''))
          document.getElementById('editRole').value = t.role || ''
          document.getElementById('editTargetAudience').value = t.targetAudience || ''
          document.getElementById('editTone').value = t.tone || ''
          document.getElementById('editLanguageRules').value = t.languageRules || ''
          document.getElementById('editEmotion').value = (Array.isArray(t.emotionTrigger) ? t.emotionTrigger.join(', ') : (t.emotionTrigger || ''))
          document.getElementById('editStructure').value = t.structure || ''
          document.getElementById('editHookStyle').value = t.hookStyle || ''
          document.getElementById('editFormatOutput').value = t.formatOutput || ''
          document.getElementById('editLength').value = t.length || 'short'
          document.getElementById('editKeywordMain').value = t.keywordMain || ''
          document.getElementById('editKeywordExtra').value = t.keywordExtra || ''
          document.getElementById('editHashtagStrategy').value = t.hashtagStrategy || ''
          document.getElementById('editHashtagCount').value = t.hashtagCount != null ? t.hashtagCount : 10
          document.getElementById('editCtaMain').value = t.ctaMain || t.cta || ''
          document.getElementById('editCtaAffiliate').value = t.ctaAffiliate || ''
          document.getElementById('editCtaEngagement').value = (Array.isArray(t.ctaEngagement) ? t.ctaEngagement.join(', ') : (t.ctaEngagement || ''))
          document.getElementById('editEngagementGoal').value = t.engagementGoal || ''
          document.getElementById('editNegativeRules').value = t.negativeRules || ''
          document.getElementById('editMaxWords').value = t.maxWords != null ? t.maxWords : 120
          document.getElementById('editForbiddenWords').value = t.forbiddenWords || ''
          document.getElementById('editVariationCount').value = t.variationCount != null ? t.variationCount : 3
          document.getElementById('editConsistencyRule').checked = !!t.consistencyRule
          document.getElementById('editExampleOutput').value = t.exampleOutput || ''
          document.getElementById('editTrendingContext').value = t.trendingContext || ''
          document.getElementById('editKeywordPriorityOrder').value = t.keywordPriorityOrder || ''
        })
      })

      document.getElementById('cancelPresetEd').addEventListener('click', ()=>{ try{ overlay.remove() }catch(e){}; applyFilters() })
      document.getElementById('savePresetEd').addEventListener('click', async ()=>{
        window.PresetsManager.upsert(key, readForm())
        // Auto-sync to backend after save
        try{
          const backend = getBackendURL()
          const token = sessionStorage.getItem('auth_token')
          if(backend && token){
            const data = window.PresetsManager.getStorage()
            await fetch(backend + '/presets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
              body: JSON.stringify(data)
            }).then(r=>{
              if(r.ok) aiLog('info','preset.saved',{ key, backend })
              else aiLog('warn','preset.save.failed',{ key, status: r.status })
            })
          }
        }catch(e){ aiLog('error','preset.sync.error',{ error: String(e) }) }
        try{ overlay.remove() }catch(e){}
        applyFilters()
        updatePresetDropdown()
      })
    }

    // Search & Filter functionality
    const applyFilters = () => {
      const allPresets = (window.PresetsManager && typeof window.PresetsManager.list === 'function') ? window.PresetsManager.list() : []
      const searchTerm = String(document.getElementById('presetSearchInput')?.value || '').toLowerCase().trim()
      const platformFilterRaw = String(document.getElementById('presetFilterPlatform')?.value || '').toLowerCase().trim()
      const goalFilterRaw = String(document.getElementById('presetFilterGoal')?.value || '').toLowerCase().trim()
      
      const listEl = document.getElementById('presetsList')
      if(!listEl) return
      
      const normalize = s => String(s||'').toLowerCase().trim().replace(/[\-_\s]+/g,' ')

      const filtered = allPresets.filter(item => {
        // `item` from PresetsManager.list() only contains summary fields (key, label, builtin).
        // Retrieve the full preset object for detailed fields used in filtering.
        const full = (window.PresetsManager && typeof window.PresetsManager.get === 'function') ? (window.PresetsManager.get(item.key) || {}) : {}

        const label = normalize(item.label || full.label || item.key)
        const platform = normalize(full.platform)
        const goalsArr = Array.isArray(full.goal) ? full.goal.map(g=> normalize(g)) : (full.goal ? [normalize(full.goal)] : [])
        const goals = goalsArr.join(' ')
        const description = normalize(full.description || '')

        const matchSearch = !searchTerm || label.includes(searchTerm) || platform.includes(searchTerm) || goals.includes(searchTerm) || description.includes(searchTerm)
        const matchPlatform = !platformFilterRaw || (platform && platform.indexOf(platformFilterRaw) !== -1)
        const matchGoal = !goalFilterRaw || goalsArr.some(g => g.indexOf(goalFilterRaw) !== -1)

        return matchSearch && matchPlatform && matchGoal
      })
      
      // Update stats
      try{
        document.getElementById('presetCountShowing').textContent = filtered.length
        document.getElementById('presetCountTotal').textContent = allPresets.length
      }catch(e){}
      
      // Re-render list with filtered items
      listEl.innerHTML = ''
      if(filtered.length === 0){
        const emptyMsg = document.createElement('div')
        emptyMsg.style.padding = '20px'
        emptyMsg.style.textAlign = 'center'
        emptyMsg.style.color = '#888'
        emptyMsg.textContent = 'Tidak ada preset yang cocok dengan filter'
        listEl.appendChild(emptyMsg)
        return
      }
      
      const storage = (window.PresetsManager && typeof window.PresetsManager.getStorage === 'function') ? window.PresetsManager.getStorage() : { userPresets: {} }
      filtered.forEach(it=>{
        const el = document.createElement('div')
        el.style.display = 'flex'
        el.style.justifyContent = 'space-between'
        el.style.alignItems = 'center'
        el.style.gap = '8px'
        el.style.padding = '10px'
        el.style.borderRadius = '8px'
        el.style.background = 'rgba(255,255,255,0.02)'
        el.style.border = '1px solid rgba(255,255,255,0.04)'

        const left = document.createElement('div')
        left.style.display = 'flex'
        left.style.alignItems = 'center'
        left.style.gap = '10px'

        if(!it.builtin){
          const synced = storage.userPresets && storage.userPresets[it.key] && storage.userPresets[it.key]._serverSynced
          const dot = document.createElement('span')
          dot.style.width = '12px'
          dot.style.height = '12px'
          dot.style.borderRadius = '50%'
          dot.style.display = 'inline-block'
          dot.title = synced ? 'Tersinkron ke server' : 'Belum tersinkron (lokal)'
          dot.style.background = synced ? '#26a54a' : '#e09b2d'
          dot.style.flex = '0 0 auto'
          left.appendChild(dot)
        }

        const textWrap = document.createElement('div')
        textWrap.style.display = 'flex'
        textWrap.style.flexDirection = 'column'
        textWrap.style.gap = '4px'
        const title = document.createElement('div')
        title.style.fontWeight = '600'
        title.textContent = it.label
        const subtitle = document.createElement('div')
        subtitle.style.fontSize = '12px'
        subtitle.style.color = '#aaa'
        if(it.builtin) subtitle.textContent = 'Template • Built-in'
        else {
          const p = (storage.userPresets && storage.userPresets[it.key] && storage.userPresets[it.key].platform) ? storage.userPresets[it.key].platform : ''
          subtitle.textContent = p ? `User preset • ${p}` : 'User preset'
        }
        textWrap.appendChild(title)
        textWrap.appendChild(subtitle)
        left.appendChild(textWrap)

        const actions = document.createElement('div')
        actions.style.display = 'flex'
        actions.style.gap = '8px'
        
        const editBtn = document.createElement('button')
        editBtn.className = 'small'
        editBtn.setAttribute('data-action','edit')
        editBtn.setAttribute('data-preset',it.key)
        editBtn.innerHTML = '✏️'
        
        const dlBtn = document.createElement('button')
        dlBtn.className = 'small'
        dlBtn.setAttribute('data-action','download')
        dlBtn.setAttribute('data-preset',it.key)
        dlBtn.innerHTML = '⬇️'
        
        const delBtn = document.createElement('button')
        delBtn.className = 'small'
        delBtn.setAttribute('data-action','delete')
        delBtn.setAttribute('data-preset',it.key)
        delBtn.innerHTML = '🗑️'
        
        actions.appendChild(editBtn)
        actions.appendChild(dlBtn)
        actions.appendChild(delBtn)
        el.appendChild(left)
        el.appendChild(actions)
        listEl.appendChild(el)
      })
    }
    
    // Attach filter listeners
    const searchInput = document.getElementById('presetSearchInput')
    const platformSelect = document.getElementById('presetFilterPlatform')
    const goalSelect = document.getElementById('presetFilterGoal')
    const resetBtn = document.getElementById('presetResetFilterBtn')
    
    if(searchInput) searchInput.addEventListener('input', applyFilters)
    if(platformSelect) platformSelect.addEventListener('change', applyFilters)
    if(goalSelect) goalSelect.addEventListener('change', applyFilters)
    if(resetBtn) resetBtn.addEventListener('click', ()=>{
      if(searchInput) searchInput.value = ''
      if(platformSelect) platformSelect.value = ''
      if(goalSelect) goalSelect.value = ''
      applyFilters()
      searchInput?.focus()
    })
    
    // Initial call to apply filters
    applyFilters()

    document.getElementById('createPresetBtn').addEventListener('click', async ()=>{
      const name = String(document.getElementById('newPresetName').value||'').trim()
      if(!name){ showToast('Masukkan nama preset', 'error'); return }
      if(window.PresetsManager.get(name)){ showToast('Preset sudah ada', 'error'); return }
      window.PresetsManager.upsert(name, Object.assign(window.PresetsManager.getDefaultPreset(), { label: name }))
      // Auto-sync to backend after create
      try{
        const backend = getBackendURL()
        const token = sessionStorage.getItem('auth_token')
        if(backend && token){
          const data = window.PresetsManager.getStorage()
          await fetch(backend + '/presets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify(data)
          }).then(r=>{
            if(r.ok){
              aiLog('info','preset.created',{ name, backend })
              showToast('Preset dibuat & tersinkron', 'success')
            }else{
              aiLog('warn','preset.create.sync.failed',{ name, status: r.status })
              showToast('Preset dibuat tapi gagal sinkron ke server', 'warn')
            }
          })
        }else if(!token){
          showToast('Preset dibuat lokal (belum login)', 'info')
        }
      }catch(e){ aiLog('error','preset.create.sync.error',{ error: String(e) }) }
      document.getElementById('newPresetName').value = ''
      applyFilters()
      updatePresetDropdown()
    })

    // delegate actions (edit/delete)
    placeholder.addEventListener('click', (ev)=>{
      const btn = ev.target.closest('button')
      if(!btn) return
      const action = btn.getAttribute('data-action')
      const key = btn.getAttribute('data-preset')
      if(action === 'edit'){
        // Close any existing overlay/modal before opening new one
        const existingOverlay = document.querySelector('.preset-editor-overlay')
        if(existingOverlay) existingOverlay.remove()
        openEditor(key)
      }else if(action === 'download'){
        // Download single preset as JSON file
        try{
          const preset = window.PresetsManager.get(key)
          if(!preset){
            showToast('Preset tidak ditemukan', 'error')
            return
          }
          const filename = preset.label ? preset.label.replace(/[^a-z0-9]/gi,'_').toLowerCase() : key
          const json = JSON.stringify(preset, null, 2)
          const blob = new Blob([json], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `preset_${filename}.json`
          document.body.appendChild(a)
          a.click()
          a.remove()
          URL.revokeObjectURL(url)
          showToast(`Preset "${preset.label}" downloaded`, 'success')
        }catch(e){
          console.warn('[presets.download] error:', e)
          showToast('Gagal download preset', 'error')
        }
      }else if(action === 'delete'){
        // Gunakan deleteWithConfirm jika ada, dengan fallback ke showDeleteConfirm atau confirm native
        (async ()=>{
          try{
            let confirmed = false
            if(window.PresetsManager && typeof window.PresetsManager.deleteWithConfirm === 'function'){
              confirmed = await window.PresetsManager.deleteWithConfirm(key)
            } else if(typeof window.showDeleteConfirm === 'function'){
              confirmed = await window.showDeleteConfirm(key)
            } else {
              confirmed = confirm('Hapus preset "'+key+'"?')
            }
            if(!confirmed) return
            // Jalankan hapus ke localStorage dan backend
            try{ await window.PresetsManager.remove(key) }catch(e){ /* best-effort */ }
            applyFilters()
            updatePresetDropdown()
            showToast('Preset "'+key+'" dihapus', 'success')
          }catch(e){
            console.warn('[presets.delete] error:', e)
            showToast('Gagal menghapus preset', 'error')
          }
        })()
      }
    })

    // Export backup: download presets as JSON file (simpan aman di komputer/cloud)
    const exportBackupBtn = document.getElementById('presetsExportBackupBtn')
    if (exportBackupBtn) {
      exportBackupBtn.addEventListener('click', ()=>{
        const backup = window.PresetsManager.exportBackup()
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `genco_presets_backup_${new Date().toISOString().slice(0,10)}.json`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      })
    }

    // Import backup: pilih file .json lalu merge ke presets
    const importBackupInput = document.getElementById('presetsImportBackupInput')
    if (importBackupInput) {
      importBackupInput.addEventListener('change', (e)=>{
        const file = e.target.files && e.target.files[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = ()=>{
          try {
            const raw = reader.result
            const data = typeof raw === 'string' ? JSON.parse(raw) : raw
            const result = window.PresetsManager.importBackup(data)
            if (result.success) {
              applyFilters()
              updatePresetDropdown()
              showToast('Backup di-import. ' + (result.mergedCount ? result.mergedCount + ' preset digabung.' : ''), 'success')
            } else {
              showToast('Import gagal: ' + (result.error || 'format tidak valid'), 'error')
            }
          } catch (err) {
            showToast('Import gagal: file bukan JSON valid. ' + (err && err.message), 'error')
          }
          e.target.value = ''
        }
        reader.readAsText(file)
      })
    }

    // Close button wiring: hide presets and show generator
    const closeBtn = document.getElementById('presetsCloseBtn')
    if(closeBtn){
      closeBtn.addEventListener('click', ()=>{
        try{
          placeholder.style.display = 'none'
          const gen = document.getElementById('aiMainContainer')
          if(gen) gen.style.display = 'block'
          document.querySelectorAll('#aiMainContainer .sidebar .nav-item').forEach(n=>n.classList.remove('active'))
          const genNav = document.querySelector('#aiMainContainer .sidebar .nav-item[data-action="generator"]')
          if(genNav) genNav.classList.add('active')
        }catch(e){/* ignore */}
      })
    }
    })
  }

  // preview helper: render preset summary + when preset used, disable Keyword & Tone dropdowns (murni dari preset)
  function updatePresetPreview(key){
    const previewElId = 'presetPreview'
    let el = document.getElementById(previewElId)
    if(!el){
      const panel = document.querySelector('#aiMainContainer .panel.card')
      if(!panel) return
      el = document.createElement('div')
      el.id = previewElId
      el.style.marginTop = '8px'
      el.style.padding = '8px'
      el.style.background = 'rgba(255,255,255,0.02)'
      el.style.borderRadius = '6px'
      panel.appendChild(el)
    }
    const presetNoteId = 'presetControlsNote'
    let presetNote = document.getElementById(presetNoteId)

    if(!key){
      el.innerHTML = '<em>No preset selected</em>'
      if(presetNote) presetNote.remove()
      try{
        const toneSel = document.getElementById('aiToneSelect'); if(toneSel){ toneSel.disabled = false }
        const kwSel = document.getElementById('aiKeywordSelect'); if(kwSel){ kwSel.disabled = false }
        const varBtn = document.getElementById('aiVariationsBtn'); if(varBtn) varBtn.textContent = 'Buat 3 variasi'
      }catch(e){}
      return
    }
    const p = window.PresetsManager.get(key)
    if(!p) return el.innerHTML = '<em>Preset not found</em>'
    const goals = Array.isArray(p.goal) && p.goal.length ? p.goal.join(', ') : (p.goal || '')
    const cta = p.ctaMain || p.cta || ''
    el.innerHTML = `<div style="font-size:13px"><strong>${p.label || key}</strong> — ${goals} · ${p.tone || ''} · ${p.length || ''}</div><div style="font-size:12px;margin-top:6px">Platform: ${p.platform || ''} · CTA: ${cta} · Structure: ${p.structure || ''} · Hashtags: ${p.hashtagCount != null ? p.hashtagCount : ''}</div>`
    if(p.platform){
      const platformEl = document.getElementById('aiPlatformSelect')
      if(platformEl && ['youtube','tiktok','instagram','facebook','x','shopee'].indexOf(p.platform) >= 0) platformEl.value = p.platform
    }
    try{ aiLog('info','presetPreview',{ key, preview: p }) }catch(e){}

    // Preset aktif: nonaktifkan Keyword & Tone dropdown — pakai murni dari preset
    try{
      const toneSel = document.getElementById('aiToneSelect')
      const kwSel = document.getElementById('aiKeywordSelect')
      if(toneSel) toneSel.disabled = true
      if(kwSel) kwSel.disabled = true
      if(!presetNote){
        presetNote = document.createElement('div')
        presetNote.id = presetNoteId
        presetNote.style.fontSize = '12px'
        presetNote.style.marginTop = '6px'
        presetNote.style.color = '#c9d0b3'
        const wrap = document.querySelector('#aiMainContainer .panel.card .generate-row') || toneSel?.parentNode || el
        if(wrap) wrap.insertAdjacentElement('beforebegin', presetNote)
      }
      presetNote.innerHTML = (p.tone ? `<span>Tone (dari preset): <strong>${String(p.tone).replace(/</g,'&lt;')}</strong>. </span>` : '') + 'Menggunakan keyword & tone dari preset.'
      if(p.consistencyRule){
        try{ localStorage.setItem(ACTIVE_PRESET_KEY, key) }catch(e){}
      }else{
        try{ if(localStorage.getItem(ACTIVE_PRESET_KEY) === key) localStorage.removeItem(ACTIVE_PRESET_KEY) }catch(e){}
      }
      const n = (p.variationCount != null ? Math.min(10, Math.max(1, p.variationCount)) : 3)
      const varBtn = document.getElementById('aiVariationsBtn')
      if(varBtn) varBtn.textContent = 'Buat ' + n + ' variasi'
    }catch(e){}
  }

  console.debug('mountAIGeneratorMain: updatePresetPreview defined')

  // ensure placeholder exists in DOM for presets
  let pp = document.getElementById('ai-presets-placeholder')
  if(!pp){ pp = document.createElement('div'); pp.id = 'ai-presets-placeholder'; pp.style.display = 'none'; document.body.appendChild(pp) }

  // helper to update presets dropdown in generator
  function updatePresetDropdown(){
    const sel = document.getElementById('aiPresetSelect')
    if(!sel) return
    const cur = sel.value || ''

    // Ensure filter controls exist (search + platform + goal)
    if(!document.getElementById('presetDropdownControls')){
      const ctrl = document.createElement('div')
      ctrl.id = 'presetDropdownControls'
      ctrl.style.display = 'flex'
      ctrl.style.gap = '8px'
      ctrl.style.alignItems = 'center'
      ctrl.style.marginBottom = '6px'

      const input = document.createElement('input')
      input.id = 'presetDropdownSearch'
      input.type = 'search'
      input.placeholder = '🔍 Cari preset...'
      input.className = 'form-input'
      input.style.flex = '1'

      const plat = document.createElement('select')
      plat.id = 'presetDropdownPlatform'
      plat.className = 'form-select'
      plat.style.minWidth = '140px'
      plat.style.minHeight = '35px'
      plat.style.height = '35px'
      plat.style.padding = '2px 8px'

      const goal = document.createElement('select')
      goal.id = 'presetDropdownGoal'
      goal.className = 'form-select'
      goal.style.minWidth = '140px'
      goal.style.minHeight = '35px'
      goal.style.height = '35px'
      goal.style.padding = '2px 8px'

      const reset = document.createElement('button')
      reset.type = 'button'
      reset.id = 'presetDropdownReset'
      reset.className = 'secondary'
      reset.textContent = 'Reset'
      reset.style.minHeight = '35px'
      reset.style.height = '35px'
      reset.style.padding = '2px 8px'

      // place input outside of the controls container so it can live separately
      // (we'll insert both input and ctrl into the DOM as siblings before the native select)
      ctrl.appendChild(plat)
      ctrl.appendChild(goal)
      ctrl.appendChild(reset)

      // insert the standalone search input and the controls container before the native select
      try{ sel.parentNode.insertBefore(input, sel) }catch(e){}
      try{ sel.parentNode.insertBefore(ctrl, sel) }catch(e){}

      const apply = () => {
        // rebuild options according to controls
        const q = String(document.getElementById('presetDropdownSearch')?.value || '').toLowerCase().trim()
        const pf = String(document.getElementById('presetDropdownPlatform')?.value || '').toLowerCase().trim()
        const gf = String(document.getElementById('presetDropdownGoal')?.value || '').toLowerCase().trim()
        // repopulate
        sel.innerHTML = '<option value="">(Manual - no preset)</option>'
        const items = window.PresetsManager.list() || []
        const normalize = s => String(s||'').toLowerCase().trim().replace(/[\-\_\s]+/g,' ')
        items.forEach(it=>{
          const full = (window.PresetsManager && typeof window.PresetsManager.get === 'function') ? (window.PresetsManager.get(it.key) || {}) : {}
          const label = normalize(it.label || full.label || it.key)
          const platform = normalize(full.platform)
          const goalsArr = Array.isArray(full.goal) ? full.goal.map(g=> normalize(g)) : (full.goal ? [normalize(full.goal)] : [])
          const goals = goalsArr.join(' ')
          const description = normalize(full.description || '')
          const matchQ = !q || label.includes(q) || platform.includes(q) || goals.includes(q) || description.includes(q)
          const matchP = !pf || (platform && platform.indexOf(pf) !== -1)
          const matchG = !gf || goalsArr.some(g => g.indexOf(gf) !== -1)
          if(matchQ && matchP && matchG){ const o = document.createElement('option'); o.value = it.key; o.textContent = it.label; sel.appendChild(o) }
        })
        try{ if(cur && Array.from(sel.options).some(o=>o.value===cur)) sel.value = cur }catch(e){}
      }

      input.addEventListener('input', apply)
      plat.addEventListener('change', apply)
      goal.addEventListener('change', apply)
      reset.addEventListener('click', ()=>{ document.getElementById('presetDropdownSearch').value=''; document.getElementById('presetDropdownPlatform').value=''; document.getElementById('presetDropdownGoal').value=''; apply() })
    }

    // populate platform/goal option lists based on current presets
    const selPlat = document.getElementById('presetDropdownPlatform')
    const selGoal = document.getElementById('presetDropdownGoal')
    if(selPlat && selGoal){
      // collect unique platforms/goals
      const all = window.PresetsManager.list() || []
      const normalize = s => String(s||'').toLowerCase().trim().replace(/[\-\_\s]+/g,' ')
      const platforms = new Set()
      const goals = new Set()
      all.forEach(it=>{
        const full = (window.PresetsManager && typeof window.PresetsManager.get === 'function') ? (window.PresetsManager.get(it.key) || {}) : {}
        if(full.platform) platforms.add(String(full.platform).trim())
        const ga = Array.isArray(full.goal) ? full.goal : (full.goal ? String(full.goal).split(',').map(s=>s.trim()).filter(Boolean) : [])
        ga.forEach(g => { if(g) goals.add(String(g).trim()) })
      })
      // rebuild select options
      const buildOptions = (selEl, itemsSet) => {
        const curv = selEl.value || ''
        selEl.innerHTML = '<option value="">(Semua)</option>'
        Array.from(itemsSet).sort().forEach(v=>{ const o = document.createElement('option'); o.value = String(v).toLowerCase().trim(); o.textContent = v; selEl.appendChild(o) })
        try{ if(curv) selEl.value = curv }catch(e){}
      }
      buildOptions(selPlat, platforms)
      buildOptions(selGoal, goals)
    }

    // initial populate using controls' current state
    document.getElementById('presetDropdownSearch')?.dispatchEvent(new Event('input'))

    // Create a custom dropdown panel that contains the search + filters
    if(!document.getElementById('presetCustomWrapper')){
      try{
        const wrapper = document.createElement('div')
        wrapper.id = 'presetCustomWrapper'
        wrapper.style.position = 'relative'
        wrapper.style.display = 'inline-block'
        wrapper.style.width = sel.style.width || '320px'

        // hide native select but keep it for form compatibility
        sel.style.display = 'none'

        const btn = document.createElement('button')
        btn.type = 'button'
        btn.id = 'presetDropdownBtn'
        btn.className = 'form-select'
        btn.style.display = 'flex'
        btn.style.alignItems = 'center'
        btn.style.justifyContent = 'space-between'
        btn.style.width = '100%'
        btn.textContent = sel.selectedOptions && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '(Manual - no preset)'

        const panel = document.createElement('div')
        panel.id = 'presetDropdownPanel'
        panel.style.position = 'absolute'
        panel.style.zIndex = 9999
        panel.style.top = 'calc(100% + 6px)'
        panel.style.left = '0'
        panel.style.height = '560px'
        panel.style.overflow = 'auto'
        panel.style.background = 'var(--bg-secondary)'
        panel.style.border = '1px solid rgba(255,255,255,0.06)'
        panel.style.padding = '8px'
        panel.style.borderRadius = '8px'
        panel.style.display = 'none'

        // move existing controls into the panel. The search input is a separate sibling
        const ctr = document.getElementById('presetDropdownControls')
        const inputEl = document.getElementById('presetDropdownSearch')
        if(ctr){
          // make controls wrap on small screens
          ctr.style.display = 'flex'
          ctr.style.flexWrap = 'wrap'
          ctr.style.gap = '8px'
          ctr.style.alignItems = 'center'
          ctr.style.marginBottom = '6px'
          // adjust child sizing for controls container
          Array.from(ctr.children || []).forEach(ch => {
            try{
              ch.style.boxSizing = 'border-box'
              if(ch.tagName && ch.tagName.toLowerCase() === 'input'){
                ch.style.flex = '1 1 200px'
                ch.style.minWidth = '120px'
              } else if(ch.tagName && ch.tagName.toLowerCase() === 'select'){
                ch.style.flex = '0 0 110px'
                ch.style.minWidth = '110px'
              } else if(ch.tagName && ch.tagName.toLowerCase() === 'button'){
                ch.style.flex = '0 0 auto'
              } else {
                ch.style.flex = '1 1 120px'
              }
            }catch(e){}
          })
          // adjust the standalone search input sizing so it fits nicely above the controls
          if(inputEl){
            try{
              inputEl.style.boxSizing = 'border-box'
              inputEl.style.flex = '1 1 200px'
              inputEl.style.minWidth = '120px'
              inputEl.style.marginBottom = '8px'
              inputEl.style.width = '100%'
            }catch(e){}
          }
          // create a sticky header inside the panel that holds the search input and controls
          const headerDiv = document.createElement('div')
          headerDiv.style.position = 'sticky'
          headerDiv.style.top = '-8px'
          headerDiv.style.zIndex = '1001'
          headerDiv.style.background = 'var(--bg-secondary)'
          headerDiv.style.paddingBottom = '6px'
          headerDiv.style.display = 'flex'
          headerDiv.style.flexWrap = 'wrap'
          headerDiv.style.gap = '8px'
          headerDiv.style.paddingTop = '6px'
          if(inputEl) headerDiv.appendChild(inputEl)
          headerDiv.appendChild(ctr)
          panel.appendChild(headerDiv)
        }

        // list container
        const listDiv = document.createElement('div')
        listDiv.id = 'presetDropdownList'
        listDiv.style.display = 'grid'
        listDiv.style.gridTemplateColumns = '1fr'
        listDiv.style.gap = '6px'
        listDiv.style.marginTop = '6px'
        panel.appendChild(listDiv)

        wrapper.appendChild(btn)
        wrapper.appendChild(panel)
        // responsive sizing helper: make panel width follow device width
        const adjustPanelSizing = () => {
          try{
            const vw = window.innerWidth || document.documentElement.clientWidth
            if(vw <= 520){
              panel.style.width = 'calc(100vw - 32px)'
            } else {
              panel.style.width = Math.min(480, Math.max(280, vw - 48)) + 'px'
            }
          }catch(e){}
        }
        // call now and on resize
        adjustPanelSizing()
        window.addEventListener('resize', adjustPanelSizing)
        // store for potential cleanup
        wrapper._adjustPanelSizing = adjustPanelSizing
        try{ sel.parentNode.insertBefore(wrapper, sel.nextSibling) }catch(e){}

        const rebuildList = () => {
          listDiv.innerHTML = ''
          const opts = Array.from(sel.options || [])
          opts.forEach(o=>{
            const row = document.createElement('div')
            row.className = 'preset-row'
            row.style.padding = '8px'
            row.style.borderRadius = '6px'
            row.style.cursor = 'pointer'
            row.style.display = 'flex'
            row.style.justifyContent = 'space-between'
            row.style.alignItems = 'center'
            row.style.background = 'rgb(82 82 97 / 9%)'
            row.textContent = o.textContent
            row.dataset.value = o.value
            row.addEventListener('click', ()=>{
              try{ sel.value = o.value }catch(e){}
              sel.dispatchEvent(new Event('change'))
              btn.textContent = o.textContent || '(Manual - no preset)'
              panel.style.display = 'none'
            })
            listDiv.appendChild(row)
          })
        }

        // open/close handlers (auto-flip when near viewport edges)
        btn.addEventListener('click', (ev)=>{
          ev.preventDefault(); ev.stopPropagation();
          const isOpening = panel.style.display === 'none' || panel.style.display === ''
          if(!isOpening){ panel.style.display = 'none'; return }

          // populate list then measure
          rebuildList()
          panel.style.display = 'block'
          panel.style.maxHeight = panel.style.maxHeight || '360px'
          // allow layout to settle
          requestAnimationFrame(()=>{
            try{
              const rect = btn.getBoundingClientRect()
              const viewportH = window.innerHeight || document.documentElement.clientHeight
              const spaceBelow = Math.max(0, viewportH - rect.bottom)
              const spaceAbove = Math.max(0, rect.top)
              const desired = Math.min(360, panel.scrollHeight + 16)
              let openUp = false
              if(spaceBelow < desired && spaceAbove > spaceBelow) openUp = true

                  const viewportW = window.innerWidth || document.documentElement.clientWidth
                  const smallScreen = viewportW <= 520
                  if(smallScreen){
                    // center and fit on small screens
                    panel.style.left = '50%'
                    panel.style.transform = 'translateX(-50%)'
                    panel.style.top = openUp ? 'auto' : 'calc(100% + 6px)'
                    panel.style.bottom = openUp ? 'calc(100% + 6px)' : 'auto'
                    const maxH = Math.max(80, Math.min(Math.floor((window.innerHeight || document.documentElement.clientHeight) * 0.68), 520))
                    panel.style.maxHeight = maxH + 'px'
                    panel.style.width = 'calc(100vw - 32px)'
                  } else {
                    // normal behavior: open up or down and limit width
                    panel.style.transform = 'none'
                    if(openUp){
                      panel.style.top = 'auto'
                      panel.style.bottom = 'calc(100% + 6px)'
                      const maxH = Math.max(80, Math.min(spaceAbove - 20, 360))
                      panel.style.maxHeight = maxH + 'px'
                    } else {
                      panel.style.bottom = 'auto'
                      panel.style.top = 'calc(100% + 6px)'
                      const maxH = Math.max(80, Math.min(spaceBelow - 20, 360))
                      panel.style.maxHeight = maxH + 'px'
                    }
                    panel.style.width = 'min(480px, calc(100vw - 48px))'
                    panel.style.left = '0'
                  }
              panel.style.overflowY = 'auto'
              if(panel.scrollTop) panel.scrollTop = 0
            }catch(e){ /* ignore measurement errors */ }
          })
        })

        // close on outside click
        document.addEventListener('click', (ev)=>{ if(!wrapper.contains(ev.target)) panel.style.display = 'none' })

        // ensure list updates when filters change
        const searchEl = document.getElementById('presetDropdownSearch')
        const platEl = document.getElementById('presetDropdownPlatform')
        const goalEl = document.getElementById('presetDropdownGoal')
        if(searchEl) searchEl.addEventListener('input', ()=>{ rebuildList() })
        if(platEl) platEl.addEventListener('change', ()=>{ rebuildList() })
        if(goalEl) goalEl.addEventListener('change', ()=>{ rebuildList() })
      }catch(e){ /* ignore dropdown build errors */ }
    }
  }

  // expose update function globally so main can call it
  window.updatePresetDropdown = updatePresetDropdown

  // populate dropdown after optional backend sync (so presets are global/cross-device)
  ;(window.PresetsManager.syncFromBackend || (()=>Promise.resolve()))().then(()=>{
    try{
      updatePresetDropdown()
      const sel = document.getElementById('aiPresetSelect')
      const activeKey = (function(){ try{ return localStorage.getItem(ACTIVE_PRESET_KEY) || '' }catch(e){ return '' } })()
      if(sel){
        if(activeKey && window.PresetsManager.get(activeKey)){
          sel.value = activeKey
          updatePresetPreview(activeKey)
          const label = (window.PresetsManager.get(activeKey)||{}).label || activeKey
          showToast('Preset "' + label + '" aktif.', 'info')
        } else {
          updatePresetPreview(sel.value || '')
        }
      }
    }catch(e){}
  })
  // keyword suggest wiring
  try{
    const suggestBtn = document.getElementById('aiKeywordSuggestBtn')
    const kwSelect = document.getElementById('aiKeywordSelect')
    const useAICheck = document.getElementById('aiKeywordUseAI')
    const titleEl = document.getElementById('aiMainTitle')
    const overviewEl = document.getElementById('aiMainOverview')
    suggestBtn?.addEventListener('click', async ()=>{
      const title = titleEl ? String(titleEl.value||'') : ''
      const overview = overviewEl ? String(overviewEl.value||'') : ''
      const useAI = !!(useAICheck && useAICheck.checked)
      const provider = document.getElementById('aiProviderSelect')?.value || 'openrouter'
      const apiKey = (function(){ try{ const raw = localStorage.getItem('ai-settings'); if(raw){ const s = JSON.parse(raw); const p = s?.keys?.[provider]; if(p) return String(p).trim() } }catch(e){} return String(localStorage.getItem('ai_api_key')||'').trim() })()
      const sug = await suggestKeywords({ useAI, provider, apiKey, title, overview, topN:6 })
      // populate select with suggestions
      if(!kwSelect) return
      // clear previous (keep the auto option)
      const keepAuto = Array.from(kwSelect.options).filter(o=>o.value==='')
      kwSelect.innerHTML = ''
      keepAuto.forEach(o=> kwSelect.appendChild(o))
      sug.forEach(s=>{ const opt = document.createElement('option'); opt.value = s; opt.textContent = s; opt.selected = true; kwSelect.appendChild(opt) })
      // persist history
      if(sug.length) pushKeywordHistory(sug)
    })
  }catch(e){}
  console.debug('mountAIGeneratorMain: presets populated')

  console.debug('mountAIGeneratorMain: done')
  }catch(err){ console.error('mountAIGeneratorMain: unexpected error', err); throw err }


}

// Auto-mount fallback: ensure generator mounts on page load if container exists
(function(){
  function tryMount(){
    if(window.__ai_mounted__) return
    try{
      const hasContainer = !!(document.getElementById('aiMainContainer') || document.getElementById('aiMainHeader'))
      const ready = document.readyState === 'complete' || document.readyState === 'interactive'
      if(ready && hasContainer){
        try{ mountAIGeneratorMain(); window.__ai_mounted__ = true; console.debug('auto-mount: mountAIGeneratorMain invoked') }catch(e){ console.warn('auto-mount failed', e) }
      }
    }catch(e){}
  }
  document.addEventListener('DOMContentLoaded', tryMount)
  // Try again shortly after in case script executed after DOMContentLoaded
  setTimeout(tryMount, 300)
})();

// Load models for a provider and populate a given model <select>
async function loadModelsFor(prov, modelEl){
  if(!modelEl) return
  modelEl.innerHTML = '<option value="">(auto)</option>'

  const pinned = {
    gemini: ['models/gemini-2.5-flash', 'models/gemini-2.5-flash-lite'],
    openai: ['gpt-4o-mini'],
    openrouter: ['meta-llama/llama-3-8b-instruct'],
    groq: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
    together: ['meta-llama/Llama-3-70b-chat-hf', 'mistralai/Mixtral-8x7B-Instruct-v0.1', 'deepseek-ai/DeepSeek-V3'],
    cohere: ['command-r-plus-08-2024', 'command-r7b-12-2024', 'command-a-03-2025'],
    huggingface: ['meta-llama/Llama-3-70b-chat-hf', 'mistralai/Mixtral-8x7B-Instruct-v0.1', 'Qwen/Qwen2.5-72B-Instruct'],
    deepseek: ['deepseek-chat', 'deepseek-reasoner']
  }
  ;(pinned[prov]||[]).forEach(v=>{
    const opt = document.createElement('option')
    opt.value = v
    opt.textContent = `⭐ ${v}`
    modelEl.appendChild(opt)
  })

  // Use the global `getKeyForProvider(provider)` helper instead of a local duplicate.
  // This avoids divergent behavior ('' vs null) and centralizes backend auto-load logic.
  const lsKeyFor = (p) => `ai_model_${p}`
  const recommendedDefaults = { gemini: 'models/gemini-2.5-flash', openai: 'gpt-4o-mini', openrouter: 'meta-llama/llama-3-8b-instruct', groq: 'llama-3.1-8b-instant', together: 'meta-llama/Llama-3-70b-chat-hf', cohere: 'command-r-plus-08-2024', huggingface: 'meta-llama/Llama-3-70b-chat-hf', deepseek: 'deepseek-chat' }

  const key = await getKeyForProvider(prov)
  const backendURL = getBackendURL()
  if(!key || !backendURL){
    const saved = localStorage.getItem(lsKeyFor(prov)) || recommendedDefaults[prov] || ''
    if(saved){ const opt = document.createElement('option'); opt.value = saved; opt.textContent = saved; modelEl.appendChild(opt); modelEl.value = saved }
    return
  }

  // Quick ping to backend /ai/debug with short timeout to avoid noisy ERR_CONNECTION_REFUSED
  try{
    const ctrl = new AbortController()
    const t = setTimeout(()=>ctrl.abort(), 800)
    const ping = await fetch(backendURL + '/ai/debug', { 
      signal: ctrl.signal,
      headers: getAuthHeaders()
    })
    clearTimeout(t)
    if(!ping.ok){ throw new Error('Backend debug ping failed') }
  }catch(e){
    // backend unreachable — fall back to saved defaults
    const saved = localStorage.getItem(lsKeyFor(prov)) || recommendedDefaults[prov] || ''
    if(saved){ const opt = document.createElement('option'); opt.value = saved; opt.textContent = saved; modelEl.appendChild(opt); modelEl.value = saved }
    return
  }

  try{
    const res = await fetch(`${backendURL}/ai/models?provider=${encodeURIComponent(prov)}&apiKey=${encodeURIComponent(key)}`, {
      headers: getAuthHeaders()
    })
    const json = await res.json().catch(()=>({}))
    if(json?.error){
      console.warn('loadModelsFor: backend returned error', json.error)
      // show a friendly fallback option and return
      const saved = localStorage.getItem(lsKeyFor(prov)) || recommendedDefaults[prov] || ''
      if(saved){ const opt = document.createElement('option'); opt.value = saved; opt.textContent = saved; modelEl.appendChild(opt); modelEl.value = saved }
      // also add a disabled option explaining the failure
      const note = document.createElement('option'); note.disabled = true; note.textContent = '(Could not fetch models: ' + String(json.error).slice(0,120) + ')'; modelEl.insertBefore(note, modelEl.firstChild)
      return
    }
    const list = Array.isArray(json?.models) ? json.models : []
    const values = list.map(m => m?.name || m?.id).filter(Boolean)
    aiLog('info','modelList',{ provider: prov, count: values.length, sample: values.slice(0,10) })
    const pinnedSet = new Set((pinned[prov] || []).map(String))
    values.filter(v => !pinnedSet.has(String(v))).forEach(v=>{
      const opt = document.createElement('option')
      opt.value = v
      opt.textContent = v
      modelEl.appendChild(opt)
    })
  }catch(e){
    console.warn('loadModelsFor failed', e)
  }

  const saved = localStorage.getItem(lsKeyFor(prov)) || ''
  const fallback = recommendedDefaults[prov] || ''
  const choose = saved || fallback
  if(choose) modelEl.value = choose
}

// Helpers: format audio object for display or copy
function formatAudioDisplay(audio){
  try{
    if(!audio) return ''
    const parts = []
    if(audio.style) parts.push('Style: ' + audio.style)
    if(audio.mood) parts.push('Mood: ' + audio.mood)
    if(audio.genre) parts.push('Genre: ' + audio.genre)
    if(audio.suggestion) parts.push('Suggestion: ' + audio.suggestion)
    if(audio.length) parts.push('Length: ' + audio.length)
    return parts.join('\n')
  }catch(e){ return '' }
}
function formatAudioJson(audio){ try{ return JSON.stringify(audio || {}, null, 2) }catch(e){ return '' } }
async function generateFromMain(){
  const title = (document.getElementById('aiMainTitle')?.value || '').trim()
  const overview = (document.getElementById('aiMainOverview')?.value || '').trim()
  if(!title && !overview){
    showToast('Isi minimal Title atau Overview untuk generate.', 'error')
    return
  }

  const lang = document.getElementById('aiLangSelect')?.value || 'id'
  const prov = document.getElementById('aiProviderSelect')?.value || 'gemini'
  const model = document.getElementById('aiModelSelect')?.value || ''
  
  // 🆕 BARU: Use async getKeyForProvider with auto-load fallback
  let apiKey = await getKeyForProvider(prov)
  
  // 🆕 BARU: Retry once if failed
  if (!apiKey) {
    showToast('Loading API key dari backend...', 'info')
    apiKey = await loadApiKeyFromBackend(prov)
  }
  
  const platformEl = document.getElementById('aiPlatformSelect')
  const platforms = platformEl ? [platformEl.value] : ['youtube']
  const { tone } = getEffectiveToneAndKeywords()
  const keywords = getSelectedKeywords()
  let presetInstructions = ''
  let presetObj = null
  try{
    const presetSel = document.getElementById('aiPresetSelect')
    const presetKey = presetSel ? String(presetSel.value||'').trim() : ''
    if(presetKey){
      presetObj = window.PresetsManager.get(presetKey)
      if(presetObj) presetInstructions = (window.PresetsManager.buildPresetInstructions && window.PresetsManager.buildPresetInstructions(presetObj)) || ''
    }
  }catch(e){}

  const panel = document.getElementById('aiResultPanel')
  panel.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:24px;color:#888"><span class="spinner" style="display:inline-block;width:20px;height:20px;border:2px solid rgba(255,255,255,0.2);border-top-color:#0072ff;border-radius:50%;animation:genco-spin 0.8s linear infinite"></span> Generating...</div>'
  if(!document.getElementById('genco-spinner-style')){
    const style = document.createElement('style')
    style.id = 'genco-spinner-style'
    style.textContent = '@keyframes genco-spin { to { transform: rotate(360deg); } }'
    document.head.appendChild(style)
  }

  const extractJson = (txt) => { const m = String(txt||'').match(/\{[\s\S]*\}/); if(!m) return null; try{ return JSON.parse(m[0]) }catch(e){ return null } }
  const forceJsonPrompt = (basePrompt) => `${basePrompt}\n\nIMPORTANT: Return ONLY valid JSON. No markdown, no explanations. If you cannot, output {"title":"","description":"","hashtags":[],"hook":"","narratorScript":""} only.`.trim()

  try{
    if(!apiKey) throw new Error('AI API key is empty for selected provider (set it in Settings, then Save)')
    const results = []

    for(const platform of (platforms.length?platforms:['youtube'])){
      aiLog('info','generate.request.prepare',{ provider: prov, model, lang, platform, title, overview, keywords, tone, apiKeyPresent: !!apiKey, apiKeyMasked: maskKey(apiKey) })
      let prompt = buildFullPrompt({ title, overview, platform, lang, preset: presetObj, tone: tone || 'neutral', keywords, presetInstructions })
      // if preset requests audio preferences, append explicit audio instruction
      try{
        if(presetObj && (presetObj.audioStyle || presetObj.musicMood || presetObj.audioGenre || presetObj.musicSuggestion || presetObj.audioLength)){
          prompt += '\n\nIMPORTANT: If applicable include an "audio" object in the JSON with keys: "style","mood","genre","suggestion","length". Use concise phrases.'
        }
      }catch(e){}

      let raw = null
      aiLog('debug','generate.prompt',{ prompt })
      const start = performance.now()
      try{
        raw = await window.AI.generate({ provider: prov, apiKey, prompt, model })
        const duration = Math.round(performance.now() - start)
        aiLog('info','generate.response',{ platform, durationMs: duration, rawLength: String(raw||'').length })
      }catch(e){ raw = String(e?.message||e); aiLog('error','generate.error',{ platform, error: String(e) }) }

      let parsed = extractJson(String(raw || ''))
      if(!parsed){
        try{ const reprompt = forceJsonPrompt(prompt); const raw2 = await window.AI.generate({ provider: prov, apiKey, prompt: reprompt, model }); parsed = extractJson(raw2); aiLog('info','generate.reprompt',{ platform, repromptUsed: true }) }catch(e){ aiLog('error','generate.reprompt.error',{ platform, error: String(e) }) }
      }

      if(!parsed) parsed = { title: '', description: String(raw||'').slice(0,800), hashtags: [], hook: '', narratorScript: '' }
      if(!parsed.hook) parsed.hook = ''
      if(!parsed.narratorScript) parsed.narratorScript = ''
      // Ensure audio object present when preset suggests audio preferences
      try{
        if(!parsed) parsed = {}
        if(!parsed.audio && presetObj && (presetObj.audioStyle || presetObj.musicMood || presetObj.audioGenre || presetObj.musicSuggestion || presetObj.audioLength)){
          parsed.audio = {
            style: (parsed.audio && parsed.audio.style) || presetObj.audioStyle || '',
            mood: (parsed.audio && parsed.audio.mood) || presetObj.musicMood || '',
            genre: (parsed.audio && parsed.audio.genre) || presetObj.audioGenre || '',
            suggestion: (parsed.audio && parsed.audio.suggestion) || presetObj.musicSuggestion || '',
            length: (parsed.audio && parsed.audio.length) || presetObj.audioLength || ''
          }
        }
      }catch(e){ /* ignore */ }
      aiLog('info','generate.parsed',{ platform, parsed })
      results.push({ platform, parsed })
    }

    const esc = (s)=> String(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    const batchId = Date.now()
    panel.innerHTML = '<div style="margin-bottom:8px"><strong>Results</strong></div>'
    results.forEach(({ platform, parsed })=>{
      const idSafe = `aiRes_${platform}`
      const feedbackId = `${batchId}_${platform}`
      const card = document.createElement('div')
      card.style.borderTop = '1px solid rgba(255,255,255,0.04)'
      card.style.paddingTop = '10px'
      card.style.marginTop = '10px'
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap: wrap;gap:12px">
          <div style="display:flex;gap:20px;">
            <div style="display:flex;align-items:center;gap:12px">
              <span style="background:rgba(255,255,255,0.03);padding:4px 8px;border-radius:6px;font-size:12px;text-transform:capitalize">${platform}</span>
            </div>
            <div class="feedback-group" style="display:flex;gap:6px">
              <button data-feedback-id="${feedbackId}" data-feedback-rating="good" style="min-height: 30px;padding:6px 10px;border-radius:6px;font-size:12px">Bagus</button>
              <button data-feedback-id="${feedbackId}" data-feedback-rating="bad" style="min-height: 30px;padding:6px 10px;border-radius:6px;font-size:12px">Kurang</button>
            </div>
            </div>
             <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
            <div class="copy-group" style="display:flex;gap:6px;flex-wrap:wrap">
              <button data-copy-all="${idSafe}" style="min-height: 30px;padding:4px;border-radius:6px">Copy all</button>
              <button data-copy-caption="${idSafe}" style="min-height: 30px;padding:4px;border-radius:6px">Copy main</button>
              <button data-copy-target="${idSafe}_title" style="min-height: 30px;padding:4px;border-radius:6px">Copy Title</button>
              <button data-copy-target="${idSafe}_desc" style="min-height: 30px;padding:4px;border-radius:6px">Copy Desc</button>
              <button data-copy-target="${idSafe}_hook" style="min-height: 30px;padding:4px;border-radius:6px">Copy Hook</button>
              <button data-copy-target="${idSafe}_narrator" style="min-height: 30px;padding:4px;border-radius:6px">Copy Script</button>
              <button data-copy-target="${idSafe}_tags" style="min-height: 30px;padding:4px;border-radius:6px">Copy Tags</button>
              <button data-copy-audio="${idSafe}" style="min-height: 30px;padding:4px;border-radius:6px">Copy Audio</button>
            </div>
          </div>
        </div>
        <div style="margin-top:15px;font-size:12px;color:var(--caption-txt-output)">Title</div>
        <div id="${idSafe}_title" style="margin-top:4px;color:var(--color-title-gen);box-shadow: 0px 7px 7px -10px gray;padding-bottom: 4px;">${esc(parsed.title)}</div>
        <div style="margin-top:8px;font-size:12px;color:var(--caption-txt-output)">Description / Overview</div>
        <div id="${idSafe}_desc" style="margin-top:4px;color:var(--color-desc);box-shadow: 0px 7px 7px -10px gray;padding-bottom: 4px;">${esc(parsed.description)}</div>
        <div style="margin-top:8px;font-size:12px;color:var(--caption-txt-output)">Hook</div>
        <div id="${idSafe}_hook" style="margin-top:4px;color:var(--color-hooks);box-shadow: 0px 7px 7px -10px gray;padding-bottom: 4px;">${esc(parsed.hook)}</div>
        <div style="margin-top:8px;font-size:12px;color:var(--caption-txt-output)">Script narator/voice</div>
        <div id="${idSafe}_narrator" style="margin-top:4px;color:var(--color-narrator);box-shadow: 0px 7px 7px -10px gray;padding-bottom: 4px;">${esc(parsed.narratorScript)}</div>
        <div style="margin-top:8px;font-size:12px;color:var(--caption-txt-output)">Hashtags</div>
        <div id="${idSafe}_tags" style="margin-top:4px;color:var(--color-tags);box-shadow: 0px 7px 7px -10px gray;padding-bottom: 4px;">${Array.isArray(parsed.hashtags)?parsed.hashtags.join(' '):(parsed.hashtags||'')}</div>
        <div style="margin-top:8px;font-size:12px;color:var(--caption-txt-output)">Audio Recommendation</div>
        <div id="${idSafe}_audio" style="margin-top:4px;color:var(--color-audio);box-shadow: 0px 7px 7px -10px gray;padding-bottom: 4px;white-space:pre-line">${''}</div>
      `
      panel.appendChild(card)
      try{ const audioEl = document.getElementById(idSafe + '_audio'); if(audioEl) audioEl.textContent = formatAudioDisplay(parsed.audio) }catch(e){}
    })

    // per-card copy wiring
    function copyTextAndToast(text, btn, prevLabel){
      if(!text){ showToast('Nothing to copy', 'info'); return }
      navigator.clipboard.writeText(text).then(()=>{ showToast('Copied to clipboard', 'success'); if(btn){ const prev = prevLabel != null ? prevLabel : btn.textContent; btn.textContent = 'Copied'; setTimeout(()=> btn.textContent = prev, 1200) } }).catch(()=> showToast('Copy failed', 'error'))
    }
    panel.querySelectorAll('button[data-copy-target]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const tgt = b.getAttribute('data-copy-target')
        const el = document.getElementById(tgt)
        const text = el ? el.textContent : ''
        copyTextAndToast(text, b)
      })
    })
    panel.querySelectorAll('button[data-copy-all]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const prefix = b.getAttribute('data-copy-all')
        const parts = ['title','desc','hook','narrator','tags'].map(k=> { const el = document.getElementById(prefix + '_' + k); return el ? el.textContent : '' })
        const text = parts.join('\n\n')
        copyTextAndToast(text, b)
      })
    })
    panel.querySelectorAll('button[data-copy-caption]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const prefix = b.getAttribute('data-copy-caption')
        const descEl = document.getElementById(prefix + '_desc')
        const tagsEl = document.getElementById(prefix + '_tags')
        const desc = descEl ? descEl.textContent : ''
        const tags = tagsEl ? tagsEl.textContent : ''
        const text = tags ? (desc + '\n\n' + tags).trim() : desc
        copyTextAndToast(text, b)
      })
    })
    // copy audio info
    panel.querySelectorAll('button[data-copy-audio]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const prefix = b.getAttribute('data-copy-audio')
        // copy JSON representation for convenience
        const audioEl = document.getElementById(prefix + '_audio')
        const audioText = audioEl ? audioEl.textContent : ''
        const toCopy = audioText ? audioText : ''
        copyTextAndToast(toCopy, b)
      })
    })
    panel.querySelectorAll('button[data-feedback-id]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const id = b.getAttribute('data-feedback-id')
        const rating = b.getAttribute('data-feedback-rating') || 'good'
        setFeedback(id, rating)
        showToast(rating === 'good' ? 'Terima kasih!' : 'Feedback tercatat.', 'success')
      })
    })

    // export csv
    const exportBtn = document.getElementById('aiExportCSV')
    if(exportBtn){
      exportBtn.addEventListener('click', ()=>{
        const rows = [['platform','title','description','hook','narratorScript','hashtags']]
        results.forEach(r=> rows.push([r.platform, (r.parsed.title||'').replace(/"/g,'""'), (r.parsed.description||'').replace(/"/g,'""'), (r.parsed.hook||'').replace(/"/g,'""'), (r.parsed.narratorScript||'').replace(/"/g,'""'), Array.isArray(r.parsed.hashtags)?r.parsed.hashtags.join(' '):(r.parsed.hashtags||'')]))
        const csv = rows.map(r => r.map(c=>`"${String(c||'').replace(/\"/g,'""')}"`).join(',')).join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `${(title||'content').replace(/[^a-z0-9\-]/gi,'_')}_social.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
        showToast('CSV exported', 'success')
      })
    }
    const goals = (presetObj && Array.isArray(presetObj.goal) && presetObj.goal.length) ? presetObj.goal.join(', ') : ''
    pushGenerateHistory({ ts: Date.now(), title, overview, platform: platforms[0], presetKey: presetObj ? (document.getElementById('aiPresetSelect')?.value || '') : '', goals, type: 'generate', results })
  }catch(err){ console.error('AI generation failed', err); showToast(err && err.message ? err.message : 'AI generation failed.', 'error'); panel.innerHTML = '<div style="padding:12px;color:#c66">AI generation failed. See console.</div>' }
}

async function generateVariations(count) {
  const title = (document.getElementById('aiMainTitle')?.value || '').trim()
  const overview = (document.getElementById('aiMainOverview')?.value || '').trim()
  if(!title && !overview){
    showToast('Isi minimal Title atau Overview untuk generate.', 'error')
    return
  }
  const lang = document.getElementById('aiLangSelect')?.value || 'id'
  const prov = document.getElementById('aiProviderSelect')?.value || 'gemini'
  const model = document.getElementById('aiModelSelect')?.value || ''
  let apiKey = await getKeyForProvider(prov)
  if (!apiKey) {
    showToast('Loading API key dari backend...', 'info')
    apiKey = await loadApiKeyFromBackend(prov)
  }
  const platform = document.getElementById('aiPlatformSelect')?.value || 'youtube'
  const { tone } = getEffectiveToneAndKeywords()
  const keywords = getSelectedKeywords()
  let presetObj = null
  let presetInstructions = ''
  try{
    const presetSel = document.getElementById('aiPresetSelect')
    const presetKey = presetSel ? String(presetSel.value||'').trim() : ''
    if(presetKey){ presetObj = window.PresetsManager.get(presetKey); if(presetObj) presetInstructions = (window.PresetsManager.buildPresetInstructions && window.PresetsManager.buildPresetInstructions(presetObj)) || '' }
  }catch(e){}
  const resolvedCount = typeof count === 'number' && count >= 1 ? count : (presetObj && presetObj.variationCount != null ? Math.min(10, Math.max(1, presetObj.variationCount)) : 3)

  const panel = document.getElementById('aiResultPanel')
  panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>Variations</strong><div id="variationsLoading" style="font-size:12px;color:#888"></div></div>`

  const extractJson = (txt) => { const m = String(txt||'').match(/\{[\s\S]*\}/); if(!m) return null; try{ return JSON.parse(m[0]) }catch(e){ return null } }

  try{
    if(!apiKey) throw new Error('AI API key is empty for selected provider (set it in Settings, then Save)')
    const results = []
    const loadingEl = document.getElementById('variationsLoading')

    const batchIdVar = Date.now()
    for(let i=0;i<resolvedCount;i++){
      if(loadingEl) loadingEl.textContent = `Variasi ${i+1}/${resolvedCount}...`
      let prompt = buildFullPrompt({ title, overview, platform, lang, preset: presetObj, tone: tone || 'neutral', keywords, presetInstructions })
      try{
        if(presetObj && (presetObj.audioStyle || presetObj.musicMood || presetObj.audioGenre || presetObj.musicSuggestion || presetObj.audioLength)){
          prompt += '\n\nIMPORTANT: If applicable include an "audio" object in the JSON with keys: "style","mood","genre","suggestion","length". Use concise phrases.'
        }
      }catch(e){}

      let raw = null
      try{ raw = await window.AI.generate({ provider: prov, apiKey, prompt, model }) }catch(e){ raw = String(e?.message||e) }

      let parsed = extractJson(String(raw || ''))
      if(!parsed) parsed = { title: '', description: String(raw||'').slice(0,800), hashtags: [], hook: '', narratorScript: '' }
      try{
        if(!parsed.audio && presetObj && (presetObj.audioStyle || presetObj.musicMood || presetObj.audioGenre || presetObj.musicSuggestion || presetObj.audioLength)){
          parsed.audio = {
            style: (parsed.audio && parsed.audio.style) || presetObj.audioStyle || '',
            mood: (parsed.audio && parsed.audio.mood) || presetObj.musicMood || '',
            genre: (parsed.audio && parsed.audio.genre) || presetObj.audioGenre || '',
            suggestion: (parsed.audio && parsed.audio.suggestion) || presetObj.musicSuggestion || '',
            length: (parsed.audio && parsed.audio.length) || presetObj.audioLength || ''
          }
        }
      }catch(e){}
      if(!parsed.hook) parsed.hook = ''
      if(!parsed.narratorScript) parsed.narratorScript = ''
      results.push({ i: i+1, parsed, raw })

      const esc = (s)=> String(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      const feedbackIdVar = `${batchIdVar}_var_${i}`
      const card = document.createElement('div')
      card.style.borderTop = '1px solid rgba(255,255,255,0.04)'
      card.style.paddingTop = '10px'
      card.style.marginTop = '10px'
      card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap: wrap;gap:12px">
      <div style="display:flex;gap:20px;">
            <div style="display:flex;align-items:center;gap:12px">
              <span style="background:rgba(255,255,255,0.03);padding:4px 8px;border-radius:6px;font-size:12px;text-transform:capitalize">${platform}</span><strong>Var ${i+1}</strong>
            </div>
            <div class="feedback-group" style="display:flex;gap:6px">
              <button data-feedback-id="${feedbackIdVar}" data-feedback-rating="good" style="min-height: 30px;padding:6px 10px;border-radius:6px;font-size:12px">Bagus</button>
    <button data-feedback-id="${feedbackIdVar}" data-feedback-rating="bad" style="min-height: 30px;padding:6px 10px;border-radius:6px;font-size:12px">Kurang</button></div></div>
  <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
  <div class="copy-group" style="display:flex;gap:6px;flex-wrap:wrap">
    <button data-copy-all="var_${i}" style="min-height: 30px;padding:4px;border-radius:6px">Copy all</button>
    <button data-copy-caption="var_${i}" style="min-height: 30px;padding:4px;border-radius:6px">Copy as caption</button>
    <button data-copy-target="var_${i}_title" style="min-height: 30px;padding:4px;border-radius:6px">Copy Title</button>
    <button data-copy-target="var_${i}_desc" style="min-height: 30px;padding:4px;border-radius:6px">Copy Desc</button>
    <button data-copy-target="var_${i}_hook" style="min-height: 30px;padding:4px;border-radius:6px">Copy Hook</button>
    <button data-copy-target="var_${i}_narrator" style="min-height: 30px;padding:4px;border-radius:6px">Copy Script</button>
    <button data-copy-target="var_${i}_tags" style="min-height: 30px;padding:4px;border-radius:6px">Copy Tags</button>
    <button data-copy-audio="var_${i}" style="min-height: 30px;padding:4px;border-radius:6px">Copy Audio</button>
  </div>
</div>
</div>
      <div style="margin-top:6px;font-size:12px;color:#b0b0b0">Title</div><div id="var_${i}_title" style="margin-top:4px;color:#d9cd71;background:#040f1abd;padding:10px;border-radius:8px">${esc(parsed.title)}</div><div style="margin-top:6px;font-size:12px;color:#b0b0b0">Description / Overview</div><div id="var_${i}_desc" style="margin-top:4px;color:var(--color-desc);background:#040f1abd;padding:10px;border-radius:8px">${esc(parsed.description)}</div><div style="margin-top:6px;font-size:12px;color:#b0b0b0">Hook</div><div id="var_${i}_hook" style="margin-top:4px;color:var(--color-hook);background:#040f1abd;padding:10px;border-radius:8px">${esc(parsed.hook)}</div><div style="margin-top:6px;font-size:12px;color:#b0b0b0">Script narator/voice</div><div id="var_${i}_narrator" style="margin-top:4px;color:var(--color-narrator);background:#040f1abd;padding:10px;border-radius:8px">${esc(parsed.narratorScript)}</div><div style="margin-top:6px;font-size:12px;color:#b0b0b0">Hashtags</div><div id="var_${i}_tags" style="margin-top:4px;color:#var(--color-tags);background:#040f1abd;padding:10px;border-radius:8px">${Array.isArray(parsed.hashtags)?parsed.hashtags.join(' '):(parsed.hashtags||'')}</div><div style="margin-top:6px;font-size:12px;color:#b0b0b0">Audio Recommendation</div><div id="var_${i}_audio" style="margin-top:4px;color:var(--color-audio);background:#040f1abd;padding:10px;border-radius:8px;white-space:pre-line"></div>`
      panel.appendChild(card)
      try{ const audioEl = document.getElementById('var_' + i + '_audio'); if(audioEl) audioEl.textContent = formatAudioDisplay(parsed.audio) }catch(e){}
    }

    if(loadingEl) loadingEl.textContent = ''

    function copyTextAndToastVar(text, btn){
      if(!text){ showToast('Nothing to copy', 'info'); return }
      navigator.clipboard.writeText(text).then(()=>{ showToast('Copied to clipboard', 'success'); if(btn){ const prev = btn.textContent; btn.textContent = 'Copied'; setTimeout(()=> btn.textContent = prev, 1200) } }).catch(()=> showToast('Copy failed', 'error'))
    }
    panel.querySelectorAll('button[data-copy-target]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const tgt = b.getAttribute('data-copy-target')
        const el = document.getElementById(tgt)
        copyTextAndToastVar(el ? el.textContent : '', b)
      })
    })
    panel.querySelectorAll('button[data-copy-all]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const prefix = b.getAttribute('data-copy-all')
        const parts = ['title','desc','hook','narrator','tags'].map(k=> { const el = document.getElementById(prefix + '_' + k); return el ? el.textContent : '' })
        copyTextAndToastVar(parts.join('\n\n'), b)
      })
    })
    panel.querySelectorAll('button[data-copy-caption]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const prefix = b.getAttribute('data-copy-caption')
        const descEl = document.getElementById(prefix + '_desc')
        const tagsEl = document.getElementById(prefix + '_tags')
        const desc = descEl ? descEl.textContent : ''
        const tags = tagsEl ? tagsEl.textContent : ''
        copyTextAndToastVar(tags ? (desc + '\n\n' + tags).trim() : desc, b)
      })
    })
    panel.querySelectorAll('button[data-copy-audio]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const prefix = b.getAttribute('data-copy-audio')
        const audioEl = document.getElementById(prefix + '_audio')
        const text = audioEl ? audioEl.textContent : ''
        copyTextAndToastVar(text, b)
      })
    })
    panel.querySelectorAll('button[data-feedback-id]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const id = b.getAttribute('data-feedback-id')
        const rating = b.getAttribute('data-feedback-rating') || 'good'
        setFeedback(id, rating)
        showToast(rating === 'good' ? 'Terima kasih!' : 'Feedback tercatat.', 'success')
      })
    })

    const exp = document.createElement('div')
    exp.style.marginTop = '10px'
    exp.innerHTML = `<button id="exportJsonVariations" class="primary">Export JSON</button>`
    panel.appendChild(exp)
    document.getElementById('exportJsonVariations').addEventListener('click', ()=>{
      const json = JSON.stringify(results.map(r=>r.parsed), null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `${(title||'variations').replace(/[^a-z0-9\-]/gi,'_')}_variations.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      showToast('JSON exported', 'success')
    })
    const presetKey = document.getElementById('aiPresetSelect')?.value || ''
    const goalsVar = (presetObj && Array.isArray(presetObj.goal) && presetObj.goal.length) ? presetObj.goal.join(', ') : ''
    pushGenerateHistory({ ts: Date.now(), title, overview, platform, presetKey, goals: goalsVar, type: 'variations', results })
  }catch(err){ console.error('generateVariations failed', err); showToast(err && err.message ? err.message : 'Variations failed.', 'error'); panel.innerHTML = '<div style="padding:12px;color:#c66">Variations failed. See console.</div>' }
}

async function loadMedia(page = 1){
  try{
    document.getElementById('loader').style.display = 'block'
    const s = window.appState
    let data
    if(s.searchQuery){
      // Search endpoint does not support many server-side filters; apply post-filtering in client
      data = await window.TMDB.search({ media: s.mediaType, query: s.searchQuery, page })
    } else {
      // Build discover params
      const params = new URLSearchParams()
      if (s.selectedGenre) params.append('with_genres', s.selectedGenre)
      if (s.selectedYear) {
        if (s.mediaType === 'movie') params.append('primary_release_year', s.selectedYear)
        else params.append('first_air_date_year', s.selectedYear)
      }
      // rating filters
      if (typeof s.minUserScore === 'number' && s.minUserScore > 0) params.append('vote_average.gte', String(s.minUserScore))
      params.append('vote_average.lte', '10')
      if (typeof s.minUserVotes === 'number' && s.minUserVotes > 0) params.append('vote_count.gte', String(s.minUserVotes))

      // sort handling: if combined -> sort will be done client-side, otherwise send sort_by
      if (s.selectedSort && !s.selectedSort.startsWith('combined')) {
        params.append('sort_by', s.selectedSort)
      }

      // pick endpoints for special categories
      if(s.mediaCategory === 'now_playing' && s.mediaType === 'movie'){
        data = await (await fetch(`${window.TMDB.base}/movie/now_playing?api_key=${window.TMDB.apiKey}&page=${page}&${params.toString()}`)).json()
      } else if(s.mediaCategory === 'upcoming' && s.mediaType === 'movie'){
        data = await (await fetch(`${window.TMDB.base}/movie/upcoming?api_key=${window.TMDB.apiKey}&page=${page}&${params.toString()}`)).json()
      } else if(s.mediaCategory === 'airing_today' && s.mediaType === 'tv'){
        data = await (await fetch(`${window.TMDB.base}/tv/airing_today?api_key=${window.TMDB.apiKey}&page=${page}&${params.toString()}`)).json()
      } else if(s.mediaCategory === 'on_the_air' && s.mediaType === 'tv'){
        data = await (await fetch(`${window.TMDB.base}/tv/on_the_air?api_key=${window.TMDB.apiKey}&page=${page}&${params.toString()}`)).json()
      } else {
        // discover
        data = await (await fetch(`${window.TMDB.base}/discover/${s.mediaType}?api_key=${window.TMDB.apiKey}&page=${page}&${params.toString()}`)).json()
      }

    }

    window.appState.maxPage = Math.min(data.total_pages || 1, 500)
    let results = data.results || []

    // apply combined sort locally
    if((window.appState.selectedSort || '').startsWith('combined')){
      const desc = (window.appState.selectedSort||'').endsWith('.desc')
      results.sort((a,b)=>{ const score = it => (it.popularity||0) + ((it.vote_average||0)*10); return desc ? score(b)-score(a) : score(a)-score(b) })
    }

    // client-side filtering for search or safety
    const minScore = window.appState.minUserScore || 0
    const minVotes = window.appState.minUserVotes || 0
    if(minScore>0 || minVotes>0){
      results = results.filter(r=>{ const avg = r.vote_average||0; const vc = r.vote_count||0; return avg>=minScore && avg<=10 && vc>=minVotes })
    }

    // enrich movie list with details when movie to get countries
    if(window.appState.mediaType === 'movie' && results.length){
      // fetch details in batches to avoid too many parallel requests
      const concurrency = 8
      const details = []
      for (let i = 0; i < results.length; i += concurrency) {
        const chunk = results.slice(i, i + concurrency)
        // use TMDB.getDetails which has caching
        // map to promises and wait for the chunk
        const chunkRes = await Promise.all(chunk.map(r => window.TMDB.getDetails('movie', r.id).catch(() => null)))
        details.push(...chunkRes)
      }
      const mediaList = results.map((m, idx)=>{
        const d = details[idx] || {}
        const statusText = (m.release_date && new Date(m.release_date) <= new Date()) ? 'Released' : 'Upcoming'
        const countries = (d.production_countries && d.production_countries.length)
          ? d.production_countries.map(c=> (c.iso_3166_1||'').toLowerCase()).filter(Boolean).join(', ')
          : (m.origin_country?.map(c=>c.toLowerCase()).join(', ')||'-')
        return {...m, statusText, countries}
      })
      // keep last fetched list available for quick fallbacks
      window.lastMediaList = mediaList
      renderMovies(mediaList)
    } else {
      const mediaList = results.map(m=>{
        const statusText = (m.first_air_date && new Date(m.first_air_date) <= new Date()) ? 'Aired' : 'Upcoming'
        const countries = m.origin_country?.map(c=>c.toLowerCase()).join(', ') || '-'
        return {...m, statusText, countries}
      })
      renderMovies(mediaList)
    }

    renderPagination(page)
  }catch(err){
    console.error('loadMedia error', err)
    const cont = document.getElementById('movieGrid') || document.getElementById('movieList')
    if (cont) cont.innerHTML = '<p>Error loading data. Try again later.</p>'
  }finally{
    document.getElementById('loader').style.display = 'none'
  }
}

function renderMovies(mediaList){
  const container = document.getElementById('movieGrid') || document.getElementById('movieList')
  container.innerHTML = ''
  mediaList.forEach(m=>{
    const img = m.poster_path ? `https://image.tmdb.org/t/p/w300${m.poster_path}` : 'https://netmoviestvshows.github.io/movie/images/no-poster-movie-tv.png'
    const title = window.appState.mediaType === 'movie' ? (m.title || '') : (m.name || '')
    const release = window.appState.mediaType === 'movie' ? (m.release_date ? m.release_date.split('-')[0] : 'Unknown') : (m.first_air_date ? m.first_air_date.split('-')[0] : 'Unknown')
    const rating = m.vote_average != null ? (m.vote_average.toFixed ? m.vote_average.toFixed(1) : m.vote_average) : 'N/A'
    const safeTitle = String(title||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")
    const html = `
      <div class="movie" title="${title} (${release})">
        <div class="rating">⭐ ${rating}</div>
        <div class="media-type-icon">${window.appState.mediaType==='movie'?'Movie':'TV'}</div>
        <img loading="lazy" src="${img}" alt="${title}" onclick="handleItemClick(event, ${m.id}, '${safeTitle}')">
        <div class="title">${title}</div>
        <div class="year">${m.statusText} : ${release}</div>
        <div class="country">${m.countries || '-'}</div>
      </div>`
    container.insertAdjacentHTML('beforeend', html)
  })
}

function renderPagination(page){
  const pag = document.getElementById('pagination')
  pag.innerHTML = ''
  const total = window.appState.maxPage || 1
  const addBtn = (label, p, disabled=false) => pag.insertAdjacentHTML('beforeend', `<button ${disabled? 'disabled': ''} onclick="goPage(${p})">${label}</button>`)
  addBtn('« First', 1, page===1)
  addBtn('‹ Prev', Math.max(1, page-1), page===1)
  const pages = []
  pages.push(1)
  let start = Math.max(2, page-2); let end = Math.min(total-1, page+2)
  if(start>2) pages.push('...')
  for(let i=start;i<=end;i++) pages.push(i)
  if(end<total-1) pages.push('...')
  pages.push(total)
  const unique = [...new Set(pages)]
  unique.forEach(p=>{
    if(p==='...') pag.insertAdjacentHTML('beforeend','<span>…</span>')
    else if(p===page) pag.insertAdjacentHTML('beforeend', `<button class="active">${p}</button>`)
    else pag.insertAdjacentHTML('beforeend', `<button onclick="goPage(${p})">${p}</button>`)
  })
  addBtn('Next ›', Math.min(total, page+1), page>=total)
  addBtn('Last »', total, page>=total)
}

function goPage(p){ if(p<1||p>window.appState.maxPage) return; window.appState.currentPage = p; loadMedia(p) }

function doSearch(){ window.appState.searchQuery = document.getElementById('searchInput').value.trim(); window.appState.currentPage = 1; loadMedia(1) }
function clearSearch(){ document.getElementById('searchInput').value=''; window.appState.searchQuery=''; window.appState.currentPage=1; loadMedia(1) }

function applyAllFilters(){
  window.appState.selectedGenre = document.getElementById('genreFilter').value || ''
  window.appState.selectedYear = document.getElementById('yearFilter').value || ''
  window.appState.selectedSort = document.getElementById('sortFilter').value || 'popularity.desc'
  window.appState.searchQuery = document.getElementById('searchInput').value.trim() || ''
  window.appState.minUserScore = parseFloat(document.getElementById('scoreSlider').value) || 0
  window.appState.minUserVotes = parseInt(document.getElementById('votesSlider').value,10) || 0
  window.appState.currentPage = 1
  loadMedia(1)
}

function resetFilters(){
  document.getElementById('genreFilter').value = ''
  document.getElementById('yearFilter').value = ''
  document.getElementById('sortFilter').value = 'popularity.desc'
  document.getElementById('searchInput').value = ''
  document.getElementById('scoreSlider').value = 0
  document.getElementById('votesSlider').value = 0
  document.getElementById('scoreLabel').textContent = '0'
  document.getElementById('votesLabel').textContent = '0'
  window.appState.selectedGenre = ''
  window.appState.selectedYear = ''
  window.appState.selectedSort = 'popularity.desc'
  window.appState.searchQuery = ''
  window.appState.minUserScore = 0
  window.appState.minUserVotes = 0
  window.appState.currentPage = 1
  loadMedia(1)
}

// Modal: fetch details and populate
async function openModal(id){ console.warn('openModal disabled - modal removed from UI'); return }

// Modal-related UI removed — kept openModal as a no-op to avoid runtime errors.
// If modal functionality needs to be restored in future, implement inside openModal(id) and ensure variables are properly scoped.


function closeModal(){
  const modal = document.getElementById('modal')
  if(!modal) return

  // Add closing animation class
  modal.classList.add('closing')
  
  // Wait for animation to finish, then hide
  setTimeout(() => {
    modal.style.display = 'none'
    modal.classList.remove('closing') // Reset untuk future opens
  }, 300) // Match var(--transition-fast) = 200ms + buffer

  // remove item query param (pattern used: ?=id-slug) without adding a history entry
  try{
    if(window.location.search && window.location.search.startsWith('?=')){
      history.replaceState(null, '', window.location.pathname)
    }
  }catch(e){ /* ignore */ }
}

// Close modal when clicking backdrop or elements with data-action="close-modal"; Esc to close
document.addEventListener('click', (ev)=>{
  try{
    const modal = document.getElementById('modal')
    if(!modal) return
    const target = ev.target
    if(target === modal || target.closest('[data-action="close-modal"]')){
      closeModal()
    }
  }catch(e){}
})

document.addEventListener('keydown', (ev)=>{
  if(ev.key === 'Escape'){
    const modal = document.getElementById('modal')
    if(modal && modal.style.display !== 'none') closeModal()
  }
})

// Ensure explicit close button (id="closeModal") calls closeModal when clicked
document.addEventListener('DOMContentLoaded', ()=>{
  const btn = document.getElementById('closeModal')
  if(btn) btn.addEventListener('click', closeModal)
})

// If URL contains ?=id-slug open modal for that id
function checkUrlForModal(){
  try{
    const qs = window.location.search
    if(qs && qs.startsWith('?=')){
      const raw = qs.slice(2)
      const id = parseInt(raw.split('-')[0], 10)
      if(!isNaN(id)) openModal(id)
    }
  }catch(e){ console.error('checkUrlForModal', e) }
}

// handle back/forward navigation
window.addEventListener('popstate', ()=>{ checkUrlForModal() })

// AI generate using backend proxy via window.AI.summarize
async function generateAIContent(){
  const md = document.getElementById('modalDetails')
  const id = md?.getAttribute('data-media-id')
  const mediaType = md?.getAttribute('data-media-type')
  if(!id || !mediaType) { showToast('No media selected', 'error'); return }
  const title = document.getElementById('modalTitle')?.textContent || ''
  const overview = document.getElementById('modalOverview')?.textContent || ''
  try{
    const text = await window.AI.summarize({ movieId: id, title, overview })
    // expect JSON in result; attempt to extract JSON object
    const jsonMatch = String(text).match(/\{[\s\S]*\}/)
    if(!jsonMatch) throw new Error('Invalid AI output')
    const parsed = JSON.parse(jsonMatch[0])
    document.getElementById('aiTitle').textContent = parsed.title || '-'
    document.getElementById('aiDescription').textContent = parsed.description || '-'
    document.getElementById('aiHashtags').textContent = Array.isArray(parsed.hashtags) ? parsed.hashtags.map(h=>`#${h}`).join(' ') : '-'
    document.getElementById('aiResult').style.display = 'block'
  }catch(err){ console.error('AI generate error', err); showToast('AI generate failed. See console.', 'error') }
}

// expose handlers used by inline attributes
// window.handleItemClick removed - movie grid removed from UI

// --- Gallery (based on original.html implementation) ---
// openGallery supports two modes:
//  - called with no args or a number: uses window._currentGallery (objects)
//  - called with an array of URL strings as first argument: will convert to gallery objects
function openGallery(arg, startIndex = 0){
  try{
    // normalize to window._currentGallery array of objects { original, medium, thumb, download }
    if(Array.isArray(arg) && typeof arg[0] === 'string'){
      window._currentGallery = arg.map(u => ({ original: u, medium: u, thumb: u, download: u }))
      window._currentGalleryType = 'posters'
      window._currentGalleryIndex = startIndex || 0
    } else if(typeof arg === 'number'){
      window._currentGalleryIndex = arg || 0
    } else {
      window._currentGalleryIndex = startIndex || window._currentGalleryIndex || 0
    }

    const gallery = window._currentGallery || []
    if(!gallery.length) return

    const overlay = document.getElementById('galleryOverlay')
    const gridPosters = document.getElementById('galleryGrid')
    const gridBackdrops = document.getElementById('galleryGridBackdrop')
    const galleryType = window._currentGalleryType || 'posters'
    if(!overlay) return

    overlay.style.display = 'flex'

    // choose which grid to use and show/hide appropriately
    let grid
    if(galleryType === 'backdrops'){
      if(gridPosters){ gridPosters.style.display = 'none'; gridPosters.innerHTML = '' }
      if(gridBackdrops){ gridBackdrops.style.display = 'grid'; gridBackdrops.innerHTML = '' }
      grid = gridBackdrops || gridPosters
    } else {
      if(gridBackdrops){ gridBackdrops.style.display = 'none'; gridBackdrops.innerHTML = '' }
      if(gridPosters){ gridPosters.style.display = 'grid'; gridPosters.innerHTML = '' }
      grid = gridPosters || gridBackdrops
    }

    // populate grid with cards and lazy-load placeholders
    const placeholder = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
    gallery.forEach((g, i)=>{
      const card = document.createElement('div')
      card.className = (galleryType === 'backdrops') ? 'gallery-backdrop-card' : 'gallery-card'

      const img = document.createElement('img')
      const realUrl = g.thumb || g.medium || g.original || ''
      if(realUrl) img.dataset.src = realUrl
      img.src = placeholder
      img.alt = `${galleryType === 'backdrops' ? 'Backdrop' : 'Poster'} ${i+1}`
      img.loading = 'lazy'
      img.decoding = 'async'
      img.style.cursor = realUrl ? 'zoom-in' : 'default'

      // click opens high-res in new tab
      img.onclick = (e) => {
        e.stopPropagation()
        const openUrl = g.original || g.medium || g.thumb || ''
        if(openUrl) window.open(openUrl, '_blank')
      }

      // download button
      const downloadUrl = g.download || g.original || g.medium || g.thumb || ''
      const dlBtn = document.createElement('button')
      dlBtn.className = 'gallery-download-btn'
      dlBtn.type = 'button'
      dlBtn.title = galleryType === 'backdrops' ? 'Download high-res (w1280)' : 'Download high-res (w1280)'
      dlBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
            <path stroke-dasharray="32" d="M12 21c-4.97 0 -9 -4.03 -9 -9c0 -4.97 4.03 -9 9 -9"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="32;0"></animate></path>
            <path stroke-dasharray="2 4" stroke-dashoffset="6" d="M12 3c4.97 0 9 4.03 9 9c0 4.97 -4.03 9 -9 9" opacity="0"><set fill="freeze" attributeName="opacity" begin="0.45s" to="1"></set><animateTransform fill="freeze" attributeName="transform" begin="0.45s" dur="0.6s" type="rotate" values="-180 12 12;0 12 12"></animateTransform><animate attributeName="stroke-dashoffset" begin="0.85s" dur="0.6s" repeatCount="indefinite" to="0"></animate></path>
            <path stroke-dasharray="10" stroke-dashoffset="10" d="M12 8v7.5"><animate fill="freeze" attributeName="stroke-dashoffset" begin="0.85s" dur="0.2s" to="0"></animate></path>
            <path stroke-dasharray="8" stroke-dashoffset="8" d="M12 15.5l3.5 -3.5M12 15.5l-3.5 -3.5"><animate fill="freeze" attributeName="stroke-dashoffset" begin="1.05s" dur="0.2s" to="0"></animate></path>
          </g>
        </svg>`
      dlBtn.style.cursor = downloadUrl ? 'pointer' : 'default'
      dlBtn.onclick = (ev) => { ev.stopPropagation(); ev.preventDefault(); if(!downloadUrl) return; const baseTitle = document.getElementById('modalTitle')?.textContent || ''; const suffix = galleryType === 'backdrops' ? 'backdrop' : 'poster'; downloadHighRes(downloadUrl, baseTitle, suffix) }

      const meta = document.createElement('div')
      meta.className = 'card-meta'
      meta.textContent = `${galleryType === 'backdrops' ? 'Backdrop' : 'Poster'} ${i+1}`

      card.appendChild(img)
      card.appendChild(dlBtn)
      card.appendChild(meta)
      if(grid) grid.appendChild(card)
    })

    // setup IntersectionObserver to lazy-load images
    try{
      if(window._galleryObserver){ try{ window._galleryObserver.disconnect() }catch(e){} }
      const rootEl = document.getElementById('galleryInner')
      const imgs = grid ? grid.querySelectorAll('img[data-src]') : []
      const obs = new IntersectionObserver((entries, observer)=>{
        entries.forEach(ent=>{
          if(ent.isIntersecting){
            const el = ent.target
            if(el.dataset && el.dataset.src){ el.src = el.dataset.src; el.removeAttribute('data-src') }
            observer.unobserve(el)
          }
        })
      }, { root: rootEl, rootMargin: '200px', threshold: 0.01 })
      imgs.forEach(iimg=>obs.observe(iimg))
      window._galleryObserver = obs
    }catch(e){ console.warn('gallery lazy observer failed', e) }

    // Accessibility + visible class
    overlay.classList.add('gallery-visible')
    overlay.removeAttribute('aria-hidden')
    // ensure gallery starts at top and first card is visible
    try{
      const inner = document.getElementById('galleryInner')
      if(inner) inner.scrollTop = 0
      const firstCard = (grid) ? (grid.querySelector('.gallery-card') || grid.querySelector('.gallery-backdrop-card')) : null
      if(firstCard && firstCard.scrollIntoView) {
        // delay a bit to allow images/layout to settle, then ensure first card is top-left
        setTimeout(()=>{
          try{ firstCard.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'start' }) }catch(e){}
          try{ if(inner) inner.scrollLeft = 0 }catch(e){}
        }, 120)
      }
    }catch(e){}
  }catch(err){ console.error('openGallery error', err) }
}
window.openGallery = openGallery

function closeGallery(){
  const overlay = document.getElementById('galleryOverlay')
  if(!overlay) return
  overlay.style.display = 'none'
  try{ const g1 = document.getElementById('galleryGrid'); if(g1) g1.innerHTML = '' }catch(e){}
  try{ const g2 = document.getElementById('galleryGridBackdrop'); if(g2) g2.innerHTML = '' }catch(e){}
  try{ if(window._galleryObserver){ window._galleryObserver.disconnect(); window._galleryObserver = null } }catch(e){}
}
window.closeGallery = closeGallery

async function downloadHighRes(url, baseTitle, suffix){
  window._downloadNameCounts = window._downloadNameCounts || {}
  const base = (typeof baseTitle === 'string' && baseTitle.trim()) ? String(baseTitle).trim().replace(/[^a-z0-9-]/gi, '_') : ''
  const safeSuggested = base ? `${base}_${suffix||'image'}` : (suffix||'image')
  const ext = 'jpg'
  const key = `${safeSuggested}.${ext}`
  const count = window._downloadNameCounts[key] ? window._downloadNameCounts[key] + 1 : 1
  window._downloadNameCounts[key] = count
  const filename = count === 1 ? `${safeSuggested}.${ext}` : `${safeSuggested}_${count}.${ext}`
  try{
    const res = await fetch(url, { mode: 'cors' })
    if(!res.ok) throw new Error('Network response was not ok')
    const blob = await res.blob()
    const a = document.createElement('a')
    const objectUrl = URL.createObjectURL(blob)
    a.href = objectUrl; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
    setTimeout(()=>URL.revokeObjectURL(objectUrl), 1000)
  }catch(err){ console.error('Download failed', err); try{ window.open(url, '_blank') }catch(e){} }
}

function galleryPrev(){ const g = window._currentGallery || []; if(!g.length) return; window._currentGalleryIndex = (window._currentGalleryIndex - 1 + g.length) % g.length; updateGalleryImage() }
function galleryNext(){ const g = window._currentGallery || []; if(!g.length) return; window._currentGalleryIndex = (window._currentGalleryIndex + 1) % g.length; updateGalleryImage() }
function updateGalleryImage(){ const g = window._currentGallery || []; if(!g.length) return; const idx = Math.max(0, Math.min(window._currentGalleryIndex||0, g.length-1)); window._currentGalleryIndex = idx; const img = document.getElementById('galleryImage'); if(img) img.src = g[idx].original || g[idx].medium || g[idx].thumb || ''; const thumbs = document.querySelectorAll('.gallery-thumb'); thumbs.forEach((t,i)=> t.classList.toggle('active', i===idx)) }

// Wire gallery close handlers and poster/backdrop clicks to open gallery
document.addEventListener('DOMContentLoaded', ()=>{
  const overlay = document.getElementById('galleryOverlay')
  const closeBtn = document.getElementById('galleryClose')
  if(closeBtn) closeBtn.addEventListener('click', ()=>{ closeGallery() })
  if(overlay) overlay.addEventListener('click', (ev)=>{ if(ev.target === overlay) closeGallery() })
  document.addEventListener('keydown', (ev)=>{ if(ev.key === 'Escape'){ const o = document.getElementById('galleryOverlay'); if(o && getComputedStyle(o).display==='flex'){ closeGallery() } } })

  const modalPoster = document.getElementById('modalPoster')
  const modalBackdropImage = document.getElementById('modalBackdropImage')
  function attachClick(el, preferType){ if(!el) return; el.style.cursor='pointer'; el.addEventListener('click', async ()=>{
    const md = document.getElementById('modalDetails'); const id = md?.getAttribute('data-media-id'); const mediaType = md?.getAttribute('data-media-type') || 'movie'; if(!id) return; let data = null; try{ data = await window.TMDB.getDetails(mediaType, id) }catch(e){ return }
    let postersArr = (data?.images?.posters || [])
    let backdropsArr = (data?.images?.backdrops || [])
    if((!postersArr.length && !backdropsArr.length)){
      try{ const url = `${window.TMDB.base}/${mediaType}/${id}/images?api_key=${window.TMDB.apiKey}`; const res = await fetch(url); if(res.ok){ const json = await res.json(); postersArr = json.posters || postersArr; backdropsArr = json.backdrops || backdropsArr } }
      catch(err){ console.warn('attachClick: images fallback fetch error', err) }
    }
    const posters = (postersArr||[]).map(p=>({ original: p.file_path?window.TMDB.imageUrl(p.file_path,'w1280'): '', download: p.file_path?window.TMDB.imageUrl(p.file_path,'w1280'): '', medium: p.file_path?window.TMDB.imageUrl(p.file_path,'w500'): '', thumb: p.file_path?window.TMDB.imageUrl(p.file_path,'w300'): '' })).filter(x=>x.original||x.medium||x.thumb||x.download)
    const backdrops = (backdropsArr||[]).map(b=>({ original: b.file_path?window.TMDB.imageUrl(b.file_path,'w1280'):'', download: b.file_path?window.TMDB.imageUrl(b.file_path,'w1280'):'', medium: b.file_path?window.TMDB.imageUrl(b.file_path,'w500'):'', thumb: b.file_path?window.TMDB.imageUrl(b.file_path,'w300'):'' })).filter(x=>x.original||x.medium||x.thumb||x.download)
    // choose based on preferType: if preferType indicates backdrop, prefer backdrops first
    const preferBackdrops = String(preferType || '').toLowerCase().includes('backdrop')
    if(preferBackdrops){
      if(backdrops.length){ window._currentGallery = backdrops; window._currentGalleryType='backdrops'; window._currentGalleryIndex = 0; openGallery(0); }
      else if(posters.length){ window._currentGallery = posters; window._currentGalleryType='posters'; window._currentGalleryIndex = 0; openGallery(0); }
    } else {
      if(posters.length){ window._currentGallery = posters; window._currentGalleryType='posters'; window._currentGalleryIndex = 0; openGallery(0); }
      else if(backdrops.length){ window._currentGallery = backdrops; window._currentGalleryType='backdrops'; window._currentGalleryIndex = 0; openGallery(0); }
    }
  }) }
    attachClick(modalPoster, 'poster')
    attachClick(modalBackdropImage, 'backdrop')
})

// Auto-load API key from backend on startup for device/browser new scenario
document.addEventListener('DOMContentLoaded', async ()=>{
  try{
    // Get current provider from localStorage or use default
    const settings = localStorage.getItem('ai-settings')
    let provider = 'single'
    if(settings){
      try{ const parsed = JSON.parse(settings); provider = parsed.provider || 'single' }
      catch(e){}
    }
    
    // Auto-load key from backend (will cache to localStorage + populate Settings input)
    aiLog('info','initializeAIGenerator.start',{ provider })
    await loadApiKeyFromBackend(provider)
    aiLog('info','initializeAIGenerator.complete',{ provider })
  }catch(err){
    aiLog('error','initializeAIGenerator.failed',{ error: String(err) })
  }
})

