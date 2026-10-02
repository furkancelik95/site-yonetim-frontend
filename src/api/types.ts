// Üretilmiş şemadan (schema.d.ts) kısa adlar. Elle tip yazılmaz; şema değişince
// `npm run api:types` ile yeniden üretilir.
import type { components } from "./schema";

export type Schemas = components["schemas"];

export type Me = Schemas["MeResponse"];
export type MySite = Me["sites"][number];
export type TokenResponse = Schemas["TokenResponse"];
export type Written<T> = { data: T; message: string };

// Şemada aynı adı taşıyan iki model olduğu için uzun adla üretilenler
export type AccountStatement = Schemas["site_yonetim__api__v1__payments__StatementOut"];
export type CashStatement = Schemas["site_yonetim__api__v1__cash__StatementOut"];
export type CashAccounts = Schemas["CashAccountsOut"];

export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}
