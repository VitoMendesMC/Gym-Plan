/* sw.js – Offline-Start der Trainings-App (Block N, erweitert in Block INF1). Liegt im selben Ordner wie index.html.
   Strategie: erst das Netz (Updates kommen sofort an), nach 3 s oder ohne Netz die zuletzt geladene Fassung.
   Seit INF1 gilt das auch für die ausgelagerten Dateien in FILES (Körpergrafik). Kam die App gerade aus dem Speicher,
   kommen diese Dateien sofort auch aus dem Speicher, damit sich die Wartezeit bei schlechtem Netz nicht addiert.
   Trainingsdaten berührt diese Datei nicht; die liegen weiter im Speicher der App. */
var CACHE = 'training-app';
var SHELL = 'app-shell';            /* fester Schlüssel: egal ob die App als …/ oder …/index.html geöffnet wird */
var FILES = ['mkbody.js'];          /* weitere Dateien der App, die offline da sein müssen */
var WAIT = 3000;
var fromCache = 0;                  /* Zeitpunkt, an dem die App zuletzt aus dem Speicher kam */

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    var all = [[self.registration.scope, SHELL]].concat(FILES.map(function (f) { return [new URL(f, self.registration.scope).href, f]; }));
    return Promise.all(all.map(function (x) {
      return fetch(x[0], { cache: 'no-store' }).then(function (r) { if (r.ok) return c.put(x[1], r); }).catch(function () {});
    }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

/* Schlüssel im Speicher: SHELL für die App selbst, Dateiname für FILES, sonst null (andere Seiten im Ordner bleiben unberührt) */
function keyOf(req) {
  var p = new URL(req.url).pathname, s = new URL(self.registration.scope).pathname;
  if (req.mode === 'navigate') return (p === s || p === s + 'index.html') ? SHELL : null;
  var f = p.indexOf(s) === 0 ? p.slice(s.length) : '';
  return FILES.indexOf(f) >= 0 ? f : null;
}

self.addEventListener('fetch', function (e) {
  var key = keyOf(e.request);
  if (!key) return;
  e.respondWith(caches.open(CACHE).then(function (c) {
    var saved = function () { return c.match(key); };
    /* nur eine gute Antwort gewinnt; Fehlerantworten (404/500) fallen auf die gespeicherte Fassung zurück. Schreiben läuft zu Ende (waitUntil). */
    var net = fetch(e.request, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); var put = c.put(key, r.clone()); try { e.waitUntil(put); } catch (x) { /* Antwort schon ausgeliefert: Schreiben läuft trotzdem */ } return r; });
    var used = function (m) { if (m && key === SHELL) fromCache = Date.now(); return m; };
    /* Zusatzdatei weder schnell genug noch gespeichert: leere Datei statt Warten (Review INF1). Die App startet dann ohne Grafik. */
    var empty = function () { return key === SHELL ? net : new Response('', { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } }); };
    var race = function () {
      var slow = new Promise(function (res) { setTimeout(res, WAIT); });
      /* Netz gewinnt, wenn es schnell genug ist; sonst die gespeicherte Fassung (falls vorhanden) */
      return Promise.race([net, slow.then(function () { return saved().then(function (m) { return used(m) || empty(); }); })])
        .catch(function () { return saved().then(function (m) { return used(m) || fetch(e.request); }); });
    };
    /* App kam eben aus dem Speicher: Zusatzdateien sofort aus dem Speicher (Netz aktualisiert im Hintergrund) */
    if (key !== SHELL && Date.now() - fromCache < 10000) {
      return saved().then(function (m) { if (m) { net.catch(function () {}); return m; } return race(); });
    }
    return race();
  }));
});
