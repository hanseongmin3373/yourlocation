const CONSENT_KEY = "yourlocation_location_consent";

export type LocationConsent = "registered" | null;

export function getLocationConsent(): LocationConsent {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CONSENT_KEY) === "registered" ? "registered" : null;
}

export function markLocationRegistered(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONSENT_KEY, "registered");
}

export function clearLocationConsent(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CONSENT_KEY);
}
