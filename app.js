// Fallback stubs for offline use
const languagesStub = [
  { code: 'eng', name: 'English' }, 
  { code: 'fra', name: 'French' }, 
  { code: 'spa', name: 'Spanish' }, 
  { code: 'deu', name: 'German' }, 
  { code: 'por', name: 'Portuguese' }, 
  { code: 'ita', name: 'Italian' }, 
  { code: 'zho', name: 'Chinese' }, 
  { code: 'jpn', name: 'Japanese' }, 
  { code: 'rus', name: 'Russian' }, 
  { code: 'ara', name: 'Arabic' }
];

const countriesStub = [
  { code: 'USA', name: 'United States' }, 
  { code: 'FRA', name: 'France' }, 
  { code: 'GBR', name: 'United Kingdom' }, 
  { code: 'DEU', name: 'Germany' }, 
  { code: 'ESP', name: 'Spain' }, 
  { code: 'ITA', name: 'Italy' }, 
  { code: 'BRA', name: 'Brazil' }, 
  { code: 'CAN', name: 'Canada' }, 
  { code: 'JPN', name: 'Japan' }, 
  { code: 'AUS', name: 'Australia' }
];

// Cache helpers
const TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

function getCache(key) {
  try { 
    const x = JSON.parse(localStorage.getItem(key)); 
    if (!x) return null;
    if (Date.now() - x.ts > TTL) return null; 
    return x.data; 
  } catch { 
    return null; 
  }
}

function setCache(key, data) {
  localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
}

// Fetch countries
async function fetchCountries() {
  const cached = getCache('countries.v1');
  if (cached) return cached;
  
  try {
    const res = await fetch('https://restcountries.com/v3.1/all?fields=name,cca3');
    const rows = await res.json();
    const data = rows
      .filter(r => r?.cca3 && r?.name?.common)
      .map(r => ({ code: r.cca3.toUpperCase(), name: r.name.common }))
      .sort((a,b) => a.name.localeCompare(b.name));
    setCache('countries.v1', data);
    return data;
  } catch {
    return countriesStub;
  }
}

// Fetch languages
async function fetchLanguages() {
  const cached = getCache('languages.v1');
  if (cached) return cached;
  
  try {
    const res = await fetch('https://restcountries.com/v3.1/all?fields=languages');
    const rows = await res.json();
    const map = new Map();
    for (const r of rows) {
      const langs = r?.languages || {};
      for (const [code, name] of Object.entries(langs)) {
        const c = (code || '').toLowerCase();
        if (!/^[a-z]{3}$/.test(c)) continue;
        if (!map.has(c)) map.set(c, name);
      }
    }
    const data = Array.from(map, ([code, name]) => ({ code, name }))
      .sort((a,b) => a.name.localeCompare(b.name));
    setCache('languages.v1', data);
    return data;
  } catch {
    return languagesStub;
  }
}

// Normalizers
const clean = s => (s || '').trim().replace(/\s+/g, ' ');
const normLang = s => { const x = (s||'').trim().toLowerCase(); return /^[a-z]{3}$/.test(x) ? x : ''; };
const normCountry = s => { const x = (s||'').trim().toUpperCase(); return /^[A-Z]{3}$/.test(x) ? x : ''; };
const yyyymmdd = d => (d || '').replace(/-/g, '');

// Composer
function composeName({ name, lang, country, event, includeDate, date }) {
  const tokens = [];
  const n = clean(name);
  if (n) tokens.push(n);
  
  const loc = [normLang(lang), normCountry(country)].filter(Boolean).join('-');
  if (loc) tokens.push(loc);
  
  const ev = clean(event);
  if (ev) tokens.push(ev);
  
  const dt = includeDate ? yyyymmdd(date) : '';
  if (dt) tokens.push(dt);
  
  return tokens.join(' - ');
}

