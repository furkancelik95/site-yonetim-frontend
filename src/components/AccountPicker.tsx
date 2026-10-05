import { useId, useState } from "react";
import { X } from "lucide-react";
import { useSiteGet } from "../api/hooks";
import type { Page, Schemas } from "../api/types";
import { formatMoney } from "../lib/format";
import { accountKind } from "../lib/labels";
import { useDebounced } from "../lib/hooks";

type Account = Schemas["site_yonetim__api__v1__payments__AccountOut"];

export interface PickedAccount {
  id: string;
  reference_code: string;
  unit_name: string;
  person_name: string | null;
  balance: string;
  kind?: string;
}

/** Aramalı cari hesap seçici (bölüm, kişi ya da referans kodu). Etiket gizlenebilir (tablo hücresinde). */
export function AccountPicker({
  label,
  value,
  onChange,
  hideLabel,
  error,
}: {
  label: string;
  value: PickedAccount | null;
  onChange: (a: PickedAccount | null) => void;
  hideLabel?: boolean;
  error?: string;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 250);
  const r = useSiteGet<Page<Account>>("/accounts", { q, page_size: 8 }, { enabled: q.length > 0 });

  if (value) {
    return (
      <div className="row" style={{ gap: "var(--s-2)", flexWrap: "nowrap", minHeight: 40 }}>
        <span className="small" style={{ minWidth: 0 }}>
          <span className="strong">{value.unit_name}</span> · <span className="mono xs">{value.reference_code}</span>
          {value.person_name && <span className="muted"> · {value.person_name}</span>}
        </span>
        <button className="btn btn--ghost btn--sm btn--icon" type="button" aria-label={`${label}: seçimi kaldır`} onClick={() => onChange(null)}>
          <X aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="field" style={{ position: "relative" }}>
      <label className={hideLabel ? "visually-hidden" : "field__label"} htmlFor={id}>{label}</label>
      <input
        id={id}
        className="field__input"
        type="search"
        autoComplete="off"
        placeholder="Bölüm, kişi ya da referans"
        value={text}
        aria-invalid={error ? true : undefined}
        onChange={(e) => setText(e.target.value)}
      />
      {error && <span className="field__error" role="alert">{error}</span>}
      {q && (
        <div className="card" style={{ position: "absolute", zIndex: 20, top: "100%", left: 0, right: 0, marginTop: 4, maxHeight: 280, overflowY: "auto" }}>
          {(r.data?.items ?? []).length === 0 ? (
            <p className="small muted" style={{ padding: "var(--s-3)", margin: 0 }}>{r.isFetching ? "Aranıyor…" : "Uyan hesap yok."}</p>
          ) : (
            r.data!.items.map((a) => (
              <button
                key={a.id}
                type="button"
                className="demo-account"
                style={{ borderRadius: 0, border: 0, borderBottom: "1px solid var(--line)", width: "100%" }}
                onClick={() => { onChange({ id: a.id, reference_code: a.reference_code, unit_name: a.unit_name, person_name: a.person_name, balance: a.balance, kind: a.kind }); setText(""); }}
              >
                <span className="demo-account__row">
                  <span className="demo-account__role">{a.unit_name} · {accountKind(a.kind)}</span>
                  <span className="demo-account__name">{a.person_name ?? "—"}</span>
                </span>
                <span className="demo-account__desc"><span className="mono">{a.reference_code}</span> · bakiye {formatMoney(a.balance)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
