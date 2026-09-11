/*
 * 旧公開先（GitHub Pages）用の Service Worker。自身を解除して保存済みの旧版を消す。
 *
 * 旧版のアプリは起動のたびに同じ場所の sw.js を更新確認する。この sw.js に入れ替わると、
 * 旧版のキャッシュを削除して登録を解除し、開いている画面を読み込み直す（移転案内が表示される）。
 * 旧版のままでは更新が届かず、古い用量情報を使い続けるため、このファイルは消さないこと。
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith("abx-navi-")).map((name) => caches.delete(name)));
      await self.clients.claim();
      await self.registration.unregister();
      const windows = await self.clients.matchAll({ type: "window" });
      await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => undefined)));
    })(),
  );
});
