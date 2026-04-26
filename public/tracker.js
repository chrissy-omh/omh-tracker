(function () {
  try {
    var startTime = Date.now();

    var sessionId = sessionStorage.getItem('omh_session_id');
    if (!sessionId) {
      sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('omh_session_id', sessionId);
    }

    function sendTrack(dwell) {
      var payload = {
        url: window.location.pathname,
        impressions: 1,
        session_id: sessionId,
        dwell_seconds: dwell,
        page_title: document.title || '',
      };
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon('https://omh-tracker.vercel.app/api/track', blob);
      } else {
        fetch('https://omh-tracker.vercel.app/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          credentials: 'omit',
        }).catch(function () {});
      }
    }

    window.addEventListener('beforeunload', function () {
      try {
        var dwell = Math.round((Date.now() - startTime) / 1000);
        sendTrack(dwell);
      } catch (e) {}
    });

    sendTrack(0);
  } catch (e) {}
})();
