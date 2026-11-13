"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { SenderProfile } from "@/lib/email/compose";
import type { BusinessDTO } from "@/lib/types";
import { ErrorBox, InfoBox, Spinner } from "./ui";

interface Settings {
  profile: SenderProfile;
  configured: boolean;
  from: string | null;
  ai: boolean;
  sentToday: number;
  dailyLimit: number;
}

interface Draft {
  id: string;
  name: string;
  to: string | null;
  skip?: string;
  subject?: string;
  body?: string;
  ai?: boolean;
  focus?: string;
  notes?: { audited: boolean; mobileScore: number | null; listings: string[]; socials: string[]; about: string | null; findings: string[] };
  include?: boolean;
  status?: "sent" | "failed" | "already";
  error?: string;
}

const PROFILE_FIELDS: { key: keyof SenderProfile; label: string; hint?: string; wide?: boolean }[] = [
  { key: "senderName", label: "Your name (sign-off)" },
  { key: "senderTitle", label: "Your title", hint: "e.g. Founder. Leave empty to sign as the company." },
  { key: "companyName", label: "Company name" },
  { key: "website", label: "Company website" },
  { key: "phone", label: "Phone (optional)" },
  { key: "recentWork", label: "A recent project (optional)", wide: true, hint: "Reads after \"Recently, …\", e.g. we rebuilt the website for a packaging manufacturer in India. Leave empty to skip." },
  { key: "recentWorkMatch", label: "Mention that project only to these industries", wide: true, hint: "Comma-separated words matched against each business's industry. Empty = mention it to everyone." },
  { key: "testimonial", label: "Client testimonial (optional)", wide: true, hint: "A real quote and who said it, e.g. \"Our enquiries doubled in 3 months.\" — Rahul, ABC Packaging. Leave empty to skip; never invent one." },
  { key: "address", label: "Business postal address", wide: true, hint: "Shown under your signature. Required before emailing US businesses (CAN-SPAM)." },
  { key: "skipCountries", label: "Never email these countries", wide: true, hint: "Comma-separated, e.g. Germany. Businesses there are never queued or sent." },
  { key: "about", label: "About your company (one line)", wide: true, hint: "Reads after \"at Kreatif Atelier, …\"" },
];

/**
 * Research, review and send personal cold emails to the chosen businesses. Each one is researched
 * (website audit + web search), drafted from what that business lacks, shown for review and editing,
 * and only sent when you press Send. Sent through your own Gmail, at a steady pace, with a daily cap.
 */
