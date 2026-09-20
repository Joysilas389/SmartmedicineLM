/*
 * Accounts (spec §71 authentication). Optional: when the deployment has a database, the
 * learner signs in and their data syncs across devices; without one the app stays a
 * single-user, local-first app and none of this UI appears.
 */
import { state } from './state.js';
import { db } from './store.js';
import { $, escapeHtml, toast, confirmDialog, promptDialog } from './ui.js';
import { sync, syncNow, startAutoSync, adoptDevice, forgetDevice } from './sync.js';

state.account = { enabled: false, user: null, loginRequired: false, signupCode: false };

export async function initAccount() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch('/api/auth', { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) Object.assign(state.account, await res.json());
    else if (res.status === 503) {
      // Accounts are configured but the database can't be reached right now.
      const j = await res.json().catch(() => ({}));
      Object.assign(state.account, { enabled: true, loginRequired: true, error: j.error || 'The account service is unavailable.' });
    }
  } catch {
    /* offline or an older deployment: stay local-only */
  }
  document.addEventListener('sync:status', renderAccountPill);
  document.addEventListener('account:signedout', () => {
    state.account.user = null;
    state.account.enabled = true; // the server asked for a sign-in, so accounts are on
    renderAccountPill();
    if (state.account.enabled) showAuthScreen('login', 'Your session has ended. Please sign in again.');
  });
  if (state.account.user) {
    await adoptDevice(state.account.user, async () => true);
    startAutoSync();
  } else if (state.account.enabled && state.account.loginRequired) {
    showAuthScreen('login', state.account.error ? `${state.account.error} Your work on this device is safe; try again in a moment.` : '');
  }
  renderAccountPill();
}

/* ------------------------------ sign-in screen ------------------------------ */
export function showAuthScreen(mode = 'login', notice = '') {
  let el = $('#authScreen');
  if (!el) {
    el = document.createElement('div');
    el.id = 'authScreen';
    el.className = 'auth-screen';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'authTitle');
    document.body.appendChild(el);
  }
  const signup = mode === 'signup';
  el.hidden = false;
  el.innerHTML = `
    <form class="auth-card" id="authForm" novalidate>
      <div class="auth-brand"><span class="brand-mark"><i class="bi bi-heart-pulse"></i></span><span>SmartMedicine<span class="text-eosin">LM</span></span></div>
      <h1 class="auth-title" id="authTitle">${signup ? 'Create your account' : 'Welcome back'}</h1>
      <p class="auth-sub">${signup ? 'Your lessons, questions, flashcards and progress will sync across your phone and computer.' : 'Sign in to continue learning. Your progress syncs across devices.'}</p>
      ${notice ? `<div class="alert alert-warning py-2 small">${escapeHtml(notice)}</div>` : ''}
      <div class="alert alert-danger py-2 small" id="authError" hidden></div>
      ${signup ? `<label class="form-label small" for="authName">Name <span class="text-body-secondary">(optional)</span></label><input class="form-control mb-3" id="authName" autocomplete="name" maxlength="80">` : ''}
      <label class="form-label small" for="authEmail">Email</label>
      <input class="form-control mb-3" id="authEmail" type="email" autocomplete="email" inputmode="email" required>
      <label class="form-label small" for="authPassword">Password</label>
      <div class="input-group mb-3">
        <input class="form-control" id="authPassword" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="${signup ? 8 : 1}" required>
        <button class="btn btn-outline-secondary" type="button" id="authShow" aria-label="Show password"><i class="bi bi-eye"></i></button>
      </div>
      ${signup ? '<div class="form-text mt-n2 mb-3">At least 8 characters.</div>' : ''}
      ${signup && state.account.signupCode ? `<label class="form-label small" for="authCode">Sign-up code</label><input class="form-control mb-3" id="authCode" autocomplete="off" required><div class="form-text mt-n2 mb-3">The owner of this site shares this code with invited learners.</div>` : ''}
      <button class="btn btn-primary w-100" type="submit" id="authSubmit">${signup ? 'Create account' : 'Sign in'}</button>
      <p class="small text-center mt-3 mb-0">${signup ? 'Already have an account?' : 'New here?'} <a href="#" id="authSwitch">${signup ? 'Sign in' : 'Create an account'}</a></p>
    </form>`;
  $('#authSwitch').addEventListener('click', (e) => {
    e.preventDefault();
    showAuthScreen(signup ? 'login' : 'signup');
  });
  $('#authShow').addEventListener('click', () => {
    const p = $('#authPassword');
    p.type = p.type === 'password' ? 'text' : 'password';
    $('#authShow i').className = p.type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
  });
  $('#authForm').addEventListener('submit', (e) => submitAuth(e, signup));
  setTimeout(() => $('#authEmail')?.focus(), 50);
}

async function submitAuth(e, signup) {
  e.preventDefault();
  const err = $('#authError');
  const btn = $('#authSubmit');
  err.hidden = true;
  const body = {
    action: signup ? 'signup' : 'login',
    email: $('#authEmail').value.trim(),
    password: $('#authPassword').value,
    name: $('#authName')?.value.trim(),
    signupCode: $('#authCode')?.value.trim(),
  };
  if (!body.email || !body.password) {
    err.textContent = 'Enter your email and password.';
    err.hidden = false;
    return;
  }
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${signup ? 'Creating account…' : 'Signing in…'}`;
  try {
    const res = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Something went wrong (${res.status}).`);
    await signedIn(j.user);
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
    btn.disabled = false;
    btn.textContent = signup ? 'Create account' : 'Sign in';
  }
}

