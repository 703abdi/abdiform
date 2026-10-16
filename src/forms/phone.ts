// Real phone validation (per-country number plans) via libphonenumber.
// The form stores "+<dial><digits as typed>"; a national trunk 0 (UK 07911..., AU 0478...) is
// accepted and removed when the number is checked and saved.

import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";
import { splitPhone } from "@/forms/countries";

/** The number in +E.164 form if it's a real, dialable number for its country; otherwise null. */
export function normalizePhone(v: string): string | null {
  const s = v.trim();
  if (!/^\+?[\d\s().-]+$/.test(s)) return null;
  const intl = s.startsWith("+") ? s : `+${s}`;
  const direct = parsePhoneNumberFromString(intl);
  if (direct?.isValid()) return direct.number;
  const split = splitPhone(intl.replace(/[^\d+]/g, ""));
  if (split) {
    const p = parsePhoneNumberFromString(split.national, split.iso as CountryCode);
    if (p?.isValid()) return p.number;
  }
  return null;
}

export const isValidPhone = (v: string) => normalizePhone(v) !== null;
