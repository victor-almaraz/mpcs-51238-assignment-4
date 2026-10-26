import { createECDH, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import webpush from "web-push";
import { webPushFromEnv } from "../server/push";
import { pushPayload, webPush, type Send } from "./push";

const reminder = { instance_id: "i_1", session_id: "s_1", occurrence_start: "2026-10-20T18:00:00Z", starts_at: "2026-10-20T18:00:00Z", title: "Thursday table" };
const vapid = { ...webpush.generateVAPIDKeys(), subject: "mailto:ops@cadmium.test" };

/** A browser's subscription keys: a P-256 public key and a 16-byte auth secret. */
function browserKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") };
}

function fakeStore(endpoints: string[]) {
  const results: [string, boolean][] = [];
  const store = {
    listPush: async () => endpoints.map((endpoint, i) => ({ id: `p_${i}`, label: `Browser ${i}`, created_at: "", last_used_at: null, endpoint, ...browserKeys() })),
    pushResult: async (endpoint: string, gone: boolean) => void results.push([endpoint, gone]),
    getUser: async () => ({ timezone: "Europe/Berlin" }) as Awaited<ReturnType<Parameters<typeof webPush>[0]["getUser"]>>,
  };
  return { store, results };
}

describe("Web Push reminders", () => {
  it("shows the title and the start in the user's time zone, and opens the lobby", () => {
    expect(pushPayload(reminder, "Europe/Berlin")).toEqual({ title: "Thursday table", body: "Starts Tue 20 Oct, 20:00 CEST", url: "/instances/i_1" });
  });

  it("sends to every subscription, expiring at the start, and records each delivery", async () => {
    const { store, results } = fakeStore(["https://push.test/a", "https://push.test/b"]);
    const sent: { endpoint: string; payload: unknown; ttl: number | undefined }[] = [];
    const send: Send = async (s, payload, options) => void sent.push({ endpoint: s.endpoint, payload: JSON.parse(payload), ttl: options.TTL });
    await webPush(store, vapid, () => new Date("2026-10-20T17:45:00Z"), send)("user_a", reminder);
    expect(sent.map((s) => [s.endpoint, s.ttl])).toEqual([["https://push.test/a", 900], ["https://push.test/b", 900]]);
    expect(sent[0]!.payload).toMatchObject({ title: "Thursday table", url: "/instances/i_1" });
    expect(results).toEqual([["https://push.test/a", false], ["https://push.test/b", false]]);
  });

  it("deletes a subscription the push service reports gone, and reports any other failure after trying all", async () => {
    const { store, results } = fakeStore(["https://push.test/gone", "https://push.test/down", "https://push.test/ok"]);
    const send: Send = async (s) => {
      if (s.endpoint.endsWith("gone")) throw Object.assign(new Error("Received unexpected response code"), { statusCode: 410 });
      if (s.endpoint.endsWith("down")) throw Object.assign(new Error("Received unexpected response code"), { statusCode: 503 });
    };
    await expect(webPush(store, vapid, () => new Date("2026-10-20T17:45:00Z"), send)("user_a", reminder)).rejects.toThrow("Web Push failed for 1 of 3 subscriptions: Browser 1: Received unexpected response code");
    expect(results).toEqual([["https://push.test/gone", true], ["https://push.test/ok", false]]);
  });

  it("does nothing for a user without subscriptions", async () => {
    const { store } = fakeStore([]);
    const send: Send = async () => expect.unreachable();
    await webPush(store, vapid, () => new Date(), send)("user_a", reminder);
  });

  it("builds an encrypted, VAPID-signed request with the options it passes", async () => {
    const { store } = fakeStore(["https://push.test/a"]);
    let request: ReturnType<typeof webpush.generateRequestDetails> | undefined;
    const send: Send = async (s, payload, options) => void (request = webpush.generateRequestDetails(s, payload, options));
    await webPush(store, vapid, () => new Date("2026-10-20T17:45:00Z"), send)("user_a", reminder);
    expect(request!.headers).toMatchObject({ TTL: 900, "Content-Encoding": "aes128gcm" });
    expect(String(request!.headers.Authorization)).toMatch(/^vapid t=.+, k=/);
  });

  it("is configured only when both VAPID keys are set", () => {
    const { store } = fakeStore([]);
    expect(webPushFromEnv(store, { VAPID_PUBLIC_KEY: vapid.publicKey })).toBeUndefined();
    expect(webPushFromEnv(store, { VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey })).toBeTypeOf("function");
  });
});
