/** Tarayıcıda CSV indirir (Excel'de Türkçe karakter bozulmasın diye BOM + noktalı virgül). */
export function downloadCsv(name: string, rows: readonly (readonly (string | number | null | undefined)[])[]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const url = URL.createObjectURL(new Blob(["﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
