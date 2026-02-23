/* admin-auth.js
   Auth simple via Worker (pas de clé Airtable côté client).
   Stockage session : sessionStorage.

   A CONFIGURER :
   - AUTH_ENDPOINT : URL du Worker route /admin/login
*/

const AdminAuth = (() => {
  const AUTH_ENDPOINT = "https://coge-admin.cogechirolles.workers.dev/admin/login";

  const KEY_TOKEN = "admin_token";
  const KEY_ADMIN = "admin_profile";

  function isLoggedIn() {
    return !!sessionStorage.getItem(KEY_TOKEN);
  }

  function getToken() {
    return sessionStorage.getItem(KEY_TOKEN);
  }

  function getAdmin() {
    try {
      const raw = sessionStorage.getItem(KEY_ADMIN);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function logout() {
    sessionStorage.removeItem(KEY_TOKEN);
    sessionStorage.removeItem(KEY_ADMIN);
  }

  function requireLogin() {
    if (!isLoggedIn()) window.location.href = "./login.html";
  }

  async function login(login, password) {
    const r = await fetch(AUTH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, password }),
    });

    let data = null;
    try { data = await r.json(); } catch { data = null; }

    if (!r.ok || !data) return { ok: false, message: "Réponse invalide du serveur." };
    if (!data.ok) return { ok: false, message: data.message || "Accès refusé." };

    // Stocke la session
    sessionStorage.setItem(KEY_TOKEN, data.token || "1");
    sessionStorage.setItem(KEY_ADMIN, JSON.stringify(data.admin || {}));

    return { ok: true, admin: data.admin || {} };
  }

  async function authedFetch(url, options = {}) {
    const token = getToken();
    if (!token) throw new Error("Not logged in");

    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);

    return fetch(url, { ...options, headers });
  }

  return { isLoggedIn, getToken, getAdmin, login, logout, requireLogin, authedFetch };
})();
