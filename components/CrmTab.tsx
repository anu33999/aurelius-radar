"use client";

import { useEffect, useRef, useState } from "react";
import { api, fmtDate, placeOf } from "@/lib/client";
import { PIPELINE_STAGES, type AuditResult, type BusinessDTO, type PipelineStage, type Priority } from "@/lib/types";
import { CatalogueImport } from "./CatalogueImport";
import { ExportButtons } from "./ExportButtons";
import { Badge, CopyButton, SectionTitle } from "./ui";
import { PlanPanel } from "./PlanPanel";
import { StarButton } from "./StarButton";
import { gmailLink, telHref, waLink } from "@/lib/outreach";
import { FLAG_LABEL, type ProspectFlag } from "@/lib/leads/score";

const FOLLOW_UP_MS = 48 * 3600 * 1000;
/** A lead that has been contacted (not New / closed) and has not been touched for 48 hours. */
export function needsFollowUp(b: BusinessDTO, now = Date.now()): boolean {
  if (b.pipelineStage === "LEAD" || b.pipelineStage === "CLOSED_WON" || b.pipelineStage === "CLOSED_LOST") return false;
  const last = b.lastContactedAt ? new Date(b.lastContactedAt).getTime() : null;
  return last === null || now - last > FOLLOW_UP_MS;
}

const PRIORITIES: Priority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const prioTone = (p: Priority) => (p === "CRITICAL" ? "crimson" : p === "HIGH" ? "amber" : p === "MEDIUM" ? "gold" : "slate") as "crimson" | "amber" | "gold" | "slate";

