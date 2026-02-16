import { hasCategoryConsent } from './cookie-consent';

export function canLoadCookieCategory(categoryId) {
  return hasCategoryConsent(categoryId);
}

export function loadScriptWithConsent(categoryId, loadScript, unloadScript) {
  if (canLoadCookieCategory(categoryId)) {
    loadScript();
  }

  if (typeof window !== 'undefined') {
    const handleConsentChange = () => {
      if (canLoadCookieCategory(categoryId)) {
        loadScript();
      } else if (unloadScript) {
        unloadScript();
      }
    };
    window.addEventListener('cookieConsentUpdated', handleConsentChange);
    return () => window.removeEventListener('cookieConsentUpdated', handleConsentChange);
  }
}
