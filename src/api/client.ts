// Backend ile tek konuşma noktası. Kurallar: backend docs/06 §1, bu repo docs/03.
//
// - Erişim jetonu yalnız bellekte durur (localStorage'a yazılmaz — XSS'te çalınmasın).
// - Yenileme jetonu httpOnly çerezde; backend yönetir. 401 gelince bir kez /auth/refresh denenir.
// - Hata gövdesi {error: {code, message, fields}} → ApiError.

const BASE = "/api/v1";

export type FieldErrors = Record<string, string>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: FieldErrors | null;

  constructor(status: number, code: string, message: string, fields: FieldErrors | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function hasAccessToken() {
  return accessToken !== null;
}

/** Yenileme de başarısız olursa çağrılır (oturum düştü → giriş ekranı). */
export function setSessionLostHandler(handler: (() => void) | null) {
  onSessionLost = handler;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  query?: Query;
  /** JSON gövde. */
  body?: unknown;
  /** multipart gövde (dosya yükleme). */
  form?: FormData;
  /** Para yazan istekler: çift gönderimde ikinci kayıt oluşmaz (docs/06 §1.5). */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Query) {
  const url = new URL(BASE + path, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return url.pathname + url.search;
}

async function toError(res: Response): Promise<ApiError> {
  let code = "http_" + res.status;
  let message = defaultMessage(res.status);
  let fields: FieldErrors | null = null;
  try {
    const body = await res.json();
    if (body?.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      fields = body.error.fields ?? null;
    }
  } catch {
    // gövde JSON değil — varsayılan mesaj kalır
  }
  return new ApiError(res.status, code, message, fields);
}

function defaultMessage(status: number) {
  if (status === 401) return "Oturumunuz sona erdi. Lütfen yeniden giriş yapın.";
  if (status === 403) return "Bu işlem için yetkiniz yok.";
  if (status === 404) return "Aradığınız kayıt bulunamadı.";
  if (status === 409) return "İşlem mevcut durumla çakışıyor.";
  if (status === 429) return "Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.";
  if (status >= 500) return "Sunucuda bir sorun oluştu. Biraz sonra tekrar deneyin.";
  return "İstek tamamlanamadı.";
}

let refreshing: Promise<boolean> | null = null;

/** Çerezdeki yenileme jetonuyla yeni erişim jetonu alır. Aynı anda tek istek gider. */
export function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(BASE + "/auth/refresh", {
          method: "POST",
          credentials: "same-origin",
        });
        if (!res.ok) {
          accessToken = null;
          return false;
        }
        const data = (await res.json()) as { access_token: string };
        accessToken = data.access_token;
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

async function send(method: string, path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  return fetch(buildUrl(path, opts.query), {
    method,
    headers,
    body,
    credentials: "same-origin",
    signal: opts.signal,
  });
}

async function request(method: string, path: string, opts: RequestOptions = {}): Promise<Response> {
  let res = await send(method, path, opts);
  if (res.status === 401 && !path.startsWith("/auth/")) {
    if (await refreshSession()) {
      res = await send(method, path, opts);
    } else {
      onSessionLost?.();
    }
  }
  if (!res.ok) throw await toError(res);
  return res;
}

export async function api<T>(method: string, path: string, opts?: RequestOptions): Promise<T> {
  const res = await request(method, path, opts);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const get = <T>(path: string, query?: Query, signal?: AbortSignal) =>
  api<T>("GET", path, { query, signal });

/** Dosya indirir (Excel, belge). Yetki başlığı gerektiği için düz bağlantı kullanılamaz. */
export async function download(path: string, query?: Query, fallbackName = "dosya") {
  const res = await request("GET", path, { query });
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
  const name = match ? decodeURIComponent(match[1] ?? match[2] ?? fallbackName) : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Belgeyi yeni sekmede açmak için yetkili istekle alınmış geçici adres. */
export async function blobUrl(path: string): Promise<string> {
  const res = await request("GET", path);
  return URL.createObjectURL(await res.blob());
}

export function newIdempotencyKey() {
  return crypto.randomUUID();
}
