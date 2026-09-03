(function(){
  var btn = document.getElementById('copy-ip');
  var ipText = document.getElementById('ip-text');
  if(!btn || !ipText) return;

  btn.addEventListener('click', function(){
    var text = ipText.textContent.trim();
    var done = function(){
      var original = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(function(){ btn.textContent = original; }, 1500);
    };
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(done).catch(function(){
        fallbackCopy(text, done);
      });
    } else {
      fallbackCopy(text, done);
    }
  });

  function fallbackCopy(text, done){
    var tmp = document.createElement('textarea');
    tmp.value = text;
    tmp.style.position = 'fixed';
    tmp.style.opacity = '0';
    document.body.appendChild(tmp);
    tmp.select();
    try { document.execCommand('copy'); } catch(e) {}
    document.body.removeChild(tmp);
    done();
  }
})();

// ---- Live map data (map.html only — no-op elsewhere) ----
(function(){
  var seedEl = document.getElementById('map-seed');
  if (!seedEl) return; // not on the map page

  fetch('/api/current-map').then(function(r){
    return r.ok ? r.json() : null;
  }).then(function(data){
    if (!data || !data.seed || data.status !== 'ready') return; // keep the fallback values already in the HTML

    var sizeEl = document.getElementById('map-worldsize');
    var monEl = document.getElementById('map-monuments');
    var landEl = document.getElementById('map-land');
    var imgEl = document.getElementById('map-image');
    var linkEl = document.getElementById('map-link');
    var caveatEl = document.getElementById('map-caveat');
    var linkDescEl = document.getElementById('map-link-desc');

    seedEl.textContent = data.seed;
    if (sizeEl) sizeEl.textContent = data.worldsize;
    if (monEl && data.monuments) monEl.textContent = data.monuments;
    if (landEl && typeof data.land === 'number') landEl.textContent = Math.round(data.land) + '%';
    if (imgEl && data.imageUrl) {
      imgEl.src = data.imageUrl;
      imgEl.alt = 'Beer-UK current wipe map — seed ' + data.seed + ', size ' + data.worldsize;
    }
    // Rust's map generation isn't fully deterministic (RustMaps' own generator
    // warns about this) — occasionally a fresh RustMaps lookup for this seed
    // won't match the exact file the server is running. When our check flagged
    // that mismatch, send the click to the verified image instead of RustMaps'
    // (possibly wrong) interactive page, and say so.
    if (linkEl) {
      if (data.verified === false) {
        linkEl.href = data.imageUrl || linkEl.href;
        if (caveatEl) caveatEl.hidden = false;
        if (linkDescEl) linkDescEl.textContent = 'Click the map to view it full-size.';
      } else {
        if (data.mapUrl) linkEl.href = data.mapUrl;
        if (caveatEl) caveatEl.hidden = true;
        if (linkDescEl) linkDescEl.textContent = 'Click the map to explore it interactively on RustMaps — zoom in, toggle monuments, and check resource heatmaps.';
      }
    }
  }).catch(function(){ /* fetch failed — keep whatever's already in the HTML */ });
})();

// ---- Live server status (index.html only — no-op elsewhere) ----
(function(){
  var labelEl = document.getElementById('server-status-label');
  if (!labelEl) return; // not on the homepage

  var dotEl = document.getElementById('server-status-dot');
  var playersEl = document.getElementById('server-status-players');

  fetch('/api/server-status').then(function(r){
    return r.ok ? r.json() : null;
  }).then(function(data){
    if (!data || !data.status) {
      labelEl.textContent = 'Status unavailable';
      return;
    }
    var online = data.status === 'online';
    if (dotEl) {
      dotEl.classList.remove('is-online', 'is-offline');
      dotEl.classList.add(online ? 'is-online' : 'is-offline');
    }
    labelEl.textContent = online ? 'Online' : 'Offline';
    if (playersEl && typeof data.players === 'number') {
      var maxText = typeof data.maxPlayers === 'number' ? ('/' + data.maxPlayers) : '';
      var queuedText = data.queued ? (' (+' + data.queued + ' queued)') : '';
      playersEl.textContent = data.players + maxText + queuedText;
    }
  }).catch(function(){
    labelEl.textContent = 'Status unavailable';
  });
})();

// ---- Wipe schedule (banner date + "next wipe in" countdown) — index.html only ----
// Facepunch forces a wipe on the first Thursday of every month, 18:00 GMT
// (19:00 during BST — both are 18:00 UTC). Computed here so this never needs
// a manual date edit — it just always reflects the next occurrence.
(function(){
  var dateEl = document.querySelector('.wipe-date');
  var countdownEl = document.getElementById('wipe-countdown');
  if (!dateEl && !countdownEl) return; // not on the homepage

  var DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function firstThursday(year, month){
    var d = new Date(Date.UTC(year, month, 1, 18, 0, 0));
    var offset = (4 - d.getUTCDay() + 7) % 7; // Thursday = 4
    d.setUTCDate(1 + offset);
    return d;
  }

  var now = new Date();
  var wipe = firstThursday(now.getUTCFullYear(), now.getUTCMonth());
  if (wipe <= now) wipe = firstThursday(now.getUTCFullYear(), now.getUTCMonth() + 1);

  if (dateEl) {
    dateEl.textContent = DAYS[wipe.getUTCDay()] + ' ' + wipe.getUTCDate() + ' ' + MONTHS[wipe.getUTCMonth()];
  }

  if (countdownEl) {
    var totalMinutes = Math.max(0, Math.round((wipe - now) / 60000));
    var days = Math.floor(totalMinutes / 1440);
    var hours = Math.floor((totalMinutes % 1440) / 60);
    var minutes = totalMinutes % 60;
    countdownEl.textContent = days > 0 ? (days + 'd ' + hours + 'h')
      : hours > 0 ? (hours + 'h ' + minutes + 'm')
      : (minutes + 'm');
  }
})();

// ---- Cookie consent + Google Analytics (only loads GA after consent) ----
(function(){
  var GA_ID = 'G-9GQSR2R8X1';
  var STORAGE_KEY = 'beeruk-cookie-consent';

  function loadGA(){
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
  }

  function getConsent(){
    try { return localStorage.getItem(STORAGE_KEY); } catch(e){ return null; }
  }
  function setConsent(value){
    try { localStorage.setItem(STORAGE_KEY, value); } catch(e){}
  }

  var consent = getConsent();
  if (consent === 'accepted') {
    loadGA();
    return;
  }
  if (consent === 'declined') {
    return;
  }

  // No decision yet — show the banner once the page has a body to attach to.
  document.addEventListener('DOMContentLoaded', function(){
    var bar = document.createElement('div');
    bar.className = 'cookie-bar';
    bar.innerHTML =
      '<span>This site uses a cookie for basic visitor analytics (Google Analytics). No personal data is sold or shared.</span>' +
      '<span class="cookie-bar-actions">' +
      '<button type="button" class="cookie-decline">Decline</button>' +
      '<button type="button" class="cookie-accept">Accept</button>' +
      '</span>';
    document.body.appendChild(bar);

    bar.querySelector('.cookie-accept').addEventListener('click', function(){
      setConsent('accepted');
      loadGA();
      bar.remove();
    });
    bar.querySelector('.cookie-decline').addEventListener('click', function(){
      setConsent('declined');
      bar.remove();
    });
  });
})();
