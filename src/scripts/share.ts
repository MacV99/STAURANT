// ─── Compartir restaurantes (ShareDialog, montado en Layout1) ─────────────────
// window.share.open({ title, url, friend }) abre la hoja de compartir: redes,
// copiar enlace y "enviar a un amigo" (abre RecommendDialog con `friend`).

/** Lo que espera RecommendDialog (window.recommend.open). */
export interface RecommendTarget {
  type: string;
  id: string;
  title: string;
  subtitle?: string | null;
}

export interface ShareTarget {
  title: string;
  url: string;
  /** null → sin opción "Amigo" (p. ej. visitante sin sesión). */
  friend?: RecommendTarget | null;
}

/** Enlace público del perfil oficial (URL bonita por handle si existe). */
export function officialShareUrl(o: { id: string; handle?: string | null }): string {
  const path = o.handle ? `/oficial/@${o.handle}` : `/oficial?id=${encodeURIComponent(o.id)}`;
  return `${window.location.origin}${path}`;
}

/** Enlace a un restaurante personal: la vista de amigo de su dueño. */
export function personalShareUrl(ownerId: string, restaurantId: string): string {
  const q = new URLSearchParams({ id: ownerId, r: restaurantId });
  return `${window.location.origin}/usuario?${q.toString()}`;
}

export function shareLinks(t: ShareTarget): {
  text: string;
  whatsapp: string;
  telegram: string;
  facebook: string;
  x: string;
} {
  const text = `Mira ${t.title} en STAURANT`;
  const u = encodeURIComponent(t.url);
  const tx = encodeURIComponent(text);
  return {
    text,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text}: ${t.url}`)}`,
    telegram: `https://t.me/share/url?url=${u}&text=${tx}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    x: `https://twitter.com/intent/tweet?text=${tx}&url=${u}`,
  };
}

/** Copia al portapapeles con respaldo para navegadores sin Clipboard API. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** Activa el botón "Compartir" de la cabecera (RestaurantHeader .rh-btn-share). */
export function wireShareButton(root: ParentNode, target: () => ShareTarget): void {
  const btn = root.querySelector<HTMLButtonElement>(".rh-btn-share");
  if (!btn) return;
  btn.hidden = false;
  btn.onclick = () => (window as any).share?.open(target());
}
