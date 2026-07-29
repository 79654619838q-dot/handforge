// Общий вход с PhotoQuest: тот же JWT (localStorage "pq_access"), что и
// у web/src/lib/api.js. Без него в Poker не попасть — редиректим на общий
// логин и возвращаемся сюда же через ?next=.
(function () {
  const TOKEN_KEY = 'pq_access';
  const token = localStorage.getItem(TOKEN_KEY);

  function goToLogin() {
    const next = encodeURIComponent(location.pathname + location.search);
    location.replace('/quest/login?next=' + next);
  }

  if (!token) {
    goToLogin();
    return;
  }

  window.__pqAuthReady = fetch('/api/auth/me', {
    headers: { Authorization: 'Bearer ' + token },
  })
    .then((res) => {
      if (!res.ok) throw new Error('unauthorized');
      return res.json();
    })
    .then((data) => {
      window.__pqAccount = data.user; // { id, username, ... }
      return data.user;
    })
    .catch(() => {
      localStorage.removeItem(TOKEN_KEY);
      goToLogin();
      return null;
    });
})();