// Alpine.js app
document.addEventListener('alpine:init', () => {
  Alpine.data('folderNameGenerator', () => ({
    // Form inputs
    courseName: '',
    langInput: '',
    countryInput: '',
    eventInput: '',
    includeDate: false,
    dateInput: '',
    
    // Data sources
    langs: [],
    countries: [],
    
    // UI state
    langOpen: false,
    langActiveIdx: -1,
    langQuery: '',
    countryOpen: false,
    countryActiveIdx: -1,
    countryQuery: '',
    copied: false,
    
    // Computed properties
    get filteredLangs() {
      const query = (this.langQuery || '').toLowerCase();
      if (!query) return this.langs;
      
      return this.langs.filter(lang => 
        lang.code.includes(query) || 
        lang.name.toLowerCase().includes(query)
      );
    },
    
    get filteredCountries() {
      const query = (this.countryQuery || '').toLowerCase();
      if (!query) return this.countries;
      
      return this.countries.filter(country => 
        country.code.toLowerCase().includes(query) || 
        country.name.toLowerCase().includes(query)
      );
    },
    
    get preview() {
      return composeName({
        name: this.courseName,
        lang: this.langInput,
        country: this.countryInput,
        event: this.eventInput,
        includeDate: this.includeDate,
        date: this.dateInput
      });
    },
    
    get showAddLanguageHint() {
      return !normLang(this.langInput) && this.courseName.trim() !== '';
    },
    
    // Methods
    async init() {
      // Set up click outside listener
      document.addEventListener('click', this.handleClickOutside.bind(this));
      
      // Load datasets
      await this.loadDatasets();
      
      // Restore state from localStorage
      this.restoreState();
      
      // Set default date to current date
      if (!this.dateInput) {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        this.dateInput = `${year}-${month}-${day}`;
      }
    },
    
    async loadDatasets() {
      try {
        // Load languages and countries in parallel
        const [langs, countries] = await Promise.all([
          fetchLanguages(),
          fetchCountries()
        ]);
        
        this.langs = langs;
        this.countries = countries;
      } catch (error) {
        console.error('Error loading datasets:', error);
        // Fall back to stubs
        this.langs = languagesStub;
        this.countries = countriesStub;
      }
    },
    
    saveState() {
      const state = {
        courseName: this.courseName,
        langInput: this.langInput,
        countryInput: this.countryInput,
        eventInput: this.eventInput,
        includeDate: this.includeDate,
        dateInput: this.dateInput
      };
      
      localStorage.setItem('folderNameState', JSON.stringify(state));
    },
    
    restoreState() {
      try {
        const state = JSON.parse(localStorage.getItem('folderNameState'));
        if (!state) return;
        
        this.courseName = state.courseName || '';
        this.langInput = state.langInput || '';
        this.countryInput = state.countryInput || '';
        this.eventInput = state.eventInput || '';
        this.includeDate = state.includeDate || false;
        this.dateInput = state.dateInput || '';
      } catch (error) {
        console.error('Error restoring state:', error);
      }
    },
    
    handleClickOutside(event) {
      if (this.langOpen && !event.target.closest('#langInput')) {
        this.langOpen = false;
      }
      if (this.countryOpen && !event.target.closest('#countryInput')) {
        this.countryOpen = false;
      }
    },
    
    handleLangKeydown(event) {
      if (!this.langOpen) {
        if (event.key === 'ArrowDown') {
          this.langOpen = true;
          event.preventDefault();
        }
        return;
      }
      
      const options = this.filteredLangs;
      
      switch (event.key) {
        case 'ArrowDown':
          this.langActiveIdx = Math.min(this.langActiveIdx + 1, options.length - 1);
          event.preventDefault();
          break;
        case 'ArrowUp':
          this.langActiveIdx = Math.max(this.langActiveIdx - 1, 0);
          event.preventDefault();
          break;
        case 'Enter':
          if (this.langActiveIdx >= 0 && options[this.langActiveIdx]) {
            this.selectLang(options[this.langActiveIdx]);
          }
          event.preventDefault();
          break;
        case 'Escape':
          this.langOpen = false;
          event.preventDefault();
          break;
        case 'Tab':
          if (this.langActiveIdx >= 0 && options[this.langActiveIdx]) {
            this.selectLang(options[this.langActiveIdx]);
          }
          this.langOpen = false;
          break;
      }
    },
    
    handleCountryKeydown(event) {
      if (!this.countryOpen) {
        if (event.key === 'ArrowDown') {
          this.countryOpen = true;
          event.preventDefault();
        }
        return;
      }
      
      const options = this.filteredCountries;
      
      switch (event.key) {
        case 'ArrowDown':
          this.countryActiveIdx = Math.min(this.countryActiveIdx + 1, options.length - 1);
          event.preventDefault();
          break;
        case 'ArrowUp':
          this.countryActiveIdx = Math.max(this.countryActiveIdx - 1, 0);
          event.preventDefault();
          break;
        case 'Enter':
          if (this.countryActiveIdx >= 0 && options[this.countryActiveIdx]) {
            this.selectCountry(options[this.countryActiveIdx]);
          }
          event.preventDefault();
          break;
        case 'Escape':
          this.countryOpen = false;
          event.preventDefault();
          break;
        case 'Tab':
          if (this.countryActiveIdx >= 0 && options[this.countryActiveIdx]) {
            this.selectCountry(options[this.countryActiveIdx]);
          }
          this.countryOpen = false;
          break;
      }
    },
    
    selectLang(lang) {
      this.langInput = lang.code;
      this.langOpen = false;
      this.saveState();
    },
    
    selectCountry(country) {
      this.countryInput = country.code;
      this.countryOpen = false;
      this.saveState();
    },
    
    async copyToClipboard() {
      try {
        await navigator.clipboard.writeText(this.preview);
        this.copied = true;
        setTimeout(() => {
          this.copied = false;
        }, 2000);
      } catch (error) {
        console.error('Failed to copy:', error);
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = this.preview;
        textarea.style.position = 'fixed';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        
        try {
          document.execCommand('copy');
          this.copied = true;
          setTimeout(() => {
            this.copied = false;
          }, 2000);
        } catch (err) {
          console.error('Fallback copy failed:', err);
          alert('Failed to copy to clipboard');
        }
        
        document.body.removeChild(textarea);
      }
    }
  }));
});