"use client";

import { useRef, useState, type ReactNode } from "react";
import { useAdminToast } from "./AdminToast";

export default function EditableSettingsCard({ title, description, children, onSave, onTest }: {
  title: string;
  description?: string;
  children: ReactNode;
  onSave: (data: FormData) => Promise<void>;
  onTest?: () => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const busy = useRef(false);
  const [editing, setEditing] = useState(false);
  const [activity, setActivity] = useState<"saving" | "testing" | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const { showToast } = useAdminToast();
  const button = "inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 disabled:opacity-50";

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || busy.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    busy.current = true;
    setActivity("saving");
    setError("");
    try {
      await onSave(data);
      // Reset/cancel must restore the most recently saved values, not initial props.
      for (const element of Array.from(form.elements)) {
        if (element instanceof HTMLInputElement) {
          if (element.type === "password") element.value = "";
          element.defaultValue = element.value;
          element.defaultChecked = element.checked;
        } else if (element instanceof HTMLTextAreaElement) element.defaultValue = element.value;
      }
      setEditing(false);
      setSaved(true);
      showToast({ title: `${title} saved`, tone: "success" });
    } catch {
      setError("Could not save changes. Please try again. Your edits are still here.");
    } finally { busy.current = false; setActivity(null); }
  }

  async function test() {
    if (!onTest || busy.current) return;
    busy.current = true;
    setActivity("testing");
    setError("");
    try { await onTest(); showToast({ title: "Telegram connected", description: "A test message was sent.", tone: "success" }); }
    catch { setError("Telegram test failed. Check the saved chat ID and bot token."); }
    finally { busy.current = false; setActivity(null); }
  }

  return <form ref={formRef} onSubmit={save} className="rounded-2xl border border-gray-200 bg-white">
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5 sm:px-6">
      <div><h2 className="text-base font-semibold text-gray-800">{title}</h2>{description ? <p className="mt-1 text-sm text-gray-500">{description}</p> : null}</div>
      {!editing ? <button type="button" className={button} disabled={Boolean(activity)} onClick={() => { setEditing(true); setSaved(false); setError(""); }}>Edit</button> : <span className="shrink-0 rounded-full bg-warning-50 px-3 py-1 text-xs font-medium text-warning-700">Editing</span>}
    </div>
    <div className="space-y-5 p-5 sm:p-6">
      <fieldset disabled={!editing || Boolean(activity)} className={`min-w-0 space-y-5 ${editing ? "" : "settings-readonly"}`}>{children}</fieldset>
      {error ? <p role="alert" className="text-sm text-error-600">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
        {editing ? <><button type="submit" disabled={Boolean(activity)} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">{activity === "saving" ? "Saving…" : "Save changes"}</button><button type="button" disabled={Boolean(activity)} className={button} onClick={() => { formRef.current?.reset(); setEditing(false); setError(""); }}>Cancel</button></> : <p role="status" className={`text-sm ${saved ? "text-success-700" : "text-gray-500"}`}>{saved ? "Changes saved" : "Current settings"}</p>}
        {onTest && !editing ? <button type="button" className={`${button} sm:ml-auto`} disabled={Boolean(activity)} onClick={() => void test()}>{activity === "testing" ? "Testing…" : "Send test message"}</button> : null}
      </div>
    </div>
  </form>;
}
