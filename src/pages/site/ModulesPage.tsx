import { useQueryClient } from "@tanstack/react-query";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { Alert, Badge, ErrorState, Loading, PageHead } from "../../components/ui";
import { siteKey } from "../../layouts/guards";
import { moduleName } from "../../lib/labels";
import { useSite } from "../../site/SiteContext";

type Mod = Schemas["ModuleOut"];

const DESCRIPTIONS: Record<string, string> = {
  finance: "Tahakkuk, tahsilat, borçlular, gider, kasa ve raporlar. Çekirdek modül, kapatılamaz.",
  announcements: "Sakinlere duyuru ve okundu bilgisi.",
  requests: "Arıza, şikâyet ve öneri talepleri.",
  visitors: "Güvenlikte ziyaretçi kaydı.",
  packages: "Güvenlikte kargo kaydı ve teslim kodu.",
  documents: "Sitenin belgeleri.",
  reservations: "Sosyal tesis rezervasyonu.",
  valet: "Vale hizmeti.",
  "general-assembly": "Genel kurul ve karar defteri.",
  surveys: "Anketler.",
  staff: "Personel takibi.",
  portfolio: "Birden çok sitenin karşılaştırması.",
};

export function ModulesPage() {
  const { site } = useSite();
  const qc = useQueryClient();
  const q = useSiteGet<Mod[]>("/modules");

  return (
    <div className="stack">
      <PageHead title="Modüller" subtitle="Modülü kapatmak veriyi silmez; yeniden açınca kaldığı yerden devam eder." />
      <Alert tone="info">Planınızda olmayan modüller kilitli görünür. Plan değişikliği için bizimle iletişime geçin.</Alert>
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <div className="modules">
          {q.data.map((m) => (
            <div key={m.key} className={`module${m.enabled && m.available ? " module--on" : ""}${!m.in_plan ? " module--locked" : ""}`}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="module__name">{moduleName(m.key)}</div>
                <div className="module__desc">{DESCRIPTIONS[m.key] ?? ""}</div>
                <div style={{ marginTop: "var(--s-2)" }}>
                  {m.is_core ? <Badge tone="info">Çekirdek</Badge> : !m.in_plan ? <Badge>Planda yok</Badge> : m.enabled ? <Badge tone="ok">Açık</Badge> : <Badge>Kapalı</Badge>}
                </div>
              </div>
              <ModuleSwitch m={m} onDone={() => qc.invalidateQueries({ queryKey: siteKey(site.slug) })} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Kapatmak veri silmediği için onay sorulmaz (referansla aynı); çekirdek ve planda olmayan kilitli. */
function ModuleSwitch({ m, onDone }: { m: Mod; onDone: () => void }) {
  const t = useSiteMutation<Record<string, never>, Mod>("POST", `/modules/${m.key}/toggle`, { onSuccess: onDone });
  const locked = m.is_core || !m.in_plan;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", minHeight: 44 }}>
      <input
        type="checkbox"
        className="switch"
        checked={m.enabled}
        disabled={locked || t.isPending}
        aria-label={`${moduleName(m.key)} modülünü ${m.enabled ? "kapat" : "aç"}`}
        onChange={() => t.mutate({})}
      />
    </span>
  );
}
