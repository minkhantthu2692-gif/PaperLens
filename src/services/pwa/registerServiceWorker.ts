export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }
  if (!import.meta.env.PROD) {
    return;
  }

  const baseUrl = import.meta.env.BASE_URL;
  const serviceWorkerUrl = `${baseUrl}sw.js`;

  const register = () => {
    void navigator.serviceWorker
      .register(serviceWorkerUrl, { scope: baseUrl, updateViaCache: 'none' })
      .catch(() => {
        // The app still works without an installed service worker.
      });
  };

  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}
