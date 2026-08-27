const STORAGE_KEY = 'arca_auth';

export function getStoredAuth() {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredAuth(user, password) {
  const encoded = btoa(`${user}:${password}`);
  try {
    sessionStorage.setItem(STORAGE_KEY, encoded);
  } catch {
    // sessionStorage no disponible (ventana privada, etc.) — seguimos igual, solo
    // no persiste entre refrescos.
  }
  return encoded;
}

export function clearStoredAuth() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

export function getAuthHeader() {
  const encoded = getStoredAuth();
  return encoded ? { Authorization: `Basic ${encoded}` } : {};
}
