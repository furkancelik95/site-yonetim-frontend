// Şeffaflık raporu görünümü (RAP-02, K32) — yönetim ve sakin ekranı ortak. Kişi/bölüm bilgisi yok.

import type { Schemas } from "../api/types";
import { formatMoney } from "../lib/format";
import { Kpi } from "./ui";

type Content = Schemas["TransparencyContent"];

const pct = (v: string) => `%${v.replace(".", ",")}`;

export function TransparencyContentView({ c, note }: { c: Content; note?: string | null }) {
  return (
    <div className="stack" style={{ gap: "var(--s-3)" }}>
      <div className="grid grid--kpi">
        <Kpi label="Gelir" value={formatMoney(c.income)} />
        <Kpi label="Gider" value={formatMoney(c.expense)} />
        <Kpi label="Fark" value={formatMoney(c.difference)} />
        {c.cash_balance != null && <Kpi label="Kasa + banka" value={formatMoney(c.cash_balance)} />}
      </div>
      {c.collection && (
        <div className="small">Aidat tahsilatı: kesilen {formatMoney(c.collection.charged)}, tahsil edilen {formatMoney(c.collection.collected)} · oran <strong>{pct(c.collection.rate)}</strong></div>
      )}
      {c.categories && (
        c.categories.length === 0 ? <p className="small muted mb-0">Bu dönemde gider yok.</p> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Gider kategorileri</caption>
            <thead><tr><th scope="col">Kategori</th><th scope="col" className="num">Tutar</th><th scope="col" className="num">Kayıt</th><th scope="col" className="num">Pay</th></tr></thead>
            <tbody>{c.categories.map((x) => <tr key={x.name}><td className="cell-main">{x.name}</td><td className="num">{formatMoney(x.amount)}</td><td className="num">{x.count}</td><td className="num">{pct(x.share)}</td></tr>)}</tbody>
          </table></div>
        )
      )}
      {note && <p className="small mb-0" style={{ whiteSpace: "pre-wrap" }}>{note}</p>}
    </div>
  );
}
