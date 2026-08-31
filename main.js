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

// ---- Live wipe countdown (home page only — no-op elsewhere) ----
(function(){
  var el = document.getElementById('wipe-countdown');
  if (!el) return; // not on the home page

  // Rust's monthly force wipe: first Thursday of the month, 18:00 UTC
  // (that's 18:00 GMT / 19:00 BST depending on time of year).
  function firstThursdayAt18UTC(year, month){
    var d = new Date(Date.UTC(year, month, 1, 18, 0, 0));
    var offset = (4 - d.getUTCDay() + 7) % 7; // Thursday = 4
    d.setUTCDate(d.getUTCDate() + offset);
    return d;
  }

  function nextWipe(from){
    var y = from.getUTCFullYear();
    var m = from.getUTCMonth();
    var candidate = firstThursdayAt18UTC(y, m);
    if (candidate.getTime() <= from.getTime()) {
      m += 1;
      if (m > 11) { m = 0; y += 1; }
      candidate = firstThursdayAt18UTC(y, m);
    }
    return candidate;
  }

  function pad(n){ return n < 10 ? '0' + n : '' + n; }

  function render(){
    var now = new Date();
    var diff = Math.max(0, nextWipe(now).getTime() - now.getTime());
    var totalSeconds = Math.floor(diff / 1000);
    var days = Math.floor(totalSeconds / 86400);
    var hours = Math.floor((totalSeconds % 86400) / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    el.textContent = days + 'd ' + pad(hours) + 'h ' + pad(minutes) + 'm ' + pad(seconds) + 's';
  }

  render();
  setInterval(render, 1000);
})();

// ---- Wipe banner date (all pages) — auto-updates each month ----
(function(){
  var els = document.querySelectorAll('.wipe-banner .wipe-date');
  if (!els.length) return;

  // Same rule as the homepage countdown: first Thursday of the month, 18:00 UTC.
  function firstThursdayAt18UTC(year, month){
    var d = new Date(Date.UTC(year, month, 1, 18, 0, 0));
    var offset = (4 - d.getUTCDay() + 7) % 7; // Thursday = 4
    d.setUTCDate(d.getUTCDate() + offset);
    return d;
  }
  function nextWipe(from){
    var y = from.getUTCFullYear();
    var m = from.getUTCMonth();
    var candidate = firstThursdayAt18UTC(y, m);
    if (candidate.getTime() <= from.getTime()) {
      m += 1;
      if (m > 11) { m = 0; y += 1; }
      candidate = firstThursdayAt18UTC(y, m);
    }
    return candidate;
  }

  var text = nextWipe(new Date()).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC'
  });
  for (var i = 0; i < els.length; i++) els[i].textContent = text;
})();

// ---- Direct Connect fallback (steam:// links — shows manual instructions if Steam doesn't launch) ----
(function(){
  var links = document.querySelectorAll('a[href^="steam://"]');
  if(!links.length) return;

  links.forEach(function(link){
    var note = document.createElement('div');
    note.className = 'connect-fallback';
    note.hidden = true;
    note.innerHTML = 'Didn\'t open? Make sure Steam is installed and running, then try again — or connect manually: open the in-game console (F1) and type <code>client.connect 198.244.225.11:28015</code>';
    link.insertAdjacentElement('afterend', note);

    link.addEventListener('click', function(){
      note.hidden = true;
      var launched = false;
      var onBlur = function(){ launched = true; };
      window.addEventListener('blur', onBlur);
      setTimeout(function(){
        window.removeEventListener('blur', onBlur);
        // If the window never lost focus, the protocol handler almost
        // certainly didn't fire (Steam wasn't there to catch it).
        if(!launched && document.hasFocus()){
          note.hidden = false;
        }
      }, 1600);
    });
  });
})();

// ---- Google Ads conversion tracking: "Join the Discord" (outbound click) ----
// Fires whenever someone leaves the site via a Discord invite link. Works
// whether or not analytics consent was given — if the Google tag never
// loaded (consent declined, ad blocker, slow network), the fallback timer
// still sends the visitor on to Discord so the link never breaks.
(function(){
  var CONVERSION_SEND_TO = 'AW-18419875480/L0Z0CMv_neacEj9o89E';
  var links = document.querySelectorAll('a[href*="discord.gg/VJSMF6MfSX"]');
  if(!links.length) return;

  links.forEach(function(link){
    link.addEventListener('click', function(e){
      var url = link.href;
      var target = link.target;
      var sent = false;
      var go = function(){
        if(sent) return;
        sent = true;
        if(target === '_blank'){
          window.open(url, '_blank');
        } else {
          window.location = url;
        }
      };
      var fallback = setTimeout(go, 400);
      try {
        window.gtag && window.gtag('event', 'conversion', {
          'send_to': CONVERSION_SEND_TO,
          'event_callback': function(){ clearTimeout(fallback); go(); }
        });
      } catch(err){ clearTimeout(fallback); go(); }
      e.preventDefault();
    });
  });
})();

// ---- Live server status (home page only — no-op elsewhere) ----
// Replaces the old BattleMetrics iframe embed, which went blank for some
// visitors (third-party iframes + browser cookie restrictions don't mix
// well with BattleMetrics' bot-check). This instead calls our own
// Netlify function, which fetches BattleMetrics' API server-side.
(function(){
  var wrap = document.getElementById('server-status');
  if (!wrap) return; // not on the home page

  var dot = document.getElementById('server-status-dot');
  var label = document.getElementById('server-status-label');
  var playersEl = document.getElementById('server-status-players');
  var linkEl = document.getElementById('server-status-link');

  fetch('/api/server-status').then(function(r){
    return r.ok ? r.json() : null;
  }).then(function(data){
    if (!data || typeof data.players !== 'number') {
      label.textContent = 'Status unavailable';
      return;
    }

    var online = data.status === 'online';
    dot.classList.add(online ? 'is-online' : 'is-offline');
    label.textContent = online ? 'Online' : 'Offline';
    playersEl.textContent = data.players + (typeof data.maxPlayers === 'number' ? ' / ' + data.maxPlayers : '');
    if (linkEl && data.rank) {
      linkEl.textContent = 'BattleMetrics rank #' + data.rank;
    }
  }).catch(function(){
    label.textContent = 'Status unavailable';
  });
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
    var updatedEl = document.getElementById('map-updated');

    seedEl.textContent = data.seed;
    if (sizeEl) sizeEl.textContent = data.worldsize;
    if (monEl && data.monuments) monEl.textContent = data.monuments;
    if (landEl && typeof data.land === 'number') landEl.textContent = Math.round(data.land) + '%';
    if (imgEl && data.imageUrl) {
      imgEl.src = data.imageUrl;
      imgEl.alt = 'Beer-UK current wipe map — seed ' + data.seed + ', size ' + data.worldsize;
    }
    if (linkEl && data.mapUrl) linkEl.href = data.mapUrl;
    if (updatedEl && data.updated) {
      var d = new Date(data.updated);
      updatedEl.textContent = 'confirmed current as of ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }).catch(function(){ /* fetch failed — keep whatever's already in the HTML */ });
})();

// ---- Cookie consent + Google Analytics (only loads GA after consent) ----
(function(){
  var GA_ID = 'G-9GQSR2R8X1';
  var STORAGE_KEY = 'beeruk-cookie-consent';

  var ADS_ID = 'AW-18419875480';

  function loadGA(){
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
    window.gtag('config', ADS_ID);
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
      '<span>This site uses a cookie for basic visitor analytics and to measure ad performance (Google Analytics &amp; Google Ads). No personal data is sold or shared.</span>' +
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
