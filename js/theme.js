/* ========================================
   THEME MANAGER - JavaScript Theme Toggle
   theme.js - Handle light/dark mode switching
   ======================================== */

window.ThemeManager = {
  // Initialize theme on page load
  init() {
    this.loadTheme();
    this.setupToggle();
    
    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        this.setTheme(e.matches ? 'dark' : 'light');
      }
    });

    console.debug('[Theme] Initialized');
  },

  // Load theme from localStorage or system preference
  loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    
    let theme;
    if (savedTheme) {
      // Use saved preference
      theme = savedTheme;
    } else {
      // Detect system preference
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    this.setTheme(theme, false); // false = don't save (already saved or system pref)
  },

  // Set theme and apply to document
  setTheme(theme, save = true) {
    // Validate theme
    if (theme !== 'light' && theme !== 'dark') {
      console.warn(`[Theme] Invalid theme: ${theme}, defaulting to 'light'`);
      theme = 'light';
    }

    // Apply theme to document
    document.documentElement.setAttribute('data-theme', theme);
    
    // Update meta theme-color for mobile browsers
    this.updateMetaThemeColor(theme);

    // Save to localStorage if requested
    if (save) {
      localStorage.setItem('theme', theme);
    }

    console.debug(`[Theme] Set to: ${theme}`);
  },

  // Update mobile browser theme color (address bar, etc)
  updateMetaThemeColor(theme) {
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta');
      metaThemeColor.name = 'theme-color';
      document.head.appendChild(metaThemeColor);
    }

    // Set color based on theme
    if (theme === 'dark') {
      metaThemeColor.content = '#1a202c'; // Dark mode background
    } else {
      metaThemeColor.content = '#ffffff'; // Light mode background
    }
  },

  // Setup theme toggle buttons
  setupToggle() {
    const mainToggleBtn = document.getElementById('themeToggle');
    const settingsToggleBtn = document.getElementById('settingsThemeToggle');
    
    // Main toggle button (if exists)
    if (mainToggleBtn) {
      mainToggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggle();
      });
    }

    // Settings toggle button (if exists - added dynamically)
    if (settingsToggleBtn) {
      settingsToggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggle();
      });
    }

    // Set initial button icons
    this.updateToggleIcon();
  },

  // Toggle between light and dark
  toggle() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    this.setTheme(newTheme, true);
    this.updateToggleIcon();

    // Visual feedback
    console.info(`[Theme] Toggled to ${newTheme}`);
  },

  // Update toggle button icons (both main and settings buttons)
  updateToggleIcon() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';

    // Update main toggle button (if exists)
    const mainToggleBtn = document.getElementById('themeToggle');
    if (mainToggleBtn) {
      const sunIcon = mainToggleBtn.querySelector('.icon-sun');
      const moonIcon = mainToggleBtn.querySelector('.icon-moon');

      if (sunIcon && moonIcon) {
        if (currentTheme === 'dark') {
          sunIcon.style.display = 'inline-block';
          moonIcon.style.display = 'none';
          mainToggleBtn.setAttribute('aria-label', 'Switch to light mode');
        } else {
          sunIcon.style.display = 'none';
          moonIcon.style.display = 'inline-block';
          mainToggleBtn.setAttribute('aria-label', 'Switch to dark mode');
        }
      }
    }

    // Update settings toggle button (if exists - added dynamically)
    const settingsToggleBtn = document.getElementById('settingsThemeToggle');
    if (settingsToggleBtn) {
      const sunIcon = settingsToggleBtn.querySelector('.icon-sun-settings');
      const moonIcon = settingsToggleBtn.querySelector('.icon-moon-settings');
      const label = settingsToggleBtn.querySelector('.theme-label');

      if (sunIcon && moonIcon) {
        if (currentTheme === 'dark') {
          sunIcon.style.display = 'inline-block';
          moonIcon.style.display = 'none';
          if (label) label.textContent = 'Light';
          settingsToggleBtn.setAttribute('aria-label', 'Switch to light mode');
        } else {
          sunIcon.style.display = 'none';
          moonIcon.style.display = 'inline-block';
          if (label) label.textContent = 'Dark';
          settingsToggleBtn.setAttribute('aria-label', 'Switch to dark mode');
        }
      }
    }
  },

  // Get current theme
  getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  },

  // Reset to system preference
  resetToSystemPreference() {
    localStorage.removeItem('theme');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.setTheme(systemDark ? 'dark' : 'light', false);
  }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.ThemeManager.init();
  });
} else {
  window.ThemeManager.init();
}
