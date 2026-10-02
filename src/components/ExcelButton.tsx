import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { download } from "../api/client";
import { useToast } from "./toast";

type Query = Record<string, string | number | boolean | null | undefined>;

/** Excel indirme. Yetki başlığı gerektiği için düz <a href> yerine istekle indirilir. */
export function ExcelButton({ path, query, fileName, label = "Excel" }: { path: string; query?: Query; fileName: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <button
      className="btn"
      type="button"
      disabled={busy}
      aria-busy={busy || undefined}
      onClick={async () => {
        setBusy(true);
        try {
          await download(path, query, fileName);
        } catch {
          toast("Dosya indirilemedi. Tekrar deneyin.", "danger");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <span className="spinner" aria-hidden="true" /> : <FileSpreadsheet aria-hidden="true" />} {label}
    </button>
  );
}
