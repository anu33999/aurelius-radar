"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import type { OutreachRow } from "@/lib/db/repo";
import { ErrorBox, InfoBox, SectionTitle, Spinner } from "./ui";

type View = "sent" | "replied" | "waiting" | "followed" | "queued" | "failed" | "optout";

const VIEWS: { key: View; label: string; test: (r: OutreachRow) => boolean }[] = [
  { key: "sent", label: "All sent", test: (r) => r.status === "SENT" || r.status === "OPTED_OUT" && !!r.sentAt },
  { key: "replied", label: "Replied", test: (r) => !!r.repliedAt },
  { key: "waiting", label: "Waiting for reply", test: (r) => r.status === "SENT" && !r.repliedAt },
  { key: "followed", label: "Followed up", test: (r) => !!r.followUpAt },
  { key: "queued", label: "In queue", test: (r) => r.queued && r.status !== "SENT" },
  { key: "failed", label: "Failed", test: (r) => r.status === "FAILED" },
  { key: "optout", label: "Do not email", test: (r) => r.status === "OPTED_OUT" },
];

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

/** Everything sent, every reply, and what's still waiting: one place to follow up the outreach. */
export function OutreachTab() {
  const [rows, setRows] = useState<OutreachRow[] | null>(null);
  const [view, setView] = useState<View>("sent");
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function load() {
    try {
      setRows((await api<{ rows: OutreachRow[] }>("/api/email/outreach")).rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load outreach");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function checkReplies() {
    setChecking(true);
    setMsg(null);
    try {
      const r = await api<{ found: number }>("/api/email/replies", { method: "POST" });
      setMsg(r.found ? `${r.found} new ${r.found === 1 ? "reply" : "replies"} found in your Gmail.` : "No new replies found.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check Gmail");
    } finally {
      setChecking(false);
    }
  }

  async function flag(id: string, f: "replied" | "not-replied" | "opt-out") {
    await api("/api/email/outreach", { method: "PATCH", body: JSON.stringify({ id, flag: f }) }).catch((e) => setError(e instanceof Error ? e.message : "Save failed"));
    load();
  }

  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.key, rows?.filter(v.test).length ?? 0])), [rows]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter(VIEWS.find((v) => v.key === view)!.test).filter((r) => !needle || `${r.name} ${r.email ?? ""} ${r.city} ${r.country ?? ""}`.toLowerCase().includes(needle));
  }, [rows, view, q]);
  const sent = counts.sent || 0;

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <SectionTitle sub="Every personal email sent from the app, every reply found in your Gmail, follow-ups, and what is still waiting.">Outreach</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["Emails sent", sent],
            ["Replies", counts.replied],
            ["Reply rate", sent ? `${Math.round(((counts.replied || 0) / sent) * 100)}%` : "–"],
            ["Waiting in queue", counts.queued],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-lg border border-cream/10 p-3">
              <div className="text-[11px] uppercase tracking-wider text-cream/50">{label}</div>
              <div className="h-serif text-2xl text-gold">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className="btn-gold !py-1 text-xs" disabled={checking} onClick={checkReplies}>{checking ? "Checking Gmail…" : "Check replies now"}</button>
          <button className="btn-ghost !py-1 text-xs" onClick={load}>Refresh</button>
          <span className="text-xs text-cream/45">Replies are also checked automatically each time emails are sent and once a day.</span>
        </div>
        {checking && <div className="mt-2"><Spinner label="Reading your Gmail for replies (read-only)…" /></div>}
        {msg && <p className="mt-2 text-sm text-gold">{msg}</p>}
        {error && <div className="mt-2"><ErrorBox>{error}</ErrorBox></div>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map((v) => (
          <button key={v.key} onClick={() => setView(v.key)} className={`rounded-lg px-3 py-1.5 text-sm ${view === v.key ? "bg-gold text-onaccent" : "text-cream/70 hover:text-gold"}`}>
            {v.label} <span className="ml-1 text-[11px] opacity-70">{counts[v.key] ?? 0}</span>
          </button>
        ))}
        <input className="input !w-56" placeholder="Search name, email, city…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {rows === null ? (
        <Spinner label="Loading…" />
      ) : shown.length === 0 ? (
        <InfoBox>{rows.length === 0 ? "No emails sent yet. Use “Email everyone in this list” or “Email ticked businesses” in the International Directory." : "Nothing here."}</InfoBox>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-cream/10 text-[11px] uppercase tracking-wider text-gold/80">
              <tr>
                <th className="px-2 py-2.5">#</th>
                <th className="px-3 py-2.5">Business</th>
                <th className="px-3 py-2.5">Email</th>
                <th className="px-3 py-2.5">Sent</th>
                <th className="px-3 py-2.5">Subject</th>
                <th className="px-3 py-2.5">Follow-up</th>
                <th className="px-3 py-2.5">Reply</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <Fragment key={r.id}>
                  <tr className="border-b border-cream/5 hover:bg-cream/[0.04]">
                    <td className="px-2 py-2.5 text-xs text-cream/40">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-cream/50">{r.city}{r.country ? `, ${r.country}` : ""}{r.phone ? ` · ${r.phone}` : ""}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {r.email ? <a className="text-cream/75 hover:text-gold" href={`https://mail.google.com/mail/u/0/#search/${encodeURIComponent(r.email)}`} target="_blank" rel="noreferrer" title="Open the conversation in Gmail">{r.email} ↗</a> : "–"}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-cream/75">
                      {r.sentAt ? day(r.sentAt) : r.queued ? <span className="text-cream/45">queued</span> : "–"}
                      {r.status === "FAILED" && <div className="text-crimson" title={r.error ?? ""}>Failed{r.error ? `: ${r.error.slice(0, 60)}` : ""}</div>}
                      {r.status === "OPTED_OUT" && <div className="text-cream/45">Do not email</div>}
                    </td>
                    <td className="max-w-[260px] px-3 py-2.5 text-xs text-cream/75">{r.subject ?? "–"}</td>
                    <td className="px-3 py-2.5 text-xs text-cream/75">{r.followUpAt ? day(r.followUpAt) : r.status === "SENT" && !r.repliedAt ? <span className="text-cream/40">after 4 working days</span> : "–"}</td>
                    <td className="px-3 py-2.5 text-xs">{r.repliedAt ? <span className="font-medium text-gold">Replied ✓ {day(r.repliedAt)}</span> : <span className="text-cream/40">–</span>}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        {r.body && <button className="btn-ghost !py-1 text-xs" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Hide" : "View email"}</button>}
                        {r.status === "SENT" && (r.repliedAt
                          ? <button className="btn-ghost !py-1 text-xs" onClick={() => flag(r.id, "not-replied")} title="Undo if this wasn't a real reply">Not a reply</button>
                          : <button className="btn-ghost !py-1 text-xs" onClick={() => flag(r.id, "replied")} title="Stops the follow-up">Mark replied</button>)}
                        {r.status !== "OPTED_OUT" && <button className="btn-ghost !py-1 text-xs" onClick={() => window.confirm(`Never email ${r.name} again?`) && flag(r.id, "opt-out")}>Do not email</button>}
                      </div>
                    </td>
                  </tr>
                  {open === r.id && r.body && (
                    <tr className="border-b border-cream/10 bg-obsidian/60">
                      <td colSpan={8} className="px-4 py-4">
                        <div className="mb-1 text-xs text-cream/50">To {r.email} · {day(r.sentAt)}</div>
                        <div className="mb-2 font-medium">{r.subject}</div>
                        <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-cream/85">{r.body}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
