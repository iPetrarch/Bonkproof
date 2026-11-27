function ask(worker, message, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (result) => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(result);
    };
    const timeout = setTimeout(() => finish(null), timeoutMs);
    channel.port1.onmessage = (event) => finish(event.data);
    try { worker.postMessage(message, [channel.port2]); } catch { finish(null); }
  });
}

export function mountPwa({ canUpdate }) {
  const status = document.getElementById('pwa-cache-status');
  const preparation = document.getElementById('pwa-prepare');
  const hint = document.getElementById('pwa-action-status');
  const update = document.getElementById('pwa-update');
  const install = document.getElementById('pwa-install');
  const persist = document.getElementById('pwa-persist');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const workers = navigator.serviceWorker;
  let registration;
  let requested = false;
  let reloadAvailable = false;
  let installPrompt;
  let refreshVersion = 0;

  if (standalone) document.getElementById('pwa-install-help').hidden = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    install.hidden = false;
  });
  install.addEventListener('click', async () => {
    const prompt = installPrompt;
    if (!prompt) return;
    installPrompt = null;
    install.hidden = true;
    try { await prompt.prompt(); } catch {
      hint.textContent = 'Die Installation ist über das Browser-Menü möglich.';
    }
  });
  window.addEventListener('appinstalled', () => { install.hidden = true; });

  if (typeof navigator.storage?.persist === 'function') {
    persist.hidden = false;
    persist.addEventListener('click', async () => {
      try {
        const granted = await navigator.storage.persist();
        hint.textContent = granted
          ? 'Dauerhafter Speicher gewährt. Exportierte Projektdateien bleiben als Backup wichtig.'
          : 'Der Browser hat dauerhaften Speicher nicht gewährt. Lokale Projekte können weiter genutzt und exportiert werden.';
      } catch {
        hint.textContent = 'Dauerhafter Speicher konnte nicht angefragt werden. Projektdateien lassen sich weiterhin exportieren.';
      }
    });
  }

  async function refresh() {
    const version = ++refreshVersion;
    update.hidden = !registration?.waiting && !reloadAvailable;
    const active = workers?.controller ?? registration?.active;
    if (!active) {
      status.textContent = 'Offline-Anwendung noch nicht vollständig vorbereitet';
      preparation.hidden = !workers || Boolean(registration?.installing);
      return;
    }
    const result = await ask(active, 'CHECK_SHELL');
    if (version !== refreshVersion || (workers?.controller ?? registration?.active) !== active) return;
    status.textContent = result?.ready ? 'Offline-Anwendung verfügbar' : 'Offline-Anwendung noch nicht vollständig vorbereitet';
    preparation.hidden = Boolean(result?.ready);
  }

  function observe(worker) {
    worker?.addEventListener('statechange', () => { void refresh(); });
  }

  async function register() {
    if (!workers) {
      status.textContent = 'Offline-Anwendung in diesem Browser oder auf dieser Adresse nicht verfügbar';
      return;
    }
    try {
      registration = await workers.register(new URL('./sw.js', import.meta.url), { updateViaCache: 'none' });
      observe(registration.installing);
      registration.addEventListener('updatefound', () => {
        observe(registration.installing);
        void refresh();
      });
      await refresh();
    } catch {
      status.textContent = 'Offline-Anwendung konnte nicht vorbereitet werden';
      preparation.hidden = false;
    }
  }

  preparation.addEventListener('click', async () => {
    if (navigator.onLine === false) {
      hint.textContent = 'Zur Vorbereitung werden die Anwendungsdateien einmal online benötigt.';
      return;
    }
    preparation.disabled = true;
    try {
      if (!registration || !registration.active && !registration.installing && !registration.waiting) await register();
      const active = workers?.controller ?? registration?.active;
      if (active) {
        const result = await ask(active, 'PREPARE_SHELL', 60000);
        if (!result?.ready) hint.textContent = 'Die Offline-Vorbereitung war nicht vollständig. Bitte später erneut versuchen.';
      }
      await refresh();
    } catch {
      hint.textContent = 'Die Anwendung konnte nicht vollständig geladen werden. Bitte später erneut versuchen.';
    } finally {
      preparation.disabled = false;
    }
  });

  update.addEventListener('click', async () => {
    if (!canUpdate()) {
      hint.textContent = 'Speichere die Planung und schließe laufende Suchvorgänge ab, bevor du aktualisierst.';
      return;
    }
    if (reloadAvailable) {
      location.reload();
      return;
    }
    if (!registration?.waiting) return;
    requested = true;
    update.disabled = true;
    hint.textContent = 'Anwendungsupdate wird aktiviert …';
    const result = await ask(registration.waiting, 'ACTIVATE_UPDATE');
    if (!result?.accepted) {
      requested = false;
      hint.textContent = result?.blocked
        ? 'Schließe die anderen geöffneten Bonkproof-Fenster und versuche es erneut.'
        : 'Das Update konnte noch nicht aktiviert werden. Bitte erneut versuchen.';
    }
    update.disabled = false;
    void refresh();
  });

  workers?.addEventListener('controllerchange', () => {
    if (requested) {
      requested = false;
      if (canUpdate()) {
        location.reload();
        return;
      }
      reloadAvailable = true;
      update.textContent = 'Neue Version laden';
      hint.textContent = 'Speichere die aktuelle Planung und lade anschließend die neue Version.';
    }
    void refresh();
  });
  window.addEventListener('offline', () => { if (registration) void refresh(); });
  window.addEventListener('pageshow', () => { if (registration) void refresh(); });
  void register();
}
