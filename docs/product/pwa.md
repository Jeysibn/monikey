# PWA and offline behavior

Status: Beta

MoniKey is installable as a PWA. The service worker caches only the static
application shell and never intercepts `/api/` requests. This provides a useful
read-only shell when connectivity is unavailable; ledger writes and
synchronization remain online-only until a conflict model is designed.
