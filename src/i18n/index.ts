import en from './en.json';

/** All user-facing strings (English only in the MVP; more languages later). */
export const S = en;

/** Replace `{name}` placeholders. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}
