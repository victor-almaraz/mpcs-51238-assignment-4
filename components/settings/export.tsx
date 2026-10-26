"use client";
// Export my data (app-flow.md, Settings: Your data): downloads export_my_data's ZIP from the HTTP
// binding, and says in plain words why when the server refuses (the rate limit, a signed-out session).
import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ICON_DENSE } from "@/components/ui/icon-button";

const URL_PATH = "/v1/me/export.zip";

/** The refusal as a sentence for the user. */
async function reason(r: Response): Promise<string> {
  if (r.status === 429) {
    const wait = Number(r.headers.get("retry-after"));
    return wait > 0 ? `Too many requests. Try again in ${wait} second${wait === 1 ? "" : "s"}.` : "Too many requests. Try again in a minute.";
  }
  if (r.status === 401) return "Your session has ended. Sign in again to export your data.";
  if (r.status === 503) return "The export is not available right now.";
  const detail = await r
    .json()
    .then((b: { error?: { detail?: unknown } }) => (typeof b.error?.detail === "string" ? b.error.detail : null))
    .catch(() => null);
  if (!detail) return "The export failed. Try again later.";
  const sentence = detail.charAt(0).toUpperCase() + detail.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

/** A button, or with `inline` a link-styled button for running text, and the error under it. */
export function ExportData({ inline = false }: { inline?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const run = async () => {
    setPending(true);
    setError(null);
    try {
      const r = await fetch(URL_PATH, { credentials: "same-origin" });
      if (!r.ok) return setError(await reason(r));
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "cadmium-export.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError("The export could not be downloaded. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };
  const message = error && (
    <span role="alert" className="text-caption text-danger">
      {error}
    </span>
  );
  if (inline) {
    return (
      <>
        <button type="button" onClick={() => void run()} disabled={pending} className="font-medium text-accent underline disabled:opacity-55">
          {pending ? "Preparing export…" : "Export my data"}
        </button>
        {message && <> {message}</>}
      </>
    );
  }
  return (
    <span className="inline-flex flex-col items-start gap-1.5">
      <Button onClick={() => void run()} disabled={pending} icon={<Download {...ICON_DENSE} />}>
        {pending ? "Preparing export…" : "Export my data"}
      </Button>
      {message}
    </span>
  );
}
