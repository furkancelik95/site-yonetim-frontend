// Üretilmiş şemadan (schema.d.ts) kısa adlar. Elle tip yazılmaz; şema değişince
// `npm run api:types` ile yeniden üretilir.
import type { components } from "./schema";

export type Schemas = components["schemas"];

export type Me = Schemas["MeResponse"];
export type MySite = Me["sites"][number];
export type TokenResponse = Schemas["TokenResponse"];
export type Written<T> = { data: T; message: string };

export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}
