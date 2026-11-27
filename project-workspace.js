import { createProject, PROJECT_FILE_MAX_BYTES } from './project-format.js';
import { ProjectConflictError } from './project-store.js';

const SAVE_DELAY_MS = 1200;

export function mountProjectWorkspace(root, { store, capture, verify, prepare, apply, canCapture, download }) {
  const query = (name) => root.querySelector(`[data-project="${name}"]`);
  const name = query('name');
  const select = query('list');
  const summary = query('summary');
  const status = query('status');
  const feedback = query('feedback');
  const saveButton = query('save');
  const fileInput = query('file');
  let current = null;
  let draftMetadata = null;
  let dirty = false;
  let generation = 0;
  let busy = false;
  let saving = false;
  let failed = '';
  let conflict = false;
  let timer;
  const recentKey = 'bonkproof-open-project';
  const selectedRecord = () => select.selectedOptions[0]?.dataset.revision ? select.selectedOptions[0] : null;

  function render() {
    const state = saving ? 'Speicherung läuft …' : failed ? 'Speicherung fehlgeschlagen'
      : dirty ? 'Ungespeicherte Änderungen' : current ? 'Gespeichert' : 'Neues Projekt';
    if (summary.textContent !== state) summary.textContent = state;
    const detail = failed || (dirty && !canCapture() ? 'Wartet auf die Planungsdaten oder auf das Ende der laufenden POI-Suche.' : '');
    if (status.textContent !== detail) status.textContent = detail;
    if (dirty || saving) window.addEventListener('beforeunload', warnBeforeUnload);
    else window.removeEventListener('beforeunload', warnBeforeUnload);
    saveButton.disabled = busy || !canCapture();
    query('duplicate').disabled = busy || !canCapture();
    query('export').disabled = busy || !canCapture();
    query('new').disabled = busy;
    query('open').disabled = busy || !selectedRecord();
    query('delete').disabled = busy || !selectedRecord();
    query('import').disabled = busy;
  }

  function schedule() {
    clearTimeout(timer);
    if (current && dirty && !busy && !failed && canCapture()) {
      timer = setTimeout(() => { if (!busy && canCapture() && dirty) void save(); }, SAVE_DELAY_MS);
    }
    render();
  }

  function changed() {
    dirty = true;
    generation += 1;
    if (!conflict) failed = '';
    schedule();
  }

  function remember(id) {
    try {
      if (id) sessionStorage.setItem(recentKey, id);
      else sessionStorage.removeItem(recentKey);
    } catch {
      // A restricted storage environment can still use explicit Open.
    }
  }

  async function refreshList() {
    const previous = select.value;
    const records = await store.list();
    query('available').textContent = records.length === 1 ? 'Ein gespeichertes Projekt verfügbar.'
      : records.length ? `${records.length} gespeicherte Projekte verfügbar.` : '';
    select.replaceChildren(new Option(records.length ? 'Projekt auswählen' : 'Keine gespeicherten Projekte', ''));
    records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    for (const item of records) {
      const option = new Option(item.name, item.id);
      option.dataset.revision = item.revision;
      select.append(option);
    }
    select.value = previous || current?.project.id || '';
    if (select.selectedIndex < 0) select.selectedIndex = 0;
  }

  function activate(record, prepared) {
    current = record ? projectReference(record.project, record.revision) : null;
    draftMetadata = null;
    dirty = false;
    generation += 1;
    failed = '';
    conflict = false;
    name.value = record?.project.name ?? 'Neues Projekt';
    apply(prepared);
    select.value = record?.project.id ?? '';
    remember(record?.project.id);
  }

  function mayReplace() {
    return !dirty || window.confirm('Ungespeicherte Änderungen an der aktuellen Planung verwerfen?');
  }

  async function operation(work, { write = false, saveOperation = false } = {}) {
    if (busy) return;
    busy = true;
    saving = write;
    feedback.textContent = '';
    schedule();
    try {
      await work();
    } catch (error) {
      let message = error?.message || 'Der lokale Projektspeicher konnte den Vorgang nicht abschließen.';
      if (error?.name === 'QuotaExceededError') message = 'Der lokale Speicher ist voll. Die Planung bleibt geöffnet und kann als Projektdatei exportiert werden.';
      if (error?.name === 'SecurityError') message = 'Der Browser verweigert den Zugriff auf den lokalen Projektspeicher. Die Planung kann als Projektdatei exportiert werden.';
      if (saveOperation) {
        failed = message;
        conflict = error instanceof ProjectConflictError;
      } else feedback.textContent = message;
    } finally {
      busy = false;
      saving = false;
      schedule();
    }
  }

  function projectReference({ id, createdAt }, revision) {
    return { project: { id, createdAt }, revision };
  }

  function snapshot(copyName) {
    const project = createProject(copyName ?? name.value, capture(), copyName
      ? undefined : current?.project ?? draftMetadata);
    if (!copyName && !draftMetadata && !current) draftMetadata = { id: project.id, createdAt: project.createdAt };
    return project;
  }

  async function updateList(message) {
    try {
      await refreshList();
      if (current) select.value = current.project.id;
      feedback.textContent = message;
    } catch {
      feedback.textContent = `${message} Die Projektliste konnte nicht aktualisiert werden.`;
    }
  }

  async function save() {
    if (!canCapture()) return;
    await operation(async () => {
      const version = generation;
      const project = snapshot();
      verify(project);
      const revision = await store.save(project, current?.revision ?? null);
      current = projectReference(project, revision);
      failed = '';
      conflict = false;
      dirty = version !== generation;
      remember(project.id);
      await updateList('');
    }, { write: true, saveOperation: true });
  }

  async function openRecord(id, initialVersion) {
    const record = await store.get(id);
    if (!record) throw new Error('Dieses Projekt ist im lokalen Speicher nicht mehr vorhanden.');
    const prepared = await prepare(record.project);
    if (initialVersion !== undefined ? generation !== initialVersion || dirty : !mayReplace()) return;
    activate(record, prepared);
  }

  query('new').addEventListener('click', () => {
    if (!busy && mayReplace()) activate(null, null);
    schedule();
  });
  saveButton.addEventListener('click', save);
  name.addEventListener('input', changed);
  select.addEventListener('change', render);
  query('open').addEventListener('click', () => operation(() => openRecord(select.value)));
  query('duplicate').addEventListener('click', () => operation(async () => {
    if (!canCapture()) return;
    const version = generation;
    const project = snapshot(`${name.value.trim().slice(0, 110) || 'Projekt'} (Kopie)`);
    verify(project);
    const revision = await store.save(project);
    if (version === generation) {
      current = projectReference(project, revision);
      draftMetadata = null;
      dirty = false;
      failed = '';
      conflict = false;
      name.value = project.name;
      remember(project.id);
    }
    await updateList('Duplikat gespeichert.');
  }, { write: true }));
  query('delete').addEventListener('click', () => operation(async () => {
    const option = selectedRecord();
    if (!option || !window.confirm(`Projekt „${option.textContent}“ lokal löschen?`)) return;
    const version = generation;
    await store.remove(option.value, option.dataset.revision);
    if (current?.project.id === option.value) {
      if (!dirty && version === generation) activate(null, null);
      else {
        current = null;
        draftMetadata = null;
        dirty = true;
        failed = '';
        conflict = false;
        remember(null);
      }
    }
    await updateList('Projekt gelöscht.');
  }, { write: true }));
  query('export').addEventListener('click', () => operation(async () => {
    if (!canCapture()) return;
    const project = snapshot();
    verify(project);
    download(project);
  }));
  query('import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    void operation(async () => {
      if (file.size > PROJECT_FILE_MAX_BYTES) throw new Error('Die Projektdatei überschreitet 128 MiB.');
      let project;
      try {
        const source = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
        project = JSON.parse(source);
      } catch {
        throw new Error('Die Projektdatei enthält kein gültiges UTF-8-JSON.');
      }
      let prepared = await prepare(project);
      if (!mayReplace()) return;
      const version = generation;
      let revision;
      try {
        revision = await store.save(project);
      } catch (error) {
        if (!(error instanceof ProjectConflictError)) throw error;
        project = createProject(`${project.name.slice(0, 110)} (Import)`, project.state);
        prepared = { ...prepared, project };
        revision = await store.save(project);
      }
      if (generation === version) activate({ project, revision }, prepared);
      await updateList('Projekt importiert.');
    }, { write: true });
  });

  function warnBeforeUnload(event) {
    event.preventDefault();
    event.returnValue = '';
  }
  void operation(async () => {
    await refreshList();
    let id;
    try { id = sessionStorage.getItem(recentKey); } catch { /* Optional per-tab convenience. */ }
    if (id) await openRecord(id, 0);
  });

  return { changed, availabilityChanged: schedule, isStored: () => Boolean(current), safeToReload: () => !dirty && !busy };
}
