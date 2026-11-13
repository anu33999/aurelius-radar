"use client";

/** Toggle for adding or removing an item from the Shortlist. */
export function StarButton({ on, onToggle, label = "Shortlist" }: { on: boolean; onToggle: () => void; label?: string }) {
  return (
    <button
      type="button"
      title={on ? "Remove from shortlist" : "Add to shortlist"}
      aria-pressed={on}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition ${on ? "border-gold bg-gold/15 text-gold" : "border-cream/20 text-cream/70 hover:border-gold/60 hover:text-gold"}`}
    >
      <span aria-hidden>{on ? "★" : "☆"}</span> {on ? "Shortlisted" : label}
    </button>
  );
}
