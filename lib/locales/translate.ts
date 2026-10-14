import english from './en.json';
export type Language = 'pt' | 'en';
const messages: Record<string, string> = english;
export const localeFor = (lang: Language) => lang === 'en' ? 'en-US' : 'pt-BR';
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const templates = Object.entries(messages).filter(([key]) => /\{\d+\}/.test(key)).sort(([a], [b]) => b.replace(/\{\d+\}/g, '').length - a.replace(/\{\d+\}/g, '').length).map(([key, value]) => ({
  pattern: new RegExp('^' + key.split(/\{\d+\}/).map(escapeRegex).join('(.*?)') + '$'), value,
}));
/** Only known product copy is translated. Jira content and user-authored notes remain verbatim. */
export function translate(text: string, lang: Language): string {
  if (lang === 'pt') return text;
  const normalized = text.replace(/\s+/g, ' ').trim();
  const exact = messages[normalized];
  if (exact !== undefined) return exact;
  for (const { pattern, value } of templates) {
    const match = normalized.match(pattern);
    if (match) return value.replace(/\{(\d+)\}/g, (_, n) => match[Number(n) + 1] ?? '');
  }
  return text;
}
export function formatNumber(value: number, lang: Language, digits = 2): string {
  return new Intl.NumberFormat(localeFor(lang), { maximumFractionDigits: digits }).format(value);
}
export function formatMetricDisplay(value: string, lang: Language): string {
  const match = value.match(/^(-?\d+(?:\.\d+)?)\s*(%|d)?$/);
  return match ? `${formatNumber(Number(match[1]), lang)}${match[2] === 'd' ? ' d' : match[2] ?? ''}` : translate(value, lang);
}

/** Legacy API series use day + Portuguese month; localize only this chart label format. */
export function formatWeekLabel(value: string, lang: Language): string {
  if (lang === 'pt') return value;
  const months: Record<string, string> = {jan:'Jan',fev:'Feb',mar:'Mar',abr:'Apr',mai:'May',jun:'Jun',jul:'Jul',ago:'Aug',set:'Sep',out:'Oct',nov:'Nov',dez:'Dec'};
  const match = value.match(/^(\d{1,2}) (jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)$/);
  return match ? `${months[match[2]]} ${match[1]}` : value;
}
