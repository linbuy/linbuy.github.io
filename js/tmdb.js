// ================================
// tmdb.js - Minimal TMDB client
// ================================

window.TMDB = {
  apiKey: "",
  base: "https://api.themoviedb.org/3",
  // details cache: { '<media>:<id>': { data, ts } }
  detailsCache: new Map(),

  init({ apiKey }) {
    this.apiKey = apiKey || ""
    console.log("🎞️ TMDB init. key set:", !!this.apiKey)
  },

  async discover({ media = "movie", page = 1, sortBy = "popularity.desc" } = {}) {
    const url = `${this.base}/discover/${media}?api_key=${this.apiKey}&page=${page}&sort_by=${encodeURIComponent(
      sortBy
    )}`
    const res = await fetch(url)
    if (!res.ok) throw new Error("TMDB discover failed")
    return res.json()
  },

  async search({ media = 'movie', query = '', page = 1 } = {}) {
    if (!query) return { results: [], total_pages: 0 }
    const url = `${this.base}/search/${media}?api_key=${this.apiKey}&query=${encodeURIComponent(query)}&page=${page}`
    const res = await fetch(url)
    if (!res.ok) throw new Error('TMDB search failed')
    return res.json()
  },

  async getDetails(media = "movie", id) {
    if (!id) throw new Error("Missing id")
    const key = `${media}:${id}`
    const cached = this.detailsCache.get(key)
    const TTL = 1000 * 60 * 60 * 24 // 24 hours
    if (cached && (Date.now() - cached.ts) < TTL) {
      return cached.data
    }

    const url = `${this.base}/${media}/${id}?api_key=${this.apiKey}&append_to_response=credits,videos,images,keywords`
    const res = await fetch(url)
    if (!res.ok) throw new Error("TMDB details failed")
    const data = await res.json()
    try { this.detailsCache.set(key, { data, ts: Date.now() }) } catch (e) { /* ignore cache errors */ }
    return data
  },

  imageUrl(path, size = "w500") {
    if (!path) return ""
    return `https://image.tmdb.org/t/p/${size}${path}`
  }
}
// NOTE: AI summary for modal will be generated on demand from `main.js` when modal opens.