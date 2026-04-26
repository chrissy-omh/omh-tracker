(function () {
  try {
    var startTime = Date.now();

    var sessionId = sessionStorage.getItem('omh_session_id');
    if (!sessionId) {
      sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('omh_session_id', sessionId);
    }

    function sendTrack(dwell, exitUrl, eventType, impressions) {
      var payload = {
        url: window.location.pathname,
        impressions: impressions !== undefined ? impressions : 1,
        session_id: sessionId,
        dwell_seconds: dwell,
        page_title: document.title || '',
        referrer: document.referrer || '',
        exit_url: exitUrl || '',
        event_type: eventType || '',
      };
      fetch('https://omh-tracker.vercel.app/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'omit',
      }).catch(function () {});
    }

    window.addEventListener('beforeunload', function () {
      try {
        var dwell = Math.round((Date.now() - startTime) / 1000);
        sendTrack(dwell, '', '');
      } catch (e) {}
    });

    document.addEventListener('click', function (e) {
      try {
        var el = e.target;
        while (el && el.tagName !== 'A') {
          el = el.parentElement;
        }
        if (!el) return;
        var href = el.getAttribute('href') || '';
        if (href.indexOf('http') !== 0) return;
        if (href.indexOf('organisemyhouse.com') !== -1) return;
        var dwell = Math.round((Date.now() - startTime) / 1000);
        sendTrack(dwell, href, 'exit_click', 0);
      } catch (e) {}
    });

    sendTrack(0, '', '');
  } catch (e) {}
})();
