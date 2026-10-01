// ─── Abrir direcciones en la app de mapas favorita ────────────────────────────
// Cada persona elige con qué app abrir las ubicaciones (Google Maps, Waze, Apple
// Maps) o "preguntar siempre". La preferencia es del dispositivo (localStorage),
// se cambia en /perfil o marcando "Recordar" en el selector (MapsChooser, Layout1).

export type MapsApp = "google" | "waze" | "apple";
export type MapsPref = MapsApp | "ask";

const PREF_KEY = "staurant_maps_app";

export const MAPS_APPS: ReadonlyArray<{ id: MapsApp; label: string; icon: string }> = [
  { id: "google", label: "Google Maps", icon: "bi-google" },
  { id: "waze", label: "Waze", icon: "bi-car-front-fill" },
  { id: "apple", label: "Apple Maps", icon: "bi-apple" },
];

/** Apple Maps solo tiene sentido en iPhone / iPad / Mac. */
export function isAppleDevice(): boolean {
  return /iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent);
}

/** Apps que se ofrecen en este dispositivo. */
export function availableMapsApps(): typeof MAPS_APPS {
  return isAppleDevice() ? MAPS_APPS : MAPS_APPS.filter((a) => a.id !== "apple");
}

export function getMapsPref(): MapsPref {
  let v: string | null = null;
  try {
    v = localStorage.getItem(PREF_KEY);
  } catch {
    /* sin almacenamiento → preguntar */
  }
  return availableMapsApps().some((a) => a.id === v) ? (v as MapsApp) : "ask";
}

export function setMapsPref(pref: MapsPref): void {
  try {
    if (pref === "ask") localStorage.removeItem(PREF_KEY);
    else localStorage.setItem(PREF_KEY, pref);
  } catch {
    /* sin almacenamiento: la elección dura solo esta vez */
  }
}

export function mapsAppUrl(app: MapsApp, address: string): string {
  const q = encodeURIComponent(address.trim());
  switch (app) {
    case "waze":
      return `https://waze.com/ul?q=${q}&navigate=yes`;
    case "apple":
      return `https://maps.apple.com/?q=${q}`;
    default:
      return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }
}

export function openInMapsApp(app: MapsApp, address: string): void {
  window.open(mapsAppUrl(app, address), "_blank", "noopener");
}

/** Abre la dirección con la app preferida, o muestra el selector si es "preguntar". */
export function openAddress(address: string): void {
  const pref = getMapsPref();
  const chooser = (window as any).mapsChooser as { open: (a: string) => void } | undefined;
  if (pref === "ask" && chooser) chooser.open(address);
  else openInMapsApp(pref === "ask" ? "google" : pref, address);
}

/** Convierte un <a> en enlace de ubicación. El href queda en Google Maps como
 *  respaldo (abrir en pestaña nueva / copiar enlace); el toque usa la preferencia. */
export function wireAddressLink(el: HTMLAnchorElement, address: string): void {
  el.href = mapsAppUrl("google", address);
  el.onclick = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return; // abrir en pestaña nueva: nativo
    e.preventDefault();
    openAddress(address);
  };
}
