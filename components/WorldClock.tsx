"use client";

import { useEffect, useMemo, useState } from "react";
import { HUBS } from "@/lib/hubs";

/** One tile per country + time zone (the US and Canada span several), listing the markets in it. */
interface Zone {
  country: string;
  tz: string;
  cities: string[];
}

function zones(): Zone[] {
  const byKey = new Map<string, Zone>();
  for (const h of HUBS) {
    if (!h.tz) continue;
    const key = `${h.country}|${h.tz}`;
    const z = byKey.get(key) ?? { country: h.country, tz: h.tz, cities: [] };
    z.cities.push(h.name);
    byKey.set(key, z);
  }
  return [...byKey.values()];
}

function local(now: Date, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "shortOffset" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const hour = Number(parts.hour);
  const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  const open = !weekend && hour >= 9 && hour < 18;
  const status = open ? "Business hours" : weekend ? "Weekend" : hour >= 18 && hour < 22 ? "Evening" : "Night";
  // "GMT+5:30" -> minutes, used to sort tiles west to east.
  const m = /GMT([+-])(\d+)(?::(\d+))?/.exec(parts.timeZoneName ?? "");
  const offsetMin = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
  return { time: `${parts.hour}:${parts.minute}`, weekday: parts.weekday, offset: (parts.timeZoneName ?? "GMT").replace("GMT", "UTC"), open, status, offsetMin };
}

export default function WorldClock() {
  // Rendered only after mount so server and browser clocks can't disagree during hydration.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);
  const list = useMemo(() => zones(), []);
  if (!now) return null;

  const rows = list.map((z) => ({ ...z, ...local(now, z.tz) })).sort((a, b) => a.offsetMin - b.offsetMin);
  const openCount = rows.filter((r) => r.open).length;

  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-cream">Local time in every market</h3>
        <span className="text-xs text-slate">
          {openCount} of {rows.length} in business hours now (Mon-Fri, 9:00-18:00 local)
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {rows.map((r) => (
          <div key={`${r.country}|${r.tz}`} className={`rounded-lg border px-3 py-2 ${r.open ? "border-emerald/50 bg-emerald/10" : "border-cream/10 bg-cream/5"}`}>
            <div className="truncate text-xs text-slate" title={r.cities.join(", ")}>
              {r.country}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-semibold tabular-nums text-cream">{r.time}</span>
              <span className="text-xs text-slate">{r.weekday}</span>
            </div>
            <div className="truncate text-[11px] text-slate" title={r.cities.join(", ")}>
              {r.cities.join(", ")} · {r.offset}
            </div>
            <div className={`mt-0.5 text-[11px] font-medium ${r.open ? "text-emerald" : "text-slate"}`}>{r.status}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
