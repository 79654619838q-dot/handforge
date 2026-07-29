/** "next" приходит из внешних статических приложений (например /poker),
 * которые лежат вне этого React-роутера — поэтому переход по нему всегда
 * полная перезагрузка страницы, а не router.navigate(). */
export function safeNext(search) {
  const next = new URLSearchParams(search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return null;
}
