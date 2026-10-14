/** Barra fina de "cargando" arriba de la pantalla (#loading-bar, en LoadingBar.astro).
 *  Cuenta las esperas activas: aparece si alguna tarda más de SHOW_DELAY_MS (en red
 *  rápida no parpadea) y se oculta cuando todas terminan. El ocultado espera
 *  HIDE_GRACE_MS para que varias esperas seguidas se vean como una sola barra. */

const SHOW_DELAY_MS = 200;
const HIDE_GRACE_MS = 120;

let active = 0;
let showTimer: number | undefined;
let hideTimer: number | undefined;

function bar(): HTMLElement | null {
  return document.getElementById("loading-bar");
}

/** Marca el inicio de una espera. Devuelve la función que la termina (idempotente). */
export function beginLoading(): () => void {
  active++;
  window.clearTimeout(hideTimer);
  if (active === 1 && !bar()?.classList.contains("is-active")) {
    window.clearTimeout(showTimer);
    showTimer = window.setTimeout(() => {
      if (active > 0) bar()?.classList.add("is-active");
    }, SHOW_DELAY_MS);
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    active = Math.max(0, active - 1);
    if (active > 0) return;
    window.clearTimeout(showTimer);
    hideTimer = window.setTimeout(() => {
      if (active === 0) bar()?.classList.remove("is-active");
    }, HIDE_GRACE_MS);
  };
}

/** Envuelve una promesa: la barra se muestra mientras no resuelva. */
export async function withLoading<T>(p: PromiseLike<T>): Promise<T> {
  const end = beginLoading();
  try {
    return await p;
  } finally {
    end();
  }
}
