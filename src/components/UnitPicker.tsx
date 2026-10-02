import { useId, useState } from "react";
import { X } from "lucide-react";
import { useSiteGet } from "../api/hooks";
import type { Page, Schemas } from "../api/types";
import { useDebounced } from "../lib/hooks";

type Unit = Schemas["UnitListItem"];
type Lookup = Schemas["LookupOut"];

export interface PickedUnit {
  id: string;
  name: string;
  occupants?: string[];
}

/**
 * Aramalı bölüm seçici. Binlerce bölümlü sitede açılır liste kullanılamaz.
 * source="lookup": güvenlik görevlisi için kısıtlı arama (yalnız bölüm ve oturan adı — KVKK).
 */
export function UnitPicker({
  label,
  value,
  onChange,
  source = "units",
  allowEmptyLabel,
  error,
}: {
  label: string;
  value: PickedUnit | null;
  onChange: (u: PickedUnit | null) => void;
  source?: "units" | "lookup";
  allowEmptyLabel?: string;
  error?: string;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 250);
  const units = useSiteGet<Page<Unit>>("/units", { q, page_size: 10 }, { enabled: source === "units" && q.length > 0 });
  const lookup = useSiteGet<Lookup[]>("/units/lookup", { q }, { enabled: source === "lookup" && q.length > 0 });
  const results: PickedUnit[] =
    source === "units"
      ? (units.data?.items ?? []).map((u) => ({ id: u.id, name: u.display_name, occupants: [...u.tenant_names, ...u.owner_names] }))
      : (lookup.data ?? []).map((u) => ({ id: u.unit_id, name: u.unit_name, occupants: u.occupants }));

  if (value) {
    return (
      <div className="field">
        <span className="field__label" id={`${id}-l`}>{label}</span>
        <div className="row" style={{ gap: "var(--s-2)", minHeight: 44 }} aria-labelledby={`${id}-l`}>
          <span className="badge badge--info" style={{ fontSize: ".875rem", padding: "6px 10px" }}>
            {value.name}{value.occupants?.length ? ` · ${value.occupants[0]}` : ""}
          </span>
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => onChange(null)}>
            <X aria-hidden="true" /> Değiştir
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="field__input"
        type="search"
        autoComplete="off"
        placeholder="Bölüm no ya da oturan adı (ör. A-4)"
        value={text}
        aria-invalid={error ? true : undefined}
        onChange={(e) => setText(e.target.value)}
      />
      {allowEmptyLabel && !q && <span className="field__hint">Boş bırakılırsa: {allowEmptyLabel}</span>}
      {error && <span className="field__error" role="alert">{error}</span>}
      {q && (
        <div className="card" style={{ marginTop: "var(--s-1)", maxHeight: 260, overflowY: "auto" }}>
          {results.length === 0 ? (
            <p className="small muted" style={{ padding: "var(--s-3)", margin: 0 }}>{units.isFetching || lookup.isFetching ? "Aranıyor…" : "Uyan bölüm yok."}</p>
          ) : (
            results.map((u) => (
              <button
                key={u.id}
                type="button"
                className="demo-account"
                style={{ borderRadius: 0, border: 0, borderBottom: "1px solid var(--line)", width: "100%" }}
                onClick={() => { onChange(u); setText(""); }}
              >
                <span className="demo-account__row">
                  <span className="demo-account__role">{u.name}</span>
                  <span className="demo-account__name">{u.occupants?.join(", ") || "—"}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