export function EmailCampaign({ businesses, onClose, onDone }: { businesses: BusinessDTO[]; onClose: () => void; onDone: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profile, setProfile] = useState<SenderProfile | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [phase, setPhase] = useState<"idle" | "drafting" | "review" | "sending" | "done">("idle");
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const stop = useRef(false);
  const withEmail = businesses.filter((b) => b.email && b.emailStatus !== "SENT" && b.emailStatus !== "SENDING" && b.emailStatus !== "OPTED_OUT");
  const alreadySent = businesses.filter((b) => b.emailStatus === "SENT" || b.emailStatus === "SENDING");

  useEffect(() => {
    api<Settings>("/api/email/settings")
      .then((s) => {
        setSettings(s);
        setProfile(s.profile);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load email settings"));
  }, []);

  async function saveProfile() {
    if (!profile) return;
    try {
      const r = await api<{ profile: SenderProfile }>("/api/email/settings", { method: "PUT", body: JSON.stringify(profile) });
      setProfile(r.profile);
      setShowProfile(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  }

  async function research() {
    setPhase("drafting");
    setError(null);
    stop.current = false;
    const ids = withEmail.map((b) => b.id);
    const all: Draft[] = [];
    try {
      for (let i = 0; i < ids.length && !stop.current; i += 10) {
        setProgress(`Researching and writing ${Math.min(i + 10, ids.length)} of ${ids.length}: website audit, web search for listings and social pages, then a personal draft…`);
        const r = await api<{ drafts: Draft[] }>("/api/email/preview", { method: "POST", body: JSON.stringify({ ids: ids.slice(i, i + 10) }) });
        all.push(...r.drafts.filter(Boolean).map((d) => ({ ...d, include: !d.skip })));
        setDrafts([...all]);
      }
      setProgress(null);
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not write the drafts");
      setPhase(all.length ? "review" : "idle");
    }
  }

  const update = (id: string, p: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...p } : d)));
  const toSend = drafts.filter((d) => d.include && !d.skip && d.status !== "sent" && d.subject && d.body);

  async function send() {
    if (!settings || !toSend.length) return;
    const left = Math.max(0, settings.dailyLimit - settings.sentToday);
    if (!window.confirm(`Send ${toSend.length} emails from ${settings.from}?\n\nThey go out one every ~8 seconds (about ${Math.ceil((toSend.length * 8) / 60)} min). Today's limit allows ${left} more; the rest can be sent tomorrow.`)) return;
    setPhase("sending");
    stop.current = false;
    let sent = 0;
    let failed = 0;
    let already = 0;
    try {
      for (let i = 0; i < toSend.length && !stop.current; ) {
        const chunk = toSend.slice(i, i + 20);
        setProgress(`Sending… ${sent} sent${failed ? `, ${failed} failed` : ""}, ${toSend.length - i} to go.`);
        const r = await api<{ results: { id: string; ok: boolean; already?: boolean; error?: string }[]; stopped: string | null; processed: number }>("/api/email/send", {
          method: "POST",
          body: JSON.stringify({ items: chunk.map((d) => ({ id: d.id, subject: d.subject, body: d.body, focus: d.focus })) }),
        });
        // Already-sent businesses are skipped, never sent twice, and the rest keep going.
        for (const x of r.results) {
          update(x.id, x.ok ? { status: "sent" } : x.already ? { status: "already", error: x.error } : { status: "failed", error: x.error });
          if (x.ok) sent++;
          else if (x.already) already++;
          else failed++;
        }
        if (r.stopped) {
          setError(`Stopped: ${r.stopped}`);
          break;
        }
        if (!r.processed) break;
        i += r.processed;
      }
      setProgress(`${sent} emails sent${already ? `, ${already} skipped because they were already sent` : ""}${failed ? `, ${failed} failed` : ""}. Replies arrive in ${settings.from}'s inbox.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sending failed");
    } finally {
      setPhase("done");
      onDone();
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/70 p-4" onClick={phase === "sending" || phase === "drafting" ? undefined : onClose}>
      <div className="card my-6 w-full max-w-4xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="h-serif text-xl text-gold">Personal cold emails</h2>
            <p className="text-sm text-cream/60">
              {businesses.length} selected · {withEmail.length} with an email address that haven't been emailed yet.
              {settings && ` Sending from ${settings.from ?? "(not set up)"} · ${settings.sentToday}/${settings.dailyLimit} sent today.`}
            </p>
          </div>
          <button className="btn-ghost !py-1 text-xs" onClick={onClose} disabled={phase === "sending"}>Close</button>
        </div>

        {alreadySent.length > 0 && (
          <div className="mb-3">
            <InfoBox>
              {alreadySent.length} of the ticked businesses {alreadySent.length === 1 ? "was" : "were"} already emailed, so {alreadySent.length === 1 ? "it" : "they"} won't get the same email again: {alreadySent.slice(0, 5).map((b) => b.name).join(", ")}{alreadySent.length > 5 ? ` and ${alreadySent.length - 5} more` : ""}. {withEmail.length ? `The other ${withEmail.length} will be emailed.` : "Nobody else here is left to email."}
            </InfoBox>
          </div>
        )}
        {settings && !settings.configured && (
          <div className="mb-3">
            <InfoBox>
              Sending isn't set up yet. You can still research and review drafts. To send, add <b>GMAIL_USER</b> (your Gmail address) and <b>GMAIL_APP_PASSWORD</b> (a Google app password from myaccount.google.com/apppasswords; needs 2-step verification) in Vercel → aurelius-radar → Settings → Environment Variables, then redeploy.
            </InfoBox>
          </div>
        )}

        {profile && (
          <div className="mb-4 rounded-lg border border-cream/10 p-3">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-cream/70">Signed as <b className="text-cream">{profile.senderName}</b> · {profile.website}</span>
              <button className="btn-ghost !py-1 text-xs" onClick={() => setShowProfile((v) => !v)}>{showProfile ? "Cancel" : "Edit company details & prices"}</button>
            </div>
            {showProfile && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {PROFILE_FIELDS.map((f) => (
                  <div key={f.key} className={f.wide ? "md:col-span-2" : ""}>
                    <label className="label">{f.label}</label>
                    <input className="input" value={profile[f.key]} onChange={(e) => setProfile({ ...profile, [f.key]: e.target.value })} />
                    {f.hint && <p className="mt-0.5 text-[11px] text-cream/40">{f.hint}</p>}
                  </div>
                ))}
                <div className="md:col-span-2"><button className="btn-gold" onClick={saveProfile}>Save details</button></div>
              </div>
            )}
          </div>
        )}

        {error && <div className="mb-3"><ErrorBox>{error}</ErrorBox></div>}

        {phase === "idle" && (
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-gold" disabled={!withEmail.length} onClick={research}>Research & write {withEmail.length} emails</button>
            <span className="text-xs text-cream/50">Each business is audited (if it has a website) and searched on the web before its email is written. About 10 businesses a minute. Nothing is sent until you review and press Send.</span>
          </div>
        )}
        {progress && (
          <div className="mb-3">{phase === "drafting" || phase === "sending" ? <Spinner label={progress} /> : <p className="text-sm text-gold">{progress}</p>}</div>
        )}
        {(phase === "drafting" || phase === "sending") && (
          <button className="btn-ghost mb-3 !py-1 text-xs" onClick={() => (stop.current = true)}>Stop after this batch</button>
        )}

        {drafts.length > 0 && (
          <>
            {(phase === "review" || phase === "done") && (
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <button className="btn-gold" disabled={!toSend.length || !settings?.configured} onClick={send}>Send {toSend.length} emails</button>
                <span className="text-xs text-cream/50">Untick any you don't want to send. Click a business to read and edit its email.</span>
              </div>
            )}
            <div className="space-y-2">
              {drafts.map((d, i) => (
                <div key={d.id} className="rounded-lg border border-cream/10">
                  <div className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-6 text-right text-cream/40">{i + 1}</span>
                    <input type="checkbox" disabled={!!d.skip || d.status === "sent"} checked={!!d.include && !d.skip} onChange={(e) => update(d.id, { include: e.target.checked })} />
                    <button className="flex-1 text-left" onClick={() => setOpenId(openId === d.id ? null : d.id)}>
                      <span className="font-medium">{d.name}</span>
                      <span className="ml-2 text-xs text-cream/50">{d.to ?? ""}</span>
                      {d.subject && <div className="text-xs text-cream/60">{d.subject}</div>}
                    </button>
                    {d.skip && <span className="text-xs text-cream/45">{d.skip}</span>}
                    {d.notes && <span className="text-[11px] text-cream/45">{d.notes.findings.length} findings{d.notes.audited ? " · audited" : ""}{d.ai ? " · AI-polished" : ""}</span>}
                    {d.status === "sent" && <span className="text-xs text-emerald">Sent ✓</span>}
                    {d.status === "already" && <span className="text-xs text-cream/50">Already sent, skipped</span>}
                    {d.status === "failed" && <span className="text-xs text-crimson" title={d.error}>Failed</span>}
                  </div>
                  {openId === d.id && d.body != null && (
                    <div className="grid gap-3 border-t border-cream/10 p-3 md:grid-cols-[1fr_240px]">
                      <div className="space-y-2">
                        <input className="input" value={d.subject} onChange={(e) => update(d.id, { subject: e.target.value })} disabled={d.status === "sent"} />
                        <textarea className="input min-h-[380px] font-mono text-[12px] leading-relaxed" value={d.body} onChange={(e) => update(d.id, { body: e.target.value })} disabled={d.status === "sent"} />
                        {settings?.configured && (
                          <button
                            className="btn-ghost !py-1 text-xs"
                            onClick={() =>
                              api<{ sentTo: string }>("/api/email/test", { method: "POST", body: JSON.stringify({ subject: d.subject, body: d.body }) })
                                .then((r) => window.alert(`Test sent to ${r.sentTo}. ${d.name} was not emailed.`))
                                .catch((e) => window.alert(e instanceof Error ? e.message : "Test failed"))
                            }
                          >
                            Send me a test of this email
                          </button>
                        )}
                      </div>
                      {d.notes && (
                        <div className="space-y-2 text-[12px] text-cream/70">
                          <div className="label">Research</div>
                          <div>Website audit: {d.notes.audited ? `done${d.notes.mobileScore != null ? ` (mobile speed ${d.notes.mobileScore}/100)` : ""}` : "no website / not reachable"}</div>
                          <div>Listed on: {d.notes.listings.join(", ") || "nothing found"}</div>
                          <div>Social pages found: {d.notes.socials.join(", ") || "none found"}</div>
                          {d.notes.about && <div>About: <span className="text-cream/55">{d.notes.about}</span></div>}
                          <div className="label !mt-3">What they lack</div>
                          <ul className="list-disc space-y-1 pl-4">{d.notes.findings.map((f) => <li key={f}>{f}</li>)}</ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
