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
