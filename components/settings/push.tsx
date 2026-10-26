"use client";
// Browser notifications on this browser (app-flow.md, Settings: Reminders): registers the service
// worker and a Web Push subscription with the deployment's VAPID public key, labelled with the browser
// and operating system, and turns on browser notifications in the reminder settings.
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

// In order: Edge, Opera, and Samsung Internet also name Chrome, and Chrome also names Safari.
const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];
// Android and ChromeOS also name Linux; iPhone and iPad also name Mac OS X.
const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPod/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Linux/, "Linux"],
];

/** "Firefox on Windows": the browser and operating system a user agent string names. */
export function browserLabel(ua: string): string {
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? "Browser";
  const os = SYSTEMS.find(([re]) => re.test(ua))?.[1];
  return os ? `${browser} on ${os}` : browser;
}

export function EnablePush({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const fail = (text: string) => setState({ text, error: true });
  const enable = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return fail("This browser does not support notifications.");
    setPending(true);
    try {
      if ((await Notification.requestPermission()) !== "granted") return fail("Notifications are blocked for this site. Allow them in the browser's site settings, then try again.");
      const registration = await navigator.serviceWorker.register("/sw.js");
      const sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const r = await addPushAction({ endpoint: json.endpoint, keys: json.keys, label: browserLabel(navigator.userAgent) });
      setState(r.error ? { text: r.error, error: true } : { text: "Notifications are on for this browser.", error: false });
    } catch {
      fail("This browser could not turn on notifications. Try again, or use another browser.");
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button onClick={() => void enable()} disabled={pending} size="sm" icon={<BellRing {...ICON_DENSE} />}>
        Turn on for this browser
      </Button>
      <p aria-live="polite" className={state?.error ? "text-caption text-danger" : "text-caption text-muted"}>
        {state?.text}
      </p>
    </div>
  );
}
