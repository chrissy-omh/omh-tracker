(function () {
  try {
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: window.location.pathname, impressions: 1 }),
    }).catch(function () {});
  } catch (e) {}
})();
