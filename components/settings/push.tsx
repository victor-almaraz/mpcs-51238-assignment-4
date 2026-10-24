"use client";
// Browser notifications on this browser (app-flow.md, Settings: Reminders): registers the service
// worker and a Web Push subscription with the deployment's VAPID public key.
import { BellRing } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ICON_DENSE } from "@/components/ui/icon-button";
import { addPushAction } from "@/lib/server/account-actions";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function EnablePush({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<string | null>(null);
  const enable = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setState("This browser does not support notifications.");
    if ((await Notification.requestPermission()) !== "granted") return setState("Notifications are blocked for this site.");
    const registration = await navigator.serviceWorker.register("/sw.js");
    const sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const r = await addPushAction({ endpoint: json.endpoint, keys: json.keys, label: navigator.userAgent.slice(0, 80) });
    setState(r.error ?? "Notifications are on for this browser.");
  };
  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button onClick={() => void enable()} size="sm" icon={<BellRing {...ICON_DENSE} />}>
        Turn on for this browser
      </Button>
      <p aria-live="polite" className="text-caption text-muted">
        {state}
      </p>
    </div>
  );
}
