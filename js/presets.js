// presets.js - presets manager: full Viral SEO Sales schema + localStorage + backend (KV) sync
(function(){
  const KEY = 'genco_presets_v1'

  /** Single default preset shape (all sections). Backward-compat: old fields label, platform, goal, tone, cta, structure, hashtagCount kept. */
  function getDefaultPreset(overrides){
    const d = {
      label: '',
      platform: 'tiktok',
      goal: [], // multi: FYP, SEO, Viewer, Viral, Penjualan
      role: '',
      targetAudience: '',
      tone: '',
      languageRules: '',
      emotionTrigger: [], // Penasaran, Takut ketinggalan, Senang, Termotivasi, Ingin beli
      structure: '',
      hookStyle: '',
      formatOutput: '',
      length: '',
      keywordMain: '',
      keywordExtra: '',
      hashtagStrategy: '',
      hashtagCount: 10,
      ctaMain: '',
      ctaAffiliate: '', // e.g. "Link di bio", "Klik link"
      ctaEngagement: [], // Comment, Save, Share, Follow
      engagementGoal: '',
      negativeRules: '',
      maxWords: 120,
      forbiddenWords: '',
      variationCount: 3,
      consistencyRule: false,
      exampleOutput: '',
      trendingContext: '',
      keywordPriorityOrder: '',
      // Audio & Music Recommendation
      audioStyle: '',
      musicMood: '',
      audioGenre: '',
      musicSuggestion: '',
      audioLength: '',
      // legacy
      goal: [],
      cta: '',
      structure: '',
      length: 'short',
      emojiStyle: 'light'
    }
    return Object.assign({}, d, overrides || {})
  }

  /** Build AI instruction string from preset object (all sections). */
  function buildPresetInstructions(p){
    if(!p || typeof p !== 'object') return ''
    const arr = []
    if(p.platform) arr.push('Platform: ' + p.platform)
    if(Array.isArray(p.goal) && p.goal.length) arr.push('Tujuan: ' + p.goal.join(', '))
    else if(p.goal) arr.push('Tujuan: ' + (typeof p.goal === 'string' ? p.goal : String(p.goal)))
    if(p.role) arr.push('Peran AI: ' + p.role)
    if(p.targetAudience) arr.push('Target audiens: ' + p.targetAudience)
    if(p.tone) arr.push('Gaya/Tone: ' + p.tone)
    if(p.languageRules) arr.push('Aturan bahasa: ' + p.languageRules)
    if(Array.isArray(p.emotionTrigger) && p.emotionTrigger.length) arr.push('Emosi target: ' + p.emotionTrigger.join(', '))
    if(p.structure) arr.push('Struktur: ' + p.structure)
    if(p.hookStyle) arr.push('Hook style: ' + p.hookStyle)
    if(p.formatOutput) arr.push('Format output: ' + p.formatOutput)
    if(p.length) arr.push('Panjang: ' + p.length)
    if(p.keywordMain) arr.push('Keyword utama: ' + p.keywordMain)
    if(p.keywordExtra) arr.push('Keyword tambahan: ' + p.keywordExtra)
    if(p.hashtagStrategy) arr.push('Strategi hashtag: ' + p.hashtagStrategy)
    if(p.hashtagCount != null) arr.push('Jumlah hashtag: ' + p.hashtagCount)
    if(p.ctaMain || p.cta) arr.push('CTA: ' + (p.ctaMain || p.cta))
    if(p.ctaAffiliate) arr.push('Link/CTA affiliate: ' + p.ctaAffiliate)
    if(Array.isArray(p.ctaEngagement) && p.ctaEngagement.length) arr.push('CTA engagement: ' + p.ctaEngagement.join(', '))
    if(p.engagementGoal) arr.push('Engagement goal: ' + p.engagementGoal)
    if(p.negativeRules) arr.push('Larangan: ' + p.negativeRules)
    if(p.maxWords != null) arr.push('Maks kata: ' + p.maxWords)
    if(p.forbiddenWords) arr.push('Kata terlarang: ' + p.forbiddenWords)
    if(p.exampleOutput) arr.push('Contoh output: ' + p.exampleOutput)
    if(p.trendingContext) arr.push('Trending: ' + p.trendingContext)
    if(p.keywordPriorityOrder) arr.push('Urutan keyword: ' + p.keywordPriorityOrder)
    return arr.join('. ')
  }

  const defaults = {
    Informal: Object.assign(getDefaultPreset(), {
      label: 'Informal',
      platform: 'youtube',
      goal: ['Viewer', 'Viral'],
      tone: 'santai, friendly',
      length: 'short',
      cta: 'Follow for more',
      structure: 'Hook -> Benefit -> CTA',
      hashtagCount: 8,
      audioStyle: 'Upbeat, energetic music yang relatable untuk casual viewers, comedy/lifestyle content. Music menambah vibe santai tanpa terlalu mendominasi.',
      musicMood: 'Energetic, fun, relatable, uplifting',
      audioGenre: 'Pop, Indie Pop, Electronic, Lo-fi Hip-hop, Upbeat Indie',
      musicSuggestion: '[SPOTIFY] "Trending Indie Pop" • "Upbeat Feel-Good" • "Chill Vibes"\n[YOUTUBE] "Upbeat Background Music" library\n[EPIDEMIC SOUND] Indie Pop & Feel-Good categories\nBPM: 120-130 | Vibe: Relatable, fun, encouraging engagement\nIdeal untuk: ComKedy sketches, lifestyle tips, casual vlogs',
      audioLength: '15s-30s'
    }),
    Jualan: Object.assign(getDefaultPreset(), {
      label: 'Jualan',
      platform: 'tiktok',
      goal: ['FYP', 'Penjualan'],
      tone: 'persuasif, santai',
      length: 'short',
      cta: 'Beli sekarang',
      structure: 'Hook -> Benefit -> Social proof -> CTA',
      hashtagCount: 10,
      audioStyle: 'Upbeat dan persuasif dengan energy boost di momen penting (unboxing, reveal). Music membuat viewer tertarik membeli tanpa terasa pushy. Dynamic tempo untuk highlight features.',
      musicMood: 'Dynamic, persuasive, engaging, premium-vibe, action-oriented',
      audioGenre: 'Electronic Technical, Corporate Upbeat, Indie Electronic, Smooth Pop, Tech Startup Vibes',
      musicSuggestion: '[YOUTUBE] AudioJungle "Product Intro" • "Tech Background" sounds\n[SPOTIFY] "Confident Hits" • "Electronic Beats"\n[TRENDING] Check TikTok/Instagram trending sounds weekly\nBPM: 110-120 (dynamic builds) | Pattern: Intro (energetic) → Details (calm) → Reveal (↑↑) → CTA (peak)\nCritical: Hook at 0-3 seconds = success/fail! Match music crescendo to unboxing moment',
      audioLength: '30s-45s'
    }),
    Edukasi: Object.assign(getDefaultPreset(), {
      label: 'Edukasi',
      platform: 'youtube',
      goal: ['SEO', 'Viewer'],
      tone: 'informative, clear',
      length: 'medium',
      cta: 'Pelajari lebih lanjut',
      structure: 'Hook -> 2 tips -> CTA',
      hashtagCount: 6,
      audioStyle: 'Soft background music yang enhance focus tanpa distraksi. Musik mendukung pacing membaca/menonton viewer. Calming atmosphere untuk concentration.',
      musicMood: 'Ambient, peaceful, concentration-enhancing, professional, subtle',
      audioGenre: 'Lo-fi Hip-hop, Ambient, Piano Classics, Acoustic Minimal, Chillhop, Downtempo Electronic',
      musicSuggestion: '[SPOTIFY] "Peaceful Piano" • "Lo-Fi Beats Study" • "Calming Classical"\n[YOUTUBE] Search: "Background Music for Educational Videos"\n[FREE] YouTube Audio Library: Ambient section (excellent quality)\nBPM: 60-80 | Volume: -15dB background | Duration: 2-3 min loops\nGoal: Support narration, NOT compete with content. Enhance learning atmosphere',
      audioLength: 'flexible'
    }),
    TikTokFYP: Object.assign(getDefaultPreset(), {
      label: 'TikTok FYP',
      platform: 'tiktok',
      goal: ['FYP', 'Viral', 'Follower'],
      tone: 'energetic, hooky, relatable',
      length: 'short',
      cta: 'Follow & save',
      structure: 'Hook 3 detik -> Value -> CTA',
      hashtagCount: 12,
      variationCount: 3,
      audioStyle: 'Trending sound dengan IMMEDIATE hook dalam 3 detik pertama. Music harus viral-friendly, recognizable, shareable. Sound harus catchy enough untuk di-save & share.',
      musicMood: 'Energetic, trending, viral-optimized, shareable, attention-grabbing',
      audioGenre: 'Trending TikTok Sounds, Indie Pop, Electronic Pop, Synthwave, Upbeat Indie, UK Garage Remixes',
      musicSuggestion: '[TRENDING] Check Shazam Top Charts + TikTok Creative Sounds weekly\n[PLATFORM] TikTok Sound Library (built-in creator studio)\n[SPOTIFY] "Today\'s Top Hits" • "New Music Daily"\n⚠️ CRITICAL: Hook MUST start at 0:00s (first 3 seconds = 90% of success!)\nBPM: 120-130 | Duration: 15-30 sec | Format: sharp, punchy, scroll-stopping\nStrategy: Monitor trending sounds, use audio that\'s currently going viral in FYP algorithm',
      audioLength: '15s-30s'
    }),
    ReelsViral: Object.assign(getDefaultPreset(), {
      label: 'Reels Viral',
      platform: 'instagram',
      goal: ['FYP', 'Viral', 'Follower'],
      tone: 'energetic, aspirational',
      length: 'short',
      cta: 'Follow for more',
      structure: 'Hook -> Story/Value -> CTA',
      hashtagCount: 15,
      variationCount: 3,
      audioStyle: 'Energetic, cinematic build-up music dengan plot twist atau surprise moment. Hook pertama 3 detik CRITICAL untuk scroll-stop. Music creates anticipation & curiosity.',
      musicMood: 'Epic, dramatic, exciting, surprising, aspirational, build-up energy',
      audioGenre: 'Electronic Pop, Synthwave, Cinematic Trailer, Epic Indie Music, High-Energy Electronic',
      musicSuggestion: '[INSTAGRAM] Reels Audio Library (built-in, high quality)\n[TRENDING] Instagram Reels trending sounds (updated daily)\n[SPOTIFY] "Epic Indie Tracks" • "Cinematic Hits"\n[EPIDEMIC SOUND] Electronic & Epic categories\nSTRUCTURE: 0-3s Hook (MUST grab attention) → Build tension (3-10s) → Climax/Plot twist (10-20s) → Resolution/CTA (20-30s)\nBPM: 120-150 | Duration: 15-30 sec\nPro tip: Use audio that has recognizable "drop" or surprise moment for rewatch value',
      audioLength: '15s-30s'
    }),
    FollowerGrowth: Object.assign(getDefaultPreset(), {
      label: 'Follower Growth',
      platform: 'youtube',
      goal: ['Follower', 'Viewer', 'Viral'],
      tone: 'friendly, engaging',
      length: 'short',
      cta: 'Subscribe & like',
      structure: 'Hook -> Benefit -> CTA follow/subscribe',
      hashtagCount: 8,
      variationCount: 3,
      audioStyle: 'Warm dan engaging music yang connect dengan audience emotionally. Music encourage subscription & loyalty dengan relatable vibe. Builds community feeling.',
      musicMood: 'Warm, inviting, motivational, relatable, community-building, encouraging',
      audioGenre: 'Indie Pop, Acoustic Upbeat, Lo-fi Hip-hop, Warm Electronic, Feel-Good Indie',
      musicSuggestion: '[SPOTIFY] "Cafeteria Music" • "Feel-Good Indie" • "Supportive Energy"\n[YOUTUBE] YouTube Audio Library: "Subscribe-Friendly" section\n[EPIDEMIC SOUND] Community & Feel-Good categories\nBPM: 100-120 | Duration: 30-45 seconds | Vibe: Approachable, community-focused\nGoal: Make viewers WANT to follow for more of this positive energy. Music conveys "this channel has good vibes"',
      audioLength: '30s'
    })
  }

  function getBackendURL(){
    try {
      const stored = String(localStorage.getItem('backend_url') || '').trim()
      const raw = stored || (window.APP_CONFIG && window.APP_CONFIG.backendURL) || (window.AI && window.AI.backendURL) || (window.API_BASE_URL || '')
      const url = String(raw || '').replace(/\/+$/, '')
      
      // Validate URL format
      if (url) {
        try {
          new URL(url)  // Test if valid URL
          return url
        } catch (e) {
          console.warn('[presets] invalid backend URL:', url)
          return ''
        }
      }
      return ''
    } catch (e) { return '' }
  }

  // New storage shape:
  // {
  //   userPresets: { <key>: {...}, ... },
  //   hiddenTemplates: { <key>: true, ... },
  //   ts: 1600000000000
  // }
  function _emptyStorage(){ return { userPresets: {}, hiddenTemplates: {}, ts: Date.now() } }

  function load(){
    try {
      const raw = localStorage.getItem(KEY)
      if(!raw) return _emptyStorage()
      const parsed = JSON.parse(raw)
      // Migration: if parsed is legacy flat map (no userPresets field), convert to new shape
      if(parsed && typeof parsed === 'object' && !parsed.userPresets){
        return { userPresets: parsed || {}, hiddenTemplates: {}, ts: Date.now() }
      }
      // ensure fields exist
      return Object.assign(_emptyStorage(), parsed)
    } catch(e){ return _emptyStorage() }
  }

  function saveLocal(obj){
    try {
      const normalized = Object.assign(_emptyStorage(), obj)
      normalized.ts = Date.now()
      localStorage.setItem(KEY, JSON.stringify(normalized))
      return true
    } catch(e){ return false }
  }

  /** Simpan ke localStorage + ke backend yang aktif (dari Settings/config: lokal 127.0.0.1:8787 atau external workers.dev). */
  function save(obj){
    // obj should be the full storage shape or partial (we'll merge)
    try{
      const cur = load()
      const merged = Object.assign(cur, obj || {})
      saveLocal(merged)
      const base = getBackendURL()
      if (base) {
        const token = sessionStorage.getItem('auth_token')
        const headers = { 'Content-Type': 'application/json' }
        if (token) headers['Authorization'] = 'Bearer ' + token
        // send only user-manageable parts to backend
        const payload = { userPresets: merged.userPresets || {}, hiddenTemplates: merged.hiddenTemplates || {} }
        fetch(base + '/presets', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        }).then(async r => {
          if (r.status === 401) {
              sessionStorage.removeItem('auth_token')
              if (typeof showToast === 'function') showToast('Session kadaluarsa. Silakan login lagi', 'error')
              return
            }
          if (r.ok) {
            try{
              // mark keys as server-synced locally
              const cur = load()
              const keys = Object.keys(payload.userPresets || {})
              keys.forEach(k => {
                if (cur.userPresets && cur.userPresets[k]) {
                  cur.userPresets[k]._serverSynced = true
                }
              })
              saveLocal(cur)
            }catch(e){ console.warn('[presets] mark serverSynced failed', e) }
          } else {
            console.warn('[presets] save to backend returned status', r.status)
          }
        }).catch(err => { console.warn('[presets] save POST error', err) })
      }
      return true
    }catch(e){ return false }
  }

  function syncFromBackend(){
    const base = getBackendURL()
    if (!base) return Promise.resolve()
    const token = sessionStorage.getItem('auth_token')
    // if no auth token, prompt login and skip backend sync to avoid 401 spam
    if (!token) {
      if (typeof showToast === 'function') showToast('Anda harus login terlebih dahulu', 'error')
      return Promise.resolve()
    }
    // debug: print token presence and try to decode payload (local only)
    try {
      console.debug('[presets] syncFromBackend - token present')
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        console.debug('[presets] token payload:', payload)
      } catch (e) {
        console.debug('[presets] token decode failed', e)
      }
    } catch (e) {}

    const headers = { 'Content-Type': 'application/json' }
    headers['Authorization'] = 'Bearer ' + token
    console.debug('[presets] fetching', base + '/presets', headers)
    return fetch(base + '/presets', { headers })
      .then(r => {
        console.debug('[presets] response status', r.status, 'ok', r.ok)
        if (r.status === 401) {
          // unauthorized: remove token
          sessionStorage.removeItem('auth_token')
          if (typeof showToast === 'function') showToast('Session kadaluarsa. Silakan login kembali', 'error')
          return null
        }
        return r.ok ? r.json() : null
      })
      .then(data => {
        if (!data) return
        // If backend provides explicit userPresets + defaults
        if (data.userPresets || data.defaults || data.hiddenTemplates) {
          const remoteUser = data.userPresets || data.presets || {}
          const remoteHidden = data.hiddenTemplates || {}
          const local = load()
          const mergedUser = Object.assign({}, local.userPresets || {}, remoteUser)
          const mergedHidden = Object.assign({}, local.hiddenTemplates || {}, remoteHidden)
          save({ userPresets: mergedUser, hiddenTemplates: mergedHidden })
          return
        }
        // legacy: if data.presets or a flat map returned, migrate into userPresets
        if (data.presets && typeof data.presets === 'object'){
          const local = load()
          const mergedUser = Object.assign({}, local.userPresets || {}, data.presets || {})
          save({ userPresets: mergedUser })
          return
        }
        // handle case where backend returned merged/defaults object (legacy)
        if (data && typeof data === 'object'){
          // If keys look like presets (heuristic), treat as userPresets
          const local = load()
          save({ userPresets: Object.assign({}, local.userPresets || {}, data) })
        }
      })
      .catch(err => { console.warn('[presets] syncFromBackend fetch error', err) })
  }

  // list returns union of builtin defaults and user-presets, marking builtin flag
  function list(){
    const store = load()
    const res = []
    // builtin defaults first
    Object.keys(defaults).forEach(k=>{
      res.push({ key: k, label: (defaults[k] && defaults[k].label) ? defaults[k].label : k, builtin: true })
    })
    // then user presets
    Object.keys(store.userPresets || {}).forEach(k=>{
      res.push({ key: k, label: (store.userPresets[k] && store.userPresets[k].label) ? store.userPresets[k].label : k, builtin: false })
    })
    return res
  }

  function get(key){
    const store = load()
    if(!key) return null
    if(store.userPresets && store.userPresets[key]) return store.userPresets[key]
    if(defaults && defaults[key]) return defaults[key]
    return null
  }

  function upsert(key, data){
    const store = load()
    store.userPresets = store.userPresets || {}
    store.userPresets[key] = Object.assign(getDefaultPreset(), store.userPresets[key] || {}, data)
    save(store)
    return true
  }

  function remove(key){
    const store = load()
    if(store.userPresets && store.userPresets[key]){
      delete store.userPresets[key]
      save(store)
      // Call backend DELETE endpoint (async, fire and forget)
      const base = getBackendURL()
      if (base) {
        const token = sessionStorage.getItem('auth_token')
        const headers = { 'Content-Type': 'application/json' }
        if (token) headers['Authorization'] = 'Bearer ' + token
        fetch(base + '/presets/' + encodeURIComponent(key), {
          method: 'DELETE',
          headers
        })
        .then(r => {
          if (!r.ok) {
            if (r.status === 404) {
              console.info('[presets] DELETE ignored - preset not found on server:', key)
            } else {
              console.warn('[presets] DELETE failed for key', key, 'status', r.status)
            }
          }
        })
        .catch(err => console.warn('[presets] DELETE network error for key', key, err))
      }
      return true
    }
    // if trying to remove builtin template, don't delete
    return false
  }

  /** Export full presets as JSON (for backup to file). Safe to store on disk/cloud. */
  function exportBackup(){
    const obj = load()
    return { version: 1, key: KEY, exportedAt: new Date().toISOString(), storage: obj }
  }

  /** Import from backup object. Merges with existing (backup presets overwrite by key). Returns { success, mergedCount, error? }. */
  function importBackup(backup){
    if (!backup || typeof backup !== 'object') return { success: false, error: 'Invalid backup data' }
    const payload = backup.storage && typeof backup.storage === 'object' ? backup.storage : (backup.presets && typeof backup.presets === 'object' ? { userPresets: backup.presets } : null)
    if(!payload) return { success: false, error: 'Invalid backup shape' }
    const current = load()
    const merged = Object.assign({}, current)
    merged.userPresets = Object.assign({}, current.userPresets || {}, payload.userPresets || {})
    merged.hiddenTemplates = Object.assign({}, current.hiddenTemplates || {}, payload.hiddenTemplates || {})
    let mergedCount = Object.keys(payload.userPresets || {}).length
    save(merged)
    return { success: true, mergedCount }
  }

  /**
   * Migrate legacy flat preset map stored under KEY into the new storage shape.
   * If migration occurs, it writes normalized shape back to localStorage and returns it.
   */
  function migrateLegacyPresets(){
    try{
      const raw = localStorage.getItem(KEY)
      if(!raw) return load()
      const parsed = JSON.parse(raw)
      if(parsed && typeof parsed === 'object' && !parsed.userPresets){
        const normalized = { userPresets: parsed || {}, hiddenTemplates: {}, ts: Date.now() }
        saveLocal(normalized)
        console.info('[presets] migrated legacy presets to new storage shape', normalized)
        return normalized
      }
      // already in new shape
      return load()
    }catch(e){ console.warn('[presets] migrateLegacyPresets failed', e); return load() }
  }

  /** Debug helper: return current in-storage object (normalized) */
  function getStorage(){ return load() }

  /** Template presets for "Auto-fill" buttons (Jualan Viral, Edukasi Viral, Branding Viral). */
  function getTemplatePreset(name){
    const t = {
      JualanViral: getDefaultPreset({
        label: 'Jualan Viral Pro',
        platform: 'tiktok',
        goal: ['FYP', 'Viral', 'Penjualan'],
        role: 'Kamu adalah viral content strategist dan social media copywriter profesional untuk penjualan.',
        targetAudience: 'Usia 18–35, suka belanja online, suka promo, pemula.',
        tone: 'Santai, persuasif, relatable, urgency ringan',
        languageRules: 'Bahasa Indonesia santai, kalimat pendek, maksimal 2 emoji, tidak formal.',
        emotionTrigger: ['Penasaran', 'Takut ketinggalan', 'Ingin beli'],
        structure: 'Hook → Problem → Benefit → Proof → Question → CTA',
        hookStyle: 'Pertanyaan',
        formatOutput: 'Per baris sesuai struktur',
        length: '4–6 kalimat',
        keywordMain: 'skincare murah',
        keywordExtra: 'glowing, wajah bersih, aman',
        hashtagStrategy: 'Niche + keyword',
        hashtagCount: 10,
        ctaMain: 'Klik keranjang sekarang',
        ctaEngagement: ['Comment', 'Save', 'Share'],
        engagementGoal: 'Kombinasi',
        negativeRules: 'Jangan menyebut AI, jangan bahasa formal, jangan terlalu panjang.',
        maxWords: 120,
        forbiddenWords: 'gratis palsu, clickbait',
        variationCount: 3
      }),
      EdukasiViral: getDefaultPreset({
        label: 'Edukasi Viral',
        platform: 'youtube',
        goal: ['SEO', 'Viewer', 'Viral'],
        role: 'Kamu adalah edukator konten viral dan copywriter yang membuat penjelasan rumit jadi mudah.',
        targetAudience: 'Usia 18–40, ingin belajar cepat, suka konten singkat.',
        tone: 'Informative, clear, engaging',
        languageRules: 'Bahasa Indonesia baku santai, kalimat singkat, maksimal 1 emoji.',
        emotionTrigger: ['Penasaran', 'Termotivasi'],
        structure: 'Hook → 2 tips → CTA',
        hookStyle: 'Fakta mengejutkan',
        formatOutput: 'Per baris sesuai struktur',
        length: '4–6 kalimat',
        keywordMain: '',
        keywordExtra: '',
        hashtagStrategy: 'Keyword + trending',
        hashtagCount: 6,
        ctaMain: 'Pelajari lebih lanjut',
        ctaEngagement: ['Save', 'Share'],
        engagementGoal: 'Save',
        negativeRules: 'Jangan terlalu panjang, jangan jargon berat.',
        maxWords: 100,
        variationCount: 3
      }),
      BrandingViral: getDefaultPreset({
        label: 'Branding Viral',
        platform: 'instagram',
        goal: ['FYP', 'Viewer', 'Viral'],
        role: 'Kamu adalah brand storyteller dan copywriter yang membangun awareness dengan konten viral.',
        targetAudience: 'Usia 18–35, tertarik lifestyle dan brand.',
        tone: 'Energetic, aspirational, relatable',
        languageRules: 'Bahasa Indonesia santai, tone brand konsisten.',
        emotionTrigger: ['Senang', 'Termotivasi'],
        structure: 'Hook → Cerita singkat → Benefit → CTA',
        hookStyle: 'Cerita singkat',
        formatOutput: '2 paragraf',
        length: '6–8 kalimat',
        hashtagStrategy: 'Campuran',
        hashtagCount: 12,
        ctaMain: 'Follow untuk konten seru',
        ctaEngagement: ['Follow', 'Share'],
        engagementGoal: 'Kombinasi',
        negativeRules: 'Jangan terlalu jualan, fokus value.',
        maxWords: 150,
        variationCount: 3
      }),
      AffiliateReview: getDefaultPreset({
        label: 'Affiliate Review',
        platform: 'tiktok',
        goal: ['FYP', 'Penjualan', 'Viral'],
        role: 'Kamu adalah affiliate marketer yang menulis review produk yang jujur dan persuasif.',
        targetAudience: 'Pembeli online yang cari review singkat sebelum beli.',
        tone: 'Jujur, relatable, persuasif ringan',
        languageRules: 'Bahasa Indonesia santai, kalimat pendek.',
        emotionTrigger: ['Penasaran', 'Ingin beli'],
        structure: 'Hook → Review singkat → Kelebihan/Kekurangan → Rekomendasi → CTA',
        hookStyle: 'Pertanyaan atau pernyataan mengejutkan',
        hashtagCount: 10,
        ctaMain: 'Cek link di bio',
        ctaAffiliate: 'Link di bio',
        ctaEngagement: ['Save', 'Share', 'Comment'],
        maxWords: 100,
        variationCount: 3
      }),
      AffiliateTutorial: getDefaultPreset({
        label: 'Affiliate Tutorial',
        platform: 'youtube',
        goal: ['SEO', 'Viewer', 'Penjualan'],
        role: 'Kamu adalah pembuat tutorial yang mempromosikan produk lewat cara pakai/langkah-langkah.',
        targetAudience: 'Pemula yang cari panduan praktis.',
        tone: 'Informative, step-by-step, friendly',
        languageRules: 'Bahasa Indonesia jelas, langkah numerik.',
        emotionTrigger: ['Termotivasi', 'Penasaran'],
        structure: 'Hook → Masalah → Langkah 1–3 → Hasil → CTA',
        hookStyle: 'Janji solusi',
        hashtagCount: 8,
        ctaMain: 'Klik link di deskripsi',
        ctaAffiliate: 'Klik link di deskripsi',
        ctaEngagement: ['Save', 'Subscribe'],
        maxWords: 120,
        variationCount: 3
      })
    }
    return t[name] ? Object.assign(getDefaultPreset(), t[name]) : null
  }

  /** Show delete confirmation dialog. Returns Promise<boolean>: true if user confirmed delete. */
  function showDeleteConfirm(presetName){
    return new Promise(resolve => {
      const overlay = document.createElement('div')
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;font-family:Arial,sans-serif'
      
      const dialog = document.createElement('div')
      dialog.style.cssText = 'background:white;padding:24px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.4);max-width:420px;width:90%;text-align:center'
      
      dialog.innerHTML = `
        <div style="font-size:32px;margin-bottom:12px">⚠️</div>
        <h3 style="margin:0 0 16px 0;color:#222;font-size:18px">Konfirmasi Hapus Preset</h3>
        <p style="margin:0 0 12px 0;color:#666;font-size:14px;line-height:1.5">
          Apakah Anda yakin ingin menghapus preset:<br>
          <strong style="color:#222">"${presetName}"</strong>
        </p>
        <p style="margin:12px 0 20px 0;color:#ff4757;font-size:12px;font-weight:bold">
          ⚠️ Tindakan ini TIDAK bisa dibatalkan
        </p>
        <div style="display:flex;gap:12px;justify-content:center">
          <button id="btnCancel" style="flex:1;padding:10px 16px;border:1px solid #ddd;background:white;color:#333;cursor:pointer;border-radius:4px;font-weight:bold;transition:all 0.2s">❌ Batal</button>
          <button id="btnDelete" style="flex:1;padding:10px 16px;border:none;background:#ff4757;color:white;cursor:pointer;border-radius:4px;font-weight:bold;transition:all 0.2s">✓ Hapus</button>
        </div>
      `
      
      overlay.appendChild(dialog)
      document.body.appendChild(overlay)
      
      const cleanup = () => {
        try { overlay.remove() } catch (e) {}
      }
      
      const btnCancel = dialog.querySelector('#btnCancel')
      const btnDelete = dialog.querySelector('#btnDelete')
      
      btnCancel.onmouseover = () => btnCancel.style.background = '#f5f5f5'
      btnCancel.onmouseout = () => btnCancel.style.background = 'white'
      btnDelete.onmouseover = () => btnDelete.style.background = '#ff3838'
      btnDelete.onmouseout = () => btnDelete.style.background = '#ff4757'
      
      btnCancel.onclick = () => {
        cleanup()
        resolve(false)
      }
      
      btnDelete.onclick = () => {
        cleanup()
        resolve(true)
      }
      
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          cleanup()
          resolve(false)
        }
      }
      
      // Focus cancel button for safety
      btnCancel.focus()
    })
  }

  /** Delete preset dengan confirmation dialog. Returns Promise<boolean>. */
  function deleteWithConfirm(key){
    const preset = get(key)
    const presetName = preset && preset.label ? preset.label : key
    return showDeleteConfirm(presetName).then(confirmed => {
      if (confirmed) {
        remove(key)
      }
      return confirmed
    })
  }

  window.PresetsManager = {
    load, save, saveLocal, list, get, upsert, remove, deleteWithConfirm, showDeleteConfirm, syncFromBackend, getBackendURL,
    exportBackup, importBackup,
    getDefaultPreset, buildPresetInstructions, getTemplatePreset,
    // helpers
    migrateLegacyPresets, getStorage
  }

  // Jalankan migrasi otomatis sekali saat skrip dimuat (aman):
  try{
    const migrated = migrateLegacyPresets()
    if(migrated){
      console.info('[presets] migration result:', migrated)
    }
  }catch(e){ console.warn('[presets] automatic migration failed', e) }

})()
