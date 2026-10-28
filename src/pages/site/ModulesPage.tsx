import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, CalendarCheck, CalendarDays, Car, FolderOpen, IdCard, Lock, Megaphone, Package, ShieldCheck, ToggleLeft, ToggleRight, UserCheck, Vote, Wallet, Wrench } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { Alert, Badge, ErrorState, IconChip, Kpi, Loading, PageHead } from "../../components/ui";
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

/** Modül → ikon (dekoratif; ad yanında yazılı) */
const ICONS: Record<string, typeof Wallet> = {
  finance: Wallet,
  announcements: Megaphone,
  requests: Wrench,
  visitors: UserCheck,
  packages: Package,
  documents: FolderOpen,
  reservations: CalendarCheck,
  valet: Car,
  "general-assembly": CalendarDays,
  surveys: Vote,
  staff: IdCard,
  portfolio: BarChart3,
};

export function ModulesPage() {
  const { site } = useSite();
  const qc = useQueryClient();
  const q = useSiteGet<Mod[]>("/modules");

  return (
    <div className="stack">
      <PageHead title="Modüller" subtitle="Modülü kapatmak veriyi silmez; yeniden açınca kaldığı yerden devam eder." />
      {!q.isError && (
        <div className={`grid grid--kpi${q.data ? " rise" : ""}`}>
          {q.data ? (
            <>
              <Kpi label="Açık modül" tone="ok" icon={<ToggleRight aria-hidden="true" />} value={q.data.filter((m) => m.enabled && m.available).length} note={`${q.data.length} modülden`} />
              <Kpi label="Kapalı" icon={<ToggleLeft aria-hidden="true" />} value={q.data.filter((m) => m.in_plan && !m.enabled).length} note="planda var, açılabilir" />
              <Kpi label="Planda yok" icon={<Lock aria-hidden="true" />} value={q.data.filter((m) => !m.in_plan).length} note="plan değişikliği gerekir" />
              <Kpi label="Çekirdek" icon={<ShieldCheck aria-hidden="true" />} value={q.data.filter((m) => m.is_core).length} note="kapatılamaz" />
            </>
          ) : (
            [0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" aria-hidden="true" />)
          )}
        </div>
      )}
      <Alert tone="info">Planınızda olmayan modüller kilitli görünür. Plan değişikliği için bizimle iletişime geçin.</Alert>
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <div className="modules">
          {q.data.map((m) => {
            const Icon = ICONS[m.key] ?? Wrench;
            const on = m.enabled && m.available;
            return (
              <div key={m.key} className={`module${on ? " module--on" : ""}${!m.in_plan ? " module--locked" : ""}`}>
                <IconChip tone={!m.in_plan ? "muted" : on ? undefined : "muted"}><Icon /></IconChip>
                <div className="module__main">
                  <div className="module__name">{moduleName(m.key)}</div>
                  <div className="module__desc">{DESCRIPTIONS[m.key] ?? ""}</div>
                  <div style={{ marginTop: "var(--s-2)" }}>
                    {m.is_core ? <Badge tone="info">Çekirdek</Badge> : !m.in_plan ? <Badge>Planda yok</Badge> : m.enabled ? <Badge tone="ok">Açık</Badge> : <Badge>Kapalı</Badge>}
                  </div>
                </div>
                <ModuleSwitch m={m} onDone={() => qc.invalidateQueries({ queryKey: siteKey(site.slug) })} />
              </div>
            );
          })}
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
