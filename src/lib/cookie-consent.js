const CONSENT_STORAGE_KEY = 'licentra_cookie_consent';
const CONSENT_VERSION = '2.0';
const CONSENT_EXPIRY_MONTHS = 12;

export const COOKIE_CATEGORIES = {
  necessary: {
    id: 'necessary',
    name: 'strictly necessary cookies',
    description: 'needed for the site to work. they handle login, security and your settings. you cannot turn these off.',
    required: true,
  },
  analytics: {
    id: 'analytics',
    name: 'analytics and performance cookies',
    description: 'help us see how people use the site so we can improve it. the data is anonymous. if you turn these off we will not know when you visited.',
    required: false,
  },
  marketing: {
    id: 'marketing',
    name: 'marketing and advertising cookies',
    description: 'used by our ad partners to show you relevant ads on other sites. they use your browser, not your name. if you turn these off you will see less targeted ads.',
    required: false,
  },
};

// get current consent preferences
export function getCookieConsent() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored);

    if (parsed.version !== CONSENT_VERSION) {
      if (parsed.preferences && parsed.preferences.functional !== undefined) {
        const { functional, ...migratedPreferences } = parsed.preferences;
        migratedPreferences.necessary = true;
        const migratedData = {
          version: CONSENT_VERSION,
          preferences: migratedPreferences,
          timestamp: parsed.timestamp || new Date().toISOString(),
        };
        localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(migratedData));
        return migratedPreferences;
      }
      return null;
    }

    if (parsed.timestamp) {
      const consentDate = new Date(parsed.timestamp);
      const expiryDate = new Date(consentDate);
      expiryDate.setMonth(expiryDate.getMonth() + CONSENT_EXPIRY_MONTHS);
      if (new Date() > expiryDate) {
        localStorage.removeItem(CONSENT_STORAGE_KEY);
        return null;
      }
    }

    return parsed.preferences;
  } catch (error) {
    console.error('error reading cookie consent:', error);
    return null;
  }
}

export function hasCookieConsent() {
  const consent = getCookieConsent();
  return consent !== null && consent !== undefined;
}

export function getCookieConsentData() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored);

    if (parsed.version !== CONSENT_VERSION) {
      if (parsed.preferences && parsed.preferences.functional !== undefined) {
        const { functional, ...migratedPreferences } = parsed.preferences;
        migratedPreferences.necessary = true;
        const migratedData = {
          version: CONSENT_VERSION,
          preferences: migratedPreferences,
          timestamp: parsed.timestamp || new Date().toISOString(),
        };
        localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(migratedData));
        if (migratedData.timestamp) {
          const consentDate = new Date(migratedData.timestamp);
          const expiryDate = new Date(consentDate);
          expiryDate.setMonth(expiryDate.getMonth() + CONSENT_EXPIRY_MONTHS);
          
          if (new Date() > expiryDate) {
            localStorage.removeItem(CONSENT_STORAGE_KEY);
            return null;
          }
          
          return {
            preferences: migratedPreferences,
            timestamp: migratedData.timestamp,
            expiryDate: expiryDate.toISOString(),
          };
        }
        
        return {
          preferences: migratedPreferences,
          timestamp: migratedData.timestamp,
          expiryDate: null,
        };
      }
      return null;
    }

    if (parsed.timestamp) {
      const consentDate = new Date(parsed.timestamp);
      const expiryDate = new Date(consentDate);
      expiryDate.setMonth(expiryDate.getMonth() + CONSENT_EXPIRY_MONTHS);
      
      if (new Date() > expiryDate) {
        localStorage.removeItem(CONSENT_STORAGE_KEY);
        return null;
      }

      return {
        preferences: parsed.preferences,
        timestamp: parsed.timestamp,
        expiryDate: expiryDate.toISOString(),
      };
    }

    return {
      preferences: parsed.preferences,
      timestamp: parsed.timestamp,
      expiryDate: null,
    };
  } catch (error) {
    console.error('error reading cookie consent data:', error);
    return null;
  }
}

export function hasCategoryConsent(categoryId) {
  const consent = getCookieConsent();
  if (!consent) return false;
  if (categoryId === 'necessary') {
    return true;
  }

  return consent[categoryId] === true;
}

export function saveCookieConsent(preferences) {
  if (typeof window === 'undefined') return false;

  try {
    const consent = { ...preferences, necessary: true };
    const data = {
      version: CONSENT_VERSION,
      preferences: consent,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('cookieConsentUpdated', { detail: consent }));
    return true;
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded');
      try {
        localStorage.removeItem(CONSENT_STORAGE_KEY);
        localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(data));
        window.dispatchEvent(new CustomEvent('cookieConsentUpdated', { detail: consent }));
        return true;
      } catch (retryError) {
        console.error('cookie consent save failed:', retryError);
        return false;
      }
    }
    console.error('error saving cookie consent:', error);
    return false;
  }
}

export function acceptAllCookies() {
  const allAccepted = Object.keys(COOKIE_CATEGORIES).reduce((acc, key) => {
    acc[key] = true;
    return acc;
  }, {});
  
  saveCookieConsent(allAccepted);
}

export function rejectAllCookies() {
  const onlyRequired = Object.keys(COOKIE_CATEGORIES).reduce((acc, key) => {
    acc[key] = COOKIE_CATEGORIES[key].required || false;
    return acc;
  }, {});
  
  saveCookieConsent(onlyRequired);
}

export function resetCookieConsent() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('cookieConsentUpdated', { detail: null }));
  } catch (error) {
    console.error('error resetting cookie consent:', error);
  }
}
