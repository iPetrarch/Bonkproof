export class ProjectConflictError extends Error {
  constructor() {
    super('Das Projekt wurde in einem anderen Tab geändert oder gelöscht. Öffne den aktuellen Stand oder speichere deine Planung als Duplikat.');
    this.name = 'ProjectConflictError';
  }
}

export function createProjectStore(getIndexedDB = () => globalThis.indexedDB) {
  let connection;

  function open() {
    if (!connection) {
      const opening = new Promise((resolve, reject) => {
        const factory = getIndexedDB();
        if (!factory) throw new Error('IndexedDB ist in diesem Browser nicht verfügbar.');
        const request = factory.open('bonkproof-projects', 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('projects', { keyPath: 'id' });
          request.result.createObjectStore('metadata', { keyPath: 'id' });
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Ein anderer Tab blockiert den lokalen Projektspeicher.'));
        request.onsuccess = () => {
          const db = request.result;
          if (connection !== opening) {
            db.close();
            return;
          }
          db.onversionchange = () => {
            db.close();
            if (connection === opening) connection = undefined;
          };
          resolve(db);
        };
      });
      connection = opening;
      opening.catch(() => { if (connection === opening) connection = undefined; });
    }
    return connection;
  }

  async function run(stores, mode, work) {
    const db = await open();
    return new Promise((resolve, reject) => {
      // Prefer a durable commit where supported. Older browsers may ignore this hint.
      const options = mode === 'readwrite' ? { durability: 'strict' } : undefined;
      const transaction = db.transaction(stores, mode, options);
      let value;
      let failure;
      const result = (next) => { value = next; };
      const abort = (error) => {
        failure = error;
        transaction.abort();
      };
      transaction.oncomplete = () => resolve(value);
      transaction.onabort = () => reject(failure || transaction.error || new Error('Speichertransaktion abgebrochen.'));
      work(transaction, result, abort);
    });
  }

  function change(id, expectedRevision, apply) {
    return run(['projects', 'metadata'], 'readwrite', (transaction, result, abort) => {
      const metadata = transaction.objectStore('metadata');
      const request = metadata.get(id);
      request.onsuccess = () => {
        if ((request.result?.revision ?? null) !== expectedRevision) {
          abort(new ProjectConflictError());
          return;
        }
        try {
          result(apply(transaction.objectStore('projects'), metadata, () => abort(new ProjectConflictError())));
        } catch (error) {
          abort(error);
        }
      };
    });
  }

  return {
    list() {
      return run(['metadata'], 'readonly', (transaction, result) => {
        const request = transaction.objectStore('metadata').getAll();
        request.onsuccess = () => result(request.result);
      });
    },
    get(id) {
      return run(['projects', 'metadata'], 'readonly', (transaction, result, abort) => {
        const payload = transaction.objectStore('projects').get(id);
        const metadata = transaction.objectStore('metadata').get(id);
        metadata.onsuccess = () => {
          const record = payload.result;
          const summary = metadata.result;
          if (Boolean(record) !== Boolean(summary) || (record && (typeof record.revision !== 'string'
              || record.revision !== summary.revision || record.project?.id !== id
              || record.project.name !== summary?.name || record.project.updatedAt !== summary?.updatedAt))) {
            abort(new Error('Dieses lokale Projekt hat widersprüchliche Speicherdaten.'));
            return;
          }
          result(record ?? null);
        };
      });
    },
    save(project, expectedRevision = null) {
      return change(project.id, expectedRevision, (projects, metadata, transactionConflict) => {
        const revision = crypto.getRandomValues(new Uint32Array(4)).join('-');
        const record = { id: project.id, revision, project };
        if (expectedRevision === null) {
          const insert = projects.add(record);
          insert.onerror = (event) => {
            if (insert.error?.name !== 'ConstraintError') return;
            event.preventDefault();
            transactionConflict();
          };
        } else projects.put(record);
        metadata.put({ id: project.id, revision, name: project.name, updatedAt: project.updatedAt });
        return revision;
      });
    },
    remove(id, expectedRevision) {
      return change(id, expectedRevision, (projects, metadata) => {
        projects.delete(id);
        metadata.delete(id);
      });
    },
  };
}
