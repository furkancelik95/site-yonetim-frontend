import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { Building2, Link2, Search } from "lucide-react";
import { useMe } from "../auth/AuthContext";
import { trLower } from "../lib/format";

type Item = { label: string; to: string; group: string; kind: "site" | "page" };

/**
 * Üst çubuktaki hap biçimli arama: sayfa ve sitelere hızlı gidiş (Ctrl+K).
 * Liste kenar çubuğundaki menüden okunur — izin ve modül süzgeci orada zaten uygulanmış
 * olduğundan kullanıcı göremeyeceği bir sayfaya buradan da gidemez.
 */
export function QuickSearch() {
  const me = useMe();
  const navigate = useNavigate();
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [sel, setSel] = useState(0);

  function open() {
    const links = [...document.querySelectorAll<HTMLAnchorElement>(".sidebar .navlink")]
      .map((a) => ({
        label: a.textContent?.trim() ?? "",
        to: a.getAttribute("href") ?? "/",
        group: a.closest(".sidebar__group")?.querySelector(".sidebar__label")?.textContent?.trim() ?? "Menü",
        kind: "page" as const,
      }))
      .filter((x) => x.label && x.to.startsWith("/"));
    const sites: Item[] = me.sites.map((s) => ({ label: s.name, to: `/s/${s.slug}`, group: "Siteler", kind: "site" }));
    const seen = new Set<string>();
    const all = [...sites, ...links].filter((x) => (seen.has(x.to) ? false : (seen.add(x.to), true)));
    setItems(all);
    setQ("");
    setSel(0);
    ref.current?.showModal();
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (ref.current?.open) ref.current.close();
        else open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const filtered = useMemo(() => {
    const n = trLower(q.trim());
    const list = n ? items.filter((i) => trLower(i.label).includes(n) || trLower(i.group).includes(n)) : items;
    return list.slice(0, 40);
  }, [q, items]);

  function go(it: Item) {
    ref.current?.close();
    navigate(it.to);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(filtered.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter" && filtered[sel]) {
      e.preventDefault();
      go(filtered[sel]);
    }
  }

  return (
    <>
      <button type="button" className="searchpill" onClick={open} aria-label="Hızlı arama (Ctrl+K)">
        <span className="searchpill__text">Sayfa ya da site ara…</span>
        <kbd aria-hidden="true">Ctrl K</kbd>
        <span className="searchpill__go" aria-hidden="true">
          <Search />
        </span>
      </button>
      <dialog
        ref={ref}
        className="dialog palette"
        aria-label="Hızlı arama"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <input
          ref={inputRef}
          className="palette__input"
          placeholder="Nereye gitmek istersiniz?"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={filtered[sel] ? `pal-${sel}` : undefined}
          aria-autocomplete="list"
        />
        {filtered.length === 0 ? (
          <div className="palette__empty">Eşleşen sayfa yok.</div>
        ) : (
          <ul className="palette__list" id="palette-list" role="listbox">
            {filtered.map((it, i) => {
              const showGroup = i === 0 || filtered[i - 1]?.group !== it.group;
              return (
                <li key={`${it.to}-${i}`}>
                  {showGroup && <div className="palette__group">{it.group}</div>}
                  <button
                    type="button"
                    role="option"
                    id={`pal-${i}`}
                    aria-selected={i === sel}
                    className="palette__item"
                    onMouseEnter={() => setSel(i)}
                    onClick={() => go(it)}
                  >
                    {it.kind === "site" ? <Building2 aria-hidden="true" /> : <Link2 aria-hidden="true" />}
                    <span>{it.label}</span>
                    <span className="palette__meta">{it.group}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="palette__foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> gez
          </span>
          <span>
            <kbd>Enter</kbd> aç
          </span>
          <span>
            <kbd>Esc</kbd> kapat
          </span>
        </div>
      </dialog>
    </>
  );
}