export function CrmTab({
  businesses,
  patch,
  onAudit,
  reload,
  initialOpenId,
}: {
  businesses: BusinessDTO[];
  patch: (id: string, p: Partial<BusinessDTO>) => Promise<void>;
  onAudit: (b: BusinessDTO) => void;
  reload: () => void;
  initialOpenId?: string | null;
}) {
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [onlyFollowUp, setOnlyFollowUp] = useState(false);
  const overdue = businesses.filter((b) => needsFollowUp(b)).length;
  const [showLost, setShowLost] = useState(true);
  const open = businesses.find((b) => b.id === openId) ?? null;

  const cols = PIPELINE_STAGES.filter((s) => showLost || s.key !== "CLOSED_LOST");
  // A big directory puts thousands of imports in "New"; draw each column 100 cards at a time.
  const [limits, setLimits] = useState<Record<string, number>>({});
  const limitOf = (key: string) => limits[key] ?? 100;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle sub="Move a lead through the pipeline with the dropdown on each card. Click a card for notes, contact edits and copyable pitches.">
          Client CRM & Outreach Pipeline
        </SectionTitle>
        <div className="flex flex-wrap items-center gap-4">
          <CatalogueImport />
          <ExportButtons scope="crm" />
          <button className={`rounded-full border px-3 py-1 text-xs ${overdue > 0 ? "border-crimson/60 bg-crimson/10 text-crimson" : "border-cream/20 text-cream/50"} ${onlyFollowUp ? "ring-2 ring-crimson/40" : ""}`} onClick={() => setOnlyFollowUp((v) => !v)} title="Contacted leads with no activity for 48 hours">
            {overdue} need follow-up {onlyFollowUp ? "(filtering)" : ""}
          </button>
        <label className="flex items-center gap-2 text-xs text-cream/60">
          <input type="checkbox" checked={showLost} onChange={(e) => setShowLost(e.target.checked)} /> Show Lost column
        </label>
        </div>
      </div>

      <div className="grid gap-3 overflow-x-auto pb-2" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(240px, 1fr))` }}>
        {cols.map((col) => {
          const items = businesses.filter((b) => b.pipelineStage === col.key && (!onlyFollowUp || needsFollowUp(b)));
          return (
            <div key={col.key} className="rounded-xl border border-cream/10 bg-matte/60 p-2.5">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gold">{col.label}</span>
                <span className="text-xs text-cream/45">{items.length}</span>
              </div>
              <div className="max-h-[68vh] space-y-2 overflow-y-auto pr-0.5">
                {items.slice(0, limitOf(col.key)).map((b) => (
                  <div key={b.id} className="card cursor-pointer p-3 transition hover:border-gold/50" onClick={() => setOpenId(b.id)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium leading-tight">{b.name}</div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" title={b.shortlisted ? "Remove from shortlist" : "Add to shortlist"} className={`text-base leading-none ${b.shortlisted ? "text-gold" : "text-cream/40 hover:text-gold"}`} onClick={(e) => { e.stopPropagation(); patch(b.id, { shortlisted: !b.shortlisted }); }}>{b.shortlisted ? "★" : "☆"}</button>
                        <Badge tone={prioTone(b.priority)}>{b.priority[0] + b.priority.slice(1).toLowerCase()}</Badge>
                      </div>
                    </div>
                    <div className="mt-1 text-[12px] text-cream/55">{placeOf(b)}{b.industry ? ` · ${b.industry}` : ""}</div>
                    {b.phone && (
                      <div className="mt-1 text-[12px] text-cream/75" onClick={(e) => e.stopPropagation()}>
                        📞 <a className="hover:text-gold" href={telHref(b.phone, b.country) ?? undefined}>{b.phone}</a>
                        {b.phoneSource === "WEB_SEARCH" && <span className="ml-1 text-[10px] text-amber" title="Read from web search results. Confirm it before relying on it.">(web · verify)</span>}
                      </div>
                    )}
                    {(b.flags.length > 0 || needsFollowUp(b)) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {needsFollowUp(b) && <Badge tone="crimson">Follow up now</Badge>}
                        {b.flags.filter((f) => f !== "NO_PHONE").slice(0, 2).map((f) => (
                          <Badge key={f} tone={f === "NO_WEBSITE" ? "crimson" : "amber"}>{FLAG_LABEL[f as ProspectFlag] ?? f}</Badge>
                        ))}
                      </div>
                    )}
                    {b.monthlyBudget && <div className="text-[12px] text-gold/80">Budget: {b.monthlyBudget}</div>}
                    <select
                      className="input mt-2 !py-1 text-xs"
                      value={b.pipelineStage}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => patch(b.id, { pipelineStage: e.target.value as PipelineStage })}
                    >
                      {PIPELINE_STAGES.map((s) => (
                        <option key={s.key} value={s.key}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
                {items.length > limitOf(col.key) && (
                  <button className="btn-ghost w-full !py-1 text-xs" onClick={() => setLimits((l) => ({ ...l, [col.key]: limitOf(col.key) + 100 }))}>
                    Show more ({items.length - limitOf(col.key)} hidden)
                  </button>
                )}
                {items.length === 0 && <p className="px-1 py-3 text-xs text-cream/35">Empty</p>}
              </div>
            </div>
          );
        })}
      </div>

      {open && <Drawer key={open.id} b={open} patch={patch} onClose={() => setOpenId(null)} onAudit={onAudit} reload={reload} />}
    </div>
  );
}

function InlineField({ label, value, onSave, placeholder }: { label: string; value: string | null; onSave: (v: string | null) => void; placeholder?: string }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input"
        value={v}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => (v.trim() || null) !== (value ?? null) && onSave(v.trim() || null)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </div>
  );
}

function Drawer({
  b,
  patch,
  onClose,
  onAudit,
  reload,
}: {
  b: BusinessDTO;
  patch: (id: string, p: Partial<BusinessDTO>) => Promise<void>;
  onClose: () => void;
  onAudit: (b: BusinessDTO) => void;
  reload: () => void;
}) {
  const [notes, setNotes] = useState(b.notes ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const first = useRef(true);
  const [thread, setThread] = useState<{ id: string; content: string; author: string; createdAt: string }[]>([]);
  const [newNote, setNewNote] = useState("");
  const [audit, setAudit] = useState<AuditResult | null>(null);

  // Auto-save the free-text notes 800ms after typing stops.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveState("saving");
    const t = setTimeout(async () => {
      await patch(b.id, { notes });
      setSaveState("saved");
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  useEffect(() => {
    api<{ notes: typeof thread }>(`/api/notes?businessId=${b.id}`).then((r) => setThread(r.notes)).catch(() => undefined);
    if (b.lastAuditedAt) api<{ audit: AuditResult | null }>(`/api/audit?businessId=${b.id}`).then((r) => setAudit(r.audit)).catch(() => undefined);
  }, [b.id, b.lastAuditedAt]);

  async function addNote() {
    if (!newNote.trim()) return;
    const res = await api<{ note: (typeof thread)[number] }>("/api/notes", { method: "POST", body: JSON.stringify({ businessId: b.id, content: newNote }) });
    setThread([res.note, ...thread]);
    setNewNote("");
    reload();
  }

  async function remove() {
    if (!confirm(`Delete ${b.name} and all its notes? This cannot be undone.`)) return;
    await api(`/api/businesses?id=${b.id}`, { method: "DELETE" });
    onClose();
    reload();
  }

  return (
    <div className="fixed inset-0 z-[1000] flex justify-end bg-black/60" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto border-l border-gold/30 bg-matte p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="h-serif text-xl">{b.name}</h3>
            <p className="text-xs text-cream/55">{placeOf(b)}{b.industry ? ` · ${b.industry}` : ""} · added {fmtDate(b.createdAt)}</p>
          </div>
          <button className="btn-ghost !py-1 text-xs" onClick={onClose}>Close</button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Stage</label>
            <select className="input" value={b.pipelineStage} onChange={(e) => patch(b.id, { pipelineStage: e.target.value as PipelineStage })}>
              {PIPELINE_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Priority</label>
            <select className="input" value={b.priority} onChange={(e) => patch(b.id, { priority: e.target.value as Priority })}>
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <InlineField label="Phone" value={b.phone} placeholder="+91…" onSave={(v) => patch(b.id, { phone: v })} />
          <InlineField label="Email" value={b.email} onSave={(v) => patch(b.id, { email: v })} />
          <InlineField label="Website" value={b.website} placeholder="https://" onSave={(v) => patch(b.id, { website: v })} />
          <InlineField label="Monthly budget" value={b.monthlyBudget} placeholder="e.g. $3,000 or ₹50,000" onSave={(v) => patch(b.id, { monthlyBudget: v })} />
          <InlineField label="Estimated revenue" value={b.estimatedRevenue} placeholder="e.g. $10k-50k/mo" onSave={(v) => patch(b.id, { estimatedRevenue: v })} />
          <InlineField label="Tech stack" value={b.techStack} onSave={(v) => patch(b.id, { techStack: v })} />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <StarButton on={b.shortlisted} onToggle={() => patch(b.id, { shortlisted: !b.shortlisted })} />
          <button className="btn-gold !py-1.5" onClick={() => { onAudit(b); onClose(); }}>{b.lastAuditedAt ? "Re-run audit" : "Run audit"}</button>
          {b.readinessScore !== null && <Badge tone="cream">Readiness {b.readinessScore}</Badge>}
          {b.opportunityScore !== null && <Badge tone="gold">Opportunity {b.opportunityScore}</Badge>}
          {b.phone && <a className="btn-ghost !py-1.5 text-xs" href={telHref(b.phone, b.country) ?? undefined}>Call</a>}
          {gmailLink(b.email) && <a className="btn-ghost !py-1.5 text-xs" href={gmailLink(b.email, `Quick idea for ${b.name}`) ?? undefined} target="_blank" rel="noreferrer">Gmail ↗</a>}
          {waLink(b.whatsapp, "", b.country) && <a className="btn-ghost !py-1.5 text-xs" href={waLink(b.whatsapp, "", b.country) ?? undefined} target="_blank" rel="noreferrer">WhatsApp ↗</a>}
          {b.pipelineStage !== "LEAD" && <button className="btn-ghost !py-1.5 text-xs" onClick={() => patch(b.id, { lastContactedAt: new Date().toISOString() })}>Mark contacted today</button>}
        </div>

        <div className="mt-3 text-[12px] text-cream/55">
          {b.lastContactedAt ? `Last contacted ${fmtDate(b.lastContactedAt)}` : "Not contacted yet"}
          {b.googleRating != null && ` · ${b.googleRating.toFixed(1)}★${b.reviewCount != null ? ` (${b.reviewCount} reviews)` : ""}`}
          {b.instagramUrl && <> · <a className="text-gold hover:underline" href={b.instagramUrl} target="_blank" rel="noreferrer">Instagram</a></>}
          {b.linkedinUrl && <> · <a className="text-gold hover:underline" href={b.linkedinUrl} target="_blank" rel="noreferrer">LinkedIn</a></>}
        </div>

        <div className="mt-5">
          <div className="mb-1 flex items-center justify-between">
            <label className="label !mb-0">Notes (auto-saves)</label>
            <span className="text-[11px] text-cream/45">{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : ""}</span>
          </div>
          <textarea className="input min-h-[110px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Call outcomes, objections, next step…" />
        </div>

        <div className="mt-5">
          <label className="label">Pitch summary</label>
          <div className="flex items-start gap-2">
            <div className="input min-h-[40px] flex-1 text-cream/80">{b.pitchSummary ?? <span className="text-cream/35">Run an audit to generate one.</span>}</div>
            {b.pitchSummary && <CopyButton text={b.pitchSummary} />}
          </div>
        </div>

        <div className="mt-6 border-t border-cream/10 pt-5">
          <PlanPanel b={b} />
        </div>

        {audit && (
          <div className="mt-5 space-y-2">
            <label className="label">Copy audit-based pitch drafts</label>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={`Subject: ${audit.pitch.coldEmail.subject}\n\n${audit.pitch.coldEmail.body}`} label="Cold email" />
              <CopyButton text={audit.pitch.whatsapp} label="WhatsApp DM" />
              <CopyButton text={audit.pitch.linkedinInMail} label="LinkedIn InMail" />
              <CopyButton text={audit.pitch.coldCallScript} label="Call script" />
              <CopyButton text={audit.pitch.discoveryQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")} label="Discovery Qs" />
            </div>
          </div>
        )}

        <div className="mt-6">
          <label className="label">Activity ({thread.length})</label>
          <div className="flex gap-2">
            <input className="input" placeholder="Add a note and press Enter" value={newNote} onChange={(e) => setNewNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} />
            <button className="btn-ghost" onClick={addNote}>Add</button>
          </div>
          <ul className="mt-3 space-y-2">
            {thread.map((n) => (
              <li key={n.id} className="rounded-lg border border-cream/10 bg-obsidian p-2.5 text-[13px]">
                <div className="text-[11px] text-cream/45">{n.author} · {fmtDate(n.createdAt)}</div>
                <p className="mt-0.5 whitespace-pre-wrap text-cream/85">{n.content}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 border-t border-cream/10 pt-4">
          <button className="text-xs text-crimson hover:underline" onClick={remove}>Delete this business</button>
        </div>
      </div>
    </div>
  );
}