async function signedIn(user) {
  const hadData = await db.hasUserData();
  state.account.user = user;
  await adoptDevice(user, async () => true);
  $('#authScreen')?.remove();
  startAutoSync();
  await syncNow();
  document.dispatchEvent(new CustomEvent('sync:applied'));
  renderAccountPill();
  toast(hadData ? `Signed in. This device's existing work was added to your account.` : `Signed in as ${user.email}.`, 'success');
}

/* ------------------------------ sidebar pill + settings section ------------------------------ */
export function renderAccountPill() {
  const pill = $('#accountPill');
  if (!pill) return;
  const a = state.account;
  if (!a.enabled) {
    pill.hidden = true;
    return;
  }
  pill.hidden = false;
  if (!a.user) {
    pill.innerHTML = `<button class="btn btn-sm btn-outline-primary w-100" type="button" id="pillSignIn"><i class="bi bi-person me-1"></i><span class="label">Sign in</span></button>`;
    $('#pillSignIn').addEventListener('click', () => showAuthScreen('login'));
    return;
  }
  const dot = { syncing: 'syncing', ok: 'ok', error: 'err', offline: 'off', idle: '' }[sync.status] || '';
  const label = sync.status === 'syncing' ? 'Syncing…' : sync.status === 'error' ? 'Sync problem' : sync.status === 'offline' ? 'Offline: will sync later' : sync.pending ? `${sync.pending} change${sync.pending === 1 ? '' : 's'} to sync` : 'Synced';
  pill.innerHTML = `<a class="account-link" href="#/settings" title="${escapeHtml(a.user.email)}">
    <span class="avatar">${escapeHtml((a.user.name || a.user.email)[0].toUpperCase())}</span>
    <span class="label min-w-0"><b class="text-truncate d-block">${escapeHtml(a.user.name || a.user.email)}</b><small><i class="sync-dot ${dot}"></i>${label}</small></span></a>`;
}

export function accountSectionHtml() {
  const a = state.account;
  if (!a.enabled)
    return `<section class="settings-section"><h3>Account &amp; sync</h3>
      <p class="small text-body-secondary mb-0">This deployment has no database, so everything is stored only in this browser. To sign in and sync across your phone and computer, add a Postgres database in Vercel (Storage → Create → Neon) and redeploy. See docs/DEPLOY.md.</p></section>`;
  if (!a.user)
    return `<section class="settings-section"><h3>Account &amp; sync</h3><p class="small">Sign in to sync your work across devices.</p>
      <button class="btn btn-primary btn-sm" type="button" data-acct="signin">Sign in</button></section>`;
  const last = sync.lastSync ? new Date(sync.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'not yet';
  return `<section class="settings-section"><h3>Account &amp; sync</h3>
    <div class="acct-row"><span class="avatar lg">${escapeHtml((a.user.name || a.user.email)[0].toUpperCase())}</span>
      <div><b>${escapeHtml(a.user.name || 'Your account')}</b><div class="small text-body-secondary">${escapeHtml(a.user.email)}</div></div></div>
    <p class="small mt-2 mb-2">Last synced: <b>${last}</b>${sync.pending ? ` · ${sync.pending} change${sync.pending === 1 ? '' : 's'} waiting` : ''}${sync.error && sync.status === 'error' ? ` · <span class="text-danger">${escapeHtml(sync.error)}</span>` : ''}</p>
    <p class="small text-body-secondary">Chats, documents' text, flashcards, questions, progress, whiteboards and settings sync. Original PDF and image files stay on the device you uploaded them from.</p>
    <div class="d-flex flex-wrap gap-2">
      <button class="btn btn-outline-primary btn-sm" type="button" data-acct="sync"><i class="bi bi-arrow-repeat me-1"></i>Sync now</button>
      <button class="btn btn-outline-secondary btn-sm" type="button" data-acct="signout">Sign out</button>
      <button class="btn btn-outline-secondary btn-sm" type="button" data-acct="signout_all">Sign out everywhere</button>
      <button class="btn btn-outline-danger btn-sm" type="button" data-acct="delete">Delete account</button>
    </div></section>`;
}

export async function accountAction(action, rerender) {
  if (action === 'signin') return showAuthScreen('login');
  if (action === 'sync') {
    await syncNow();
    toast(sync.status === 'ok' ? 'Everything is synced.' : `Sync did not finish: ${sync.error}`, sync.status === 'ok' ? 'success' : 'warning');
    return rerender();
  }
  if (action === 'signout' || action === 'signout_all') {
    await syncNow();
    if (sync.pending && !(await confirmDialog('Sign out?', `${sync.pending} change${sync.pending === 1 ? " hasn't" : "s haven't"} reached the server yet and will be lost from this browser.`, 'Sign out anyway')))
      return;
    await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: action === 'signout_all' ? 'logout_all' : 'logout' }) });
    await forgetDevice(); // your data is safe on the server; this browser is left clean
    location.hash = '#/chat';
    location.reload();
    return;
  }
  if (action === 'delete') {
    const pw = await promptDialog('Delete your account', '', 'Type your password to permanently delete your account and all synced data', 'password');
    if (!pw) return;
    const res = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete', password: pw }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return toast(j.error || 'Could not delete the account.', 'danger');
    await forgetDevice();
    location.hash = '#/chat';
    location.reload();
  }
}
