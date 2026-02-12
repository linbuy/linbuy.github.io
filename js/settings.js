// ================================
// settings.js - Control Panel (FINAL)
// ================================

window.SettingsUI = {
  init() {
    const providerSelect = document.getElementById("ai-provider")
    const apiKeyInput = document.getElementById("ai-api-key")
    const tmdbInput = document.getElementById("tmdb-api-key")
    const tmdbToggleBtn = document.getElementById("toggle-tmdb-key")
    const tmdbTestBtn = document.getElementById("test-tmdb")
    const tmdbSaveBtn = document.getElementById("save-tmdb")
    const tmdbStatusBox = document.getElementById("tmdb-status")
    const toggleBtn = document.getElementById("toggle-api-key")
    const saveBtn = document.getElementById("save-settings")
    const testBtn = document.getElementById("test-settings")
    const statusBox = document.getElementById("settings-status")
    const rememberCheckbox = document.getElementById("remember-keys")
    const forgetBtn = document.getElementById("forget-keys")

    if (!providerSelect || !apiKeyInput) return

    // -------- load settings --------
    const raw = localStorage.getItem("ai-settings")
    const settings = raw
      ? JSON.parse(raw)
      : {
          provider: "gemini",
          keys: {
            gemini: "",
            openai: "",
            openrouter: ""
          }
        }

    // remember flag (defaults to true)
    const rememberRaw = localStorage.getItem("remember_api_keys")
    const rememberKeys = rememberRaw === null ? true : String(rememberRaw) === "true"
    if (rememberCheckbox) rememberCheckbox.checked = rememberKeys

    // populate TMDB key fallback (main.js uses separate keys)
    const tmdbKey = rememberKeys ? (localStorage.getItem("tmdb_api_key") || "") : (sessionStorage.getItem("tmdb_api_key") || "")
    if (tmdbInput) tmdbInput.value = tmdbKey

    // toggle TMDB key visibility
    if (tmdbToggleBtn && tmdbInput) {
      tmdbToggleBtn.onclick = () => {
        tmdbInput.type = tmdbInput.type === "password" ? "text" : "password"
      }
    }

    // -------- save TMDB (top panel) --------
    if (tmdbSaveBtn && tmdbInput) {
      tmdbSaveBtn.onclick = () => {
        const key = (tmdbInput.value || "").trim()
        const remember = !!(rememberCheckbox && rememberCheckbox.checked)
        localStorage.setItem("remember_api_keys", remember ? "true" : "false")

        if (remember) {
          localStorage.setItem("tmdb_api_key", key)
          sessionStorage.removeItem("tmdb_api_key")
        } else {
          sessionStorage.setItem("tmdb_api_key", key)
          localStorage.removeItem("tmdb_api_key")
        }

        const box = tmdbStatusBox || statusBox
        if (box) {
          box.textContent = "✅ TMDB key saved"
          box.className = "status success"
        }
      }
    }

    // -------- init UI --------
    providerSelect.value = settings.provider
    const savedApiKey = rememberKeys ? (localStorage.getItem("ai_api_key") || settings.keys[settings.provider] || "") : (sessionStorage.getItem("ai_api_key") || settings.keys[settings.provider] || "")
    apiKeyInput.value = savedApiKey

    // -------- provider switch --------
    providerSelect.onchange = () => {
      // save current key
      settings.keys[settings.provider] = apiKeyInput.value

      // switch provider
      settings.provider = providerSelect.value
      apiKeyInput.value = settings.keys[settings.provider] || ""
    }

    // -------- toggle eye --------
    toggleBtn.onclick = () => {
      apiKeyInput.type =
        apiKeyInput.type === "password" ? "text" : "password"
    }

    // -------- save --------
    saveBtn.onclick = () => {
      settings.keys[settings.provider] = apiKeyInput.value
      localStorage.setItem("ai-settings", JSON.stringify(settings))

      // remember preference
      const remember = !!(rememberCheckbox && rememberCheckbox.checked)
      localStorage.setItem("remember_api_keys", remember ? "true" : "false")

      // save keys either to localStorage (persistent) or sessionStorage (per-window)
      if (remember) {
        localStorage.setItem("ai_api_key", apiKeyInput.value)
        localStorage.setItem("ai_provider", providerSelect.value)
        if (tmdbInput) localStorage.setItem("tmdb_api_key", tmdbInput.value)
        // clear any session copies
        sessionStorage.removeItem("ai_api_key")
        sessionStorage.removeItem("tmdb_api_key")
      } else {
        sessionStorage.setItem("ai_api_key", apiKeyInput.value)
        sessionStorage.setItem("ai_provider", providerSelect.value)
        if (tmdbInput) sessionStorage.setItem("tmdb_api_key", tmdbInput.value)
        // remove persistent copies for safety
        localStorage.removeItem("ai_api_key")
        localStorage.removeItem("tmdb_api_key")
      }

      // expose for app
      window.AppSettings?.saveAI(settings)

      statusBox.textContent = "✅ Settings saved"
      statusBox.className = "status success"
    }

    // -------- forget keys --------
    if (forgetBtn) {
      forgetBtn.onclick = () => {
        // remove from both places
        localStorage.removeItem("ai_api_key")
        localStorage.removeItem("tmdb_api_key")
        sessionStorage.removeItem("ai_api_key")
        sessionStorage.removeItem("tmdb_api_key")
        localStorage.setItem("remember_api_keys", "false")

        // clear keys inside ai-settings as well
        try {
          const raw2 = localStorage.getItem("ai-settings")
          if (raw2) {
            const s = JSON.parse(raw2)
            if (s && s.keys) {
              Object.keys(s.keys).forEach(k => s.keys[k] = "")
              localStorage.setItem("ai-settings", JSON.stringify(s))
              window.AppSettings?.saveAI(s)
            }
          }
        } catch (e) {
          // ignore
        }

        if (tmdbInput) tmdbInput.value = ""
        apiKeyInput.value = ""
        statusBox.textContent = "✅ Keys removed from browser"
        statusBox.className = "status success"
      }
    }

    // -------- test --------
    testBtn.onclick = async () => {
      statusBox.textContent = "⏳ Testing AI..."
      statusBox.className = "status info"

      if (!window.APP_CONFIG?.backendURL) {
        statusBox.textContent = "❌ Backend URL not ready"
        statusBox.className = "status error"
        return
      }

      try {
        const headers = { "Content-Type": "application/json" }
        try{ const token = sessionStorage.getItem('auth_token'); if(token) headers['Authorization'] = 'Bearer ' + token }catch(e){}

        const res = await fetch(
          `${window.APP_CONFIG.backendURL}/ai/summarize`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              provider: settings.provider,
              apiKey: apiKeyInput.value,
              prompt: "Reply OK"
            })
          }
        )

        if (res.status === 401) { window.location.href = 'login.html'; return }

        const data = await res.json()
        if (data.error) throw new Error(data.error)

        statusBox.textContent = "✅ AI connected"
        statusBox.className = "status success"
      } catch (err) {
        statusBox.textContent = "❌ " + (err?.message || err)
        statusBox.className = "status error"
      }
    }

    // -------- test TMDB --------
    if (tmdbTestBtn && tmdbInput) {
      tmdbTestBtn.onclick = async () => {
        const key = (tmdbInput.value || "").trim()
        if (!key) {
          const box = tmdbStatusBox || statusBox
          box.textContent = "❌ TMDB key empty"
          box.className = "status error"
          return
        }
        const box = tmdbStatusBox || statusBox
        box.textContent = "⏳ Testing TMDB..."
        box.className = "status info"
        try {
          const res = await fetch(
            `https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(
              key
            )}`
          )
          if (!res.ok) throw new Error(`TMDB test failed (${res.status})`)
          box.textContent = "✅ TMDB connected"
          box.className = "status success"
        } catch (err) {
          box.textContent = "❌ " + (err?.message || err)
          box.className = "status error"
        }
      }
    }
  }
}