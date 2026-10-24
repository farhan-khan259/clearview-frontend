import { type User, type Entity, newId } from "@clearview/shared";
export type Row = {
  entity: Entity;
  id: string;
  data: any;
  version: number;
  updatedAt: string;
};
export type Op = {
  id: string;
  entity: Entity;
  recordId: string;
  baseVersion: number;
  data: any;
  error?: string;
  server?: Row;
};
export type Vault = {
  api: string;
  user: User;
  token: string;
  expiresAt: number;
  rows: Row[];
  outbox: Op[];
  cursor: string;
};
let key: CryptoKey | null = null;
let active: string | null = null;
let vault: Vault | null = null;
let busy = false;
let chain = Promise.resolve();
const subscribers = new Set<() => void>();
export const subscribe = (f: () => void) => {
  subscribers.add(f);
  return () => {
    subscribers.delete(f);
  };
};
const emit = () => {
  if (vault) vault = { ...vault };
  subscribers.forEach((f) => f());
};
export const getVault = () => vault;
export const isSyncing = () => busy;
export let syncError = "";
export const apiUrl = () =>
  localStorage.getItem("clearview-api") || import.meta.env.VITE_API_URL || "";
export function setApi(url: string) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(u.hostname)
  )
    throw new Error("Use HTTPS for remote API");
  localStorage.setItem("clearview-api", url.replace(/\/$/, ""));
}
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("clearview-secure", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("vaults");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function get(id: string): Promise<any> {
  const d = await database();
  return new Promise((resolve, reject) => {
    const t = d.transaction("vaults", "readonly");
    const r = t.objectStore("vaults").get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    t.oncomplete = () => d.close();
  });
}
async function put(id: string, data: any) {
  const d = await database();
  return new Promise<void>((resolve, reject) => {
    const t = d.transaction("vaults", "readwrite");
    t.objectStore("vaults").put(data, id);
    t.oncomplete = () => {
      d.close();
      resolve();
    };
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
async function derive(password: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 310000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
async function persist(next: Vault) {
  if (!key || !active) throw new Error("Vault locked");
  const old = await get(active);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(next)),
  );
  await put(active, {
    salt: old.salt,
    iv: Array.from(iv),
    bytes: Array.from(new Uint8Array(bytes)),
  });
  vault = next;
  emit();
}
export async function request(path: string, options: RequestInit = {}) {
  if (!apiUrl()) throw new Error("Configure the clinic API address first");
  const headers = {
    "Content-Type": "application/json",
    ...(vault?.token ? { Authorization: `Bearer ${vault.token}` } : {}),
  };
  const response = await fetch(apiUrl() + path, {
    ...options,
    headers: { ...headers, ...options.headers },
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(body.error || "Request failed"), {
      status: response.status,
      server: body.server,
    });
  return body;
}
let releaseLock: (() => void) | null = null;
let lockTask: Promise<unknown> | null = null;
export async function login(email: string, password: string) {
  if (!navigator.locks)
    throw new Error(
      "This browser must support secure storage locks. Use current Chrome, Edge, Firefox or Safari over HTTPS.",
    );
  await new Promise<void>((resolve, reject) => {
    lockTask = navigator.locks
      .request(
        "clearview-" + email.toLowerCase().trim(),
        { ifAvailable: true },
        async (lock) => {
          if (!lock) {
            reject(
              new Error(
                "This workspace is open in another tab. Lock or close that tab first.",
              ),
            );
            return;
          }
          resolve();
          await new Promise<void>((r) => {
            releaseLock = r;
          });
        },
      )
      .catch(reject);
  });
  try {
    await unlock(email, password);
  } catch (e) {
    releaseLock?.();
    releaseLock = null;
    await lockTask;
    throw e;
  }
}
async function unlock(email: string, password: string) {
  email = email.toLowerCase().trim();
  const stored = await get(email);
  const salt = stored
    ? new Uint8Array(stored.salt)
    : crypto.getRandomValues(new Uint8Array(16));
  const nextKey = await derive(password, salt);
  let cached: Vault | null = null;
  if (stored) {
    try {
      cached = JSON.parse(
        new TextDecoder().decode(
          await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: new Uint8Array(stored.iv) },
            nextKey,
            new Uint8Array(stored.bytes),
          ),
        ),
      );
    } catch {
      throw new Error(
        "Cannot unlock local records. Use the password used on this device; do not clear storage with pending records.",
      );
    }
  }
  if (cached && cached.api !== apiUrl())
    throw new Error(
      "This device has records for a different API. Restore the original clinic API and synchronize first.",
    );
  let online: any;
  try {
    online = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  } catch (e: any) {
    if (e.status || !cached || cached.expiresAt < Date.now()) throw e;
  }
  if (!online && (!cached || cached.expiresAt < Date.now()))
    throw new Error("Connect to the clinic API to sign in");
  key = nextKey;
  active = email;
  if (!stored) await put(email, { salt: Array.from(salt) });
  const next: Vault = online
    ? {
        api: apiUrl(),
        user: online.user,
        token: online.token,
        expiresAt: Date.now() + 8 * 3600000,
        rows: cached?.rows || [],
        outbox: cached?.outbox || [],
        cursor: cached?.cursor || "1970-01-01T00:00:00.000Z",
      }
    : cached!;
  await persist(next);
  if (online) await sync(true);
}
export async function lock() {
  await chain;
  key = null;
  active = null;
  vault = null;
  releaseLock?.();
  releaseLock = null;
  await lockTask;
  emit();
}
export function save(entity: Entity, data: any) {
  const job = chain.then(async () => {
    if (!vault || vault.expiresAt < Date.now())
      throw new Error("Session expired. Unlock again.");
    const next = structuredClone(vault);
    const existing = next.rows.find(
      (r) => r.entity === entity && r.id === data.id,
    );
    const pending = next.outbox.filter(
      (o) => o.entity === entity && o.recordId === data.id,
    );
    if (pending.some((o) => o.error))
      throw new Error("Resolve the synchronization conflict before editing");
    const op: Op = {
      id: newId(),
      entity,
      recordId: data.id,
      baseVersion: (existing?.version || 0) + pending.length,
      data,
    };
    next.outbox.push(op);
    const row: Row = {
      entity,
      id: data.id,
      data,
      version: existing?.version || 0,
      updatedAt: new Date().toISOString(),
    };
    next.rows = next.rows.filter(
      (r) => !(r.entity === entity && r.id === data.id),
    );
    next.rows.push(row);
    await persist(next);
  });
  chain = job.catch(() => {});
  return job.then(() => {
    void sync();
  });
}
export async function sync(full = false) {
  if (!vault || busy || !navigator.onLine || !apiUrl()) return;
  busy = true;
  syncError = "";
  emit();
  try {
    await chain;
    const me = await request("/api/auth/me");
    if (JSON.stringify(me) !== JSON.stringify(vault.user)) {
      await persist({ ...vault, user: me });
      full = true;
    }
    for (const op of [...vault.outbox]) {
      if (op.error) continue;
      try {
        const row = await request("/api/sync/push", {
          method: "POST",
          body: JSON.stringify(op),
        });
        await mutate((v) => {
          v.outbox = v.outbox.filter((o) => o.id !== op.id);
          const hasLater = v.outbox.some(
            (o) => o.entity === op.entity && o.recordId === op.recordId,
          );
          if (!hasLater) {
            v.rows = v.rows.filter(
              (r) => !(r.entity === row.entity && r.id === row.id),
            );
            v.rows.push(row);
          } else {
            const local = v.rows.find(
              (r) => r.entity === op.entity && r.id === op.recordId,
            );
            if (local) local.version = row.version;
          }
        });
      } catch (e: any) {
        if (e.status && e.status !== 401 && e.status !== 500) {
          await mutate((v) => {
            const o = v.outbox.find((o) => o.id === op.id);
            if (o) {
              o.error = e.message;
              o.server = e.server;
            }
          });
        } else throw e;
      }
    }
    const merge = (v: Vault, rows: Row[]) => {
      for (const r of rows) {
        if (v.outbox.some((o) => o.entity === r.entity && o.recordId === r.id))
          continue;
        v.rows = v.rows.filter(
          (x) => !(x.entity === r.entity && x.id === r.id),
        );
        v.rows.push(r);
      }
    };
    if (full) {
      let skip: number | null = 0,
        cursor = "";
      const rows: Row[] = [];
      while (skip !== null) {
        const b = await request(
          `/api/snapshot?skip=${skip}${cursor ? "&until=" + encodeURIComponent(cursor) : ""}`,
        );
        cursor = b.cursor;
        rows.push(...b.records);
        skip = b.next;
      }
      await mutate((v) => {
        v.rows = v.rows.filter((r) =>
          v.outbox.some((o) => o.entity === r.entity && o.recordId === r.id),
        );
        merge(v, rows);
        v.cursor = cursor;
      });
    } else {
      try {
        const b = await request(
          "/api/sync/pull?after=" + encodeURIComponent(vault.cursor),
        );
        await mutate((v) => {
          merge(v, b.records);
          v.cursor = b.cursor;
        });
      } catch (e: any) {
        if (e.status === 413) {
          busy = false;
          return await sync(true);
        }
        throw e;
      }
    }
  } catch (e: any) {
    syncError = e.message;
    if (e.status === 401) await lock();
  } finally {
    busy = false;
    emit();
  }
}
function mutate(fn: (v: Vault) => void) {
  const job = chain.then(async () => {
    if (!vault) return;
    const next = structuredClone(vault);
    fn(next);
    await persist(next);
  });
  chain = job.catch(() => {});
  return job;
}
export async function acceptServer(opId: string) {
  await mutate((v) => {
    const op = v.outbox.find((o) => o.id === opId);
    if (!op) return;
    v.outbox = v.outbox.filter(
      (o) => !(o.entity === op.entity && o.recordId === op.recordId),
    );
    v.rows = v.rows.filter(
      (r) => !(r.entity === op.entity && r.id === op.recordId),
    );
    if (op.server) v.rows.push(op.server);
  });
  await sync(true);
}
export async function retryOp(id: string) {
  await mutate((v) => {
    const o = v.outbox.find((x) => x.id === id);
    if (o) {
      o.error = undefined;
      o.server = undefined;
    }
  });
  await sync();
}
window.addEventListener("online", () => void sync());
setInterval(() => {
  if (vault && vault.expiresAt < Date.now()) void lock();
  else void sync();
}, 30000);
