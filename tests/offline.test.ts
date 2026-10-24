import { beforeEach, afterEach, test, expect, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
let local: Map<string, string>,
  online = true;
const locks = new Set<string>();
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("indexedDB", new IDBFactory());
  local = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => local.get(k) || null,
    setItem: (k: string, v: string) => local.set(k, v),
  });
  vi.stubGlobal("window", { addEventListener: () => {} });
  vi.stubGlobal("setInterval", () => 0);
  online = true;
  vi.stubGlobal("navigator", {
    get onLine() {
      return online;
    },
    locks: {
      async request(name: string, _options: any, cb: any) {
        if (locks.has(name)) return cb(null);
        locks.add(name);
        try {
          return await cb({ name });
        } finally {
          locks.delete(name);
        }
      },
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: any) => {
      if (!online) throw new TypeError("Network unavailable");
      if (url.endsWith("/api/auth/login"))
        return response({
          user: {
            id: "doctor",
            name: "Doctor",
            email: "doctor@test.com",
            role: "doctor",
            permissions: [],
          },
          token: "test-session",
        });
      if (url.endsWith("/api/auth/me"))
        return response({
          id: "doctor",
          name: "Doctor",
          email: "doctor@test.com",
          role: "doctor",
          permissions: [],
        });
      if (url.includes("/api/snapshot"))
        return response({
          records: [],
          cursor: new Date().toISOString(),
          next: null,
        });
      if (url.includes("/api/sync/pull"))
        return response({ records: [], cursor: new Date().toISOString() });
      if (url.endsWith("/api/sync/push")) {
        const op = JSON.parse(options.body);
        return response({
          entity: op.entity,
          id: op.recordId,
          data: op.data,
          version: op.baseVersion + 1,
          updatedAt: new Date().toISOString(),
        });
      }
      throw new Error("Unexpected request " + url);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  locks.clear();
});
function response(body: any, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}
const patient = () => {
  const id = crypto.randomUUID();
  return {
    id,
    patientNumber: "CV-" + id,
    name: "Synthetic patient",
    age: 40,
    address: "Test locality",
    phone: "",
    gender: "male",
    createdAt: new Date().toISOString(),
  };
};
test("offline save persists record and operation together, survives module restart", async () => {
  let s = await import("../src/store");
  s.setApi("https://clinic.test");
  await s.login("doctor@test.com", "test-password");
  online = false;
  const p = patient();
  await s.save("patients", p);
  expect(s.getVault()?.outbox).toHaveLength(1);
  expect(s.getVault()?.rows[0].data.name).toBe("Synthetic patient");
  await s.lock();
  vi.resetModules();
  s = await import("../src/store");
  await s.login("doctor@test.com", "test-password");
  expect(s.getVault()?.outbox[0].recordId).toBe(p.id);
  expect(s.getVault()?.rows[0].data.id).toBe(p.id);
  await s.lock();
});
test("offline unlock rejects incorrect password and a different API", async () => {
  const s = await import("../src/store");
  s.setApi("https://clinic.test");
  await s.login("doctor@test.com", "test-password");
  await s.lock();
  online = false;
  await expect(s.login("doctor@test.com", "wrong-password")).rejects.toThrow(
    "Cannot unlock",
  );
  s.setApi("https://different-clinic.test");
  await expect(s.login("doctor@test.com", "test-password")).rejects.toThrow(
    "different API",
  );
});
test("sync replay uses the original operation id and clears accepted operation", async () => {
  const s = await import("../src/store");
  s.setApi("https://clinic.test");
  await s.login("doctor@test.com", "test-password");
  online = false;
  await s.save("patients", patient());
  const operation = s.getVault()!.outbox[0];
  online = true;
  await s.sync();
  expect(s.getVault()?.outbox).toHaveLength(0);
  expect(s.getVault()?.rows[0].version).toBe(1);
  const calls = (fetch as any).mock.calls.filter((x: any) =>
    x[0].endsWith("/api/sync/push"),
  );
  expect(JSON.parse(calls[0][1].body).id).toBe(operation.id);
  await s.lock();
});
test("rejected edit is retained for review and not silently overwritten", async () => {
  const s = await import("../src/store");
  s.setApi("https://clinic.test");
  await s.login("doctor@test.com", "test-password");
  online = false;
  const p = patient();
  await s.save("patients", p);
  const original = fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: any) =>
      url.endsWith("/api/sync/push")
        ? response(
            {
              error: "Conflict",
              server: {
                entity: "patients",
                id: p.id,
                data: { ...p, name: "Server patient" },
                version: 2,
              },
            },
            409,
          )
        : original(url, options),
    ),
  );
  online = true;
  await s.sync();
  expect(s.getVault()?.outbox[0].error).toBe("Conflict");
  expect(s.getVault()?.rows[0].data.name).toBe("Synthetic patient");
  await s.acceptServer(s.getVault()!.outbox[0].id);
  expect(s.getVault()?.outbox).toHaveLength(0);
  await s.lock();
});
