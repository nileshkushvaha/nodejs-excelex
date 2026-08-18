"use client";

import { useActionState, useState, useTransition } from "react";

import { Field, Form, FormError, formField } from "@/components/form-field";
import { SaveBar, SettingsCard } from "@/components/settings-card";
import { StatusPill } from "@/components/status-pill";
import { Toggle } from "@/components/toggle";
import type { ActionResult, MailSettings } from "@/lib/api";
import { saveMailSettings, sendTestMail } from "./actions";

/**
 * Outgoing mail settings.
 *
 * Two modes: the platform's mail server (nothing to configure; mail arrives
 * from the platform's address), or the client's own SMTP server, so mail
 * leaves from their domain and their customers' filters trust it. The
 * password field is write-only: the screen says whether one is stored, and
 * leaving it blank keeps it. "Send a test" goes to the signed-in person,
 * through whatever is *saved* — so save first — and the outcome is recorded
 * beside the settings, because "does it work" is the question this screen
 * exists to answer.
 */
export function MailSettingsForm({ settings, canManage }: { settings: MailSettings; canManage: boolean }) {
  const [state, action, pending] = useActionState(saveMailSettings, null);
  const [provider, setProvider] = useState<"PLATFORM" | "SMTP">(settings.provider);
  const [testResult, setTestResult] = useState<ActionResult | null>(null);
  const [testing, startTest] = useTransition();

  const runTest = () =>
    startTest(async () => {
      setTestResult(await sendTestMail());
    });

  return (
    <Form errors={state?.fieldErrors} action={action} className="space-y-5">
      <FormError result={state} />
      {state?.ok ? (
        <p role="status" className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
          Saved. Send a test to confirm it delivers.
        </p>
      ) : null}

      <SettingsCard
        title="Mail server"
        description="Which server sends this account's email."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${provider === "PLATFORM" ? "border-accent bg-accent-soft/30" : "border-line"}`}>
            <input type="radio" name="provider" value="PLATFORM" checked={provider === "PLATFORM"} onChange={() => setProvider("PLATFORM")} disabled={!canManage} className="mt-1" />
            <span>
              <span className="block text-sm font-medium text-fg">Platform mail server</span>
              <span className="block text-xs text-muted">
                Nothing to configure. Sent as {settings.platformFrom.name} &lt;{settings.platformFrom.email}&gt; unless you set a sender below.
              </span>
            </span>
          </label>
          <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${provider === "SMTP" ? "border-accent bg-accent-soft/30" : "border-line"}`}>
            <input type="radio" name="provider" value="SMTP" checked={provider === "SMTP"} onChange={() => setProvider("SMTP")} disabled={!canManage} className="mt-1" />
            <span>
              <span className="block text-sm font-medium text-fg">Our own SMTP server</span>
              <span className="block text-xs text-muted">Mail leaves from your domain, through your provider (Google Workspace, Microsoft 365, SES…).</span>
            </span>
          </label>
        </div>

        {provider === "SMTP" ? (
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="SMTP host" span={2}>
              <input name="smtpHost" defaultValue={settings.smtpHost ?? ""} placeholder="smtp.example.com" disabled={!canManage} className={formField} />
            </Field>
            <Field label="Port">
              <input name="smtpPort" type="number" min={1} max={65535} defaultValue={settings.smtpPort ?? 587} disabled={!canManage} className={formField} />
            </Field>
            <div className="flex items-end pb-1">
              <Toggle name="smtpSecure" label="Implicit TLS (port 465)" defaultChecked={settings.smtpSecure} disabled={!canManage} />
            </div>
            <Field label="Username" span={2}>
              <input name="smtpUsername" autoComplete="off" defaultValue={settings.smtpUsername ?? ""} disabled={!canManage} className={formField} />
            </Field>
            <Field
              label="Password"
              span={2}
              hint={settings.hasPassword ? "A password is stored. Leave blank to keep it." : "Stored encrypted; never shown again."}
            >
              <input name="smtpPassword" type="password" autoComplete="new-password" placeholder={settings.hasPassword ? "••••••••" : ""} disabled={!canManage} className={formField} />
            </Field>
          </div>
        ) : null}
      </SettingsCard>

      <SettingsCard title="Sender" description="Who the email appears to come from.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="From name">
            <input name="fromName" defaultValue={settings.fromName ?? ""} placeholder={settings.platformFrom.name} disabled={!canManage} className={formField} />
          </Field>
          <Field label="From address" hint={provider === "SMTP" ? "Must be an address your server may send as." : "Optional; some receivers distrust a from-address the platform's server does not own."}>
            <input name="fromEmail" type="email" defaultValue={settings.fromEmail ?? ""} placeholder={settings.platformFrom.email} disabled={!canManage} className={formField} />
          </Field>
          <Field label="Reply-to" hint="Where replies go, if not the sender.">
            <input name="replyTo" type="email" defaultValue={settings.replyTo ?? ""} disabled={!canManage} className={formField} />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard title="Does it deliver?" description="Sends a test message to your own address through the settings as saved.">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={runTest} disabled={!canManage || testing} className="btn-secondary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">
            {testing ? "Sending…" : "Send a test to me"}
          </button>
          {settings.lastTestedAt ? (
            <span className="flex items-center gap-2 text-xs text-muted">
              Last test {new Date(settings.lastTestedAt).toLocaleString("en-IN")}
              <StatusPill tone={settings.lastTestOk ? "green" : "red"}>{settings.lastTestOk ? "delivered" : "failed"}</StatusPill>
            </span>
          ) : (
            <span className="text-xs text-faint">Not tested yet.</span>
          )}
        </div>
        {testResult ? (
          testResult.ok ? (
            <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
              Sent to {(testResult.data as { to?: string })?.to}. Check the inbox — and the spam folder the first time.
            </p>
          ) : (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">{testResult.error}</p>
          )
        ) : settings.lastTestError && !settings.lastTestOk ? (
          <p className="text-xs text-red-700 dark:text-red-300">Last error: {settings.lastTestError}</p>
        ) : null}
      </SettingsCard>

      <SaveBar pending={pending} updatedAt={settings.updatedAt} canManage={canManage} />
    </Form>
  );
}
