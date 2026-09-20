/* Settings section and sidebar reminder for the Excel-file storage. */
import { $, escapeHtml, toast, confirmDialog } from './ui.js';
import { state } from './state.js';
import { db } from './store.js';
import { localFiles, backupStatus, downloadBackup, importWorkbook, chooseFolder, stopFolder, resumeFolder, saveNow, canPickFolder, initLocalFiles as init } from './local-files.js';

export const initLocalFiles = init;

export function dataSectionHtml() {
  const st = backupStatus();
  const kind = localFiles.kind;
  return `<section class="settings-section" id="dataSection">
    <h3>Your data</h3>
    <div class="data-status ${st.tone}"><i class="bi ${st.tone === 'ok' ? 'bi-shield-check' : 'bi-exclamation-triangle'}"></i>
      <div><b>${escapeHtml(st.text)}</b>
      <div class="small text-body-secondary">${
        kind === 'local'
          ? 'Local mode: everything is written to an Excel workbook on this device, with hourly backups. Clearing your browser will not lose anything.'
          : kind === 'folder'
          ? 'Saved automatically a few seconds after each change, keeping the previous copy as well.'
          : kind === 'folder-paused'
          ? 'Your browser needs permission again after a restart. One tap reconnects it.'
          : 'Everything is in this browser only. Save an Excel backup now and then: it also opens in Excel, and you can restore from it after clearing browser data or on a new phone.'
      }</div></div>
    </div>
    <div class="d-flex flex-wrap gap-2 mt-2">
      <button class="btn btn-primary btn-sm" data-data="download"><i class="bi bi-file-earmark-excel me-1"></i>Save Excel backup</button>
      <label class="btn btn-outline-primary btn-sm mb-0"><i class="bi bi-upload me-1"></i>Restore from Excel…<input type="file" id="restoreFile" accept=".xlsx" hidden></label>
      ${kind === 'local' || kind === 'folder' ? `<button class="btn btn-outline-secondary btn-sm" data-data="savenow"><i class="bi bi-arrow-repeat me-1"></i>Save now</button>` : ''}
      ${kind === 'folder-paused' ? `<button class="btn btn-warning btn-sm" data-data="resume">Reconnect folder</button>` : ''}
      ${canPickFolder() && kind !== 'local' ? `<button class="btn btn-outline-secondary btn-sm" data-data="${kind === 'folder' ? 'stopfolder' : 'folder'}">${kind === 'folder' ? 'Stop saving to the folder' : 'Save automatically to a folder…'}</button>` : ''}
    </div>
    <p class="small text-body-secondary mt-2 mb-0">The workbook has a sheet for each kind of data (flashcards, progress, chats, questions, your documents' text). You can read it in Excel, and edit or add flashcards there: changed rows and new rows with a question and answer come back in when you restore.${
      canPickFolder() || kind === 'local' ? '' : ' To have it saved automatically on your phone, run the app from Termux (see docs/DEPLOY.md, "Local mode").'
    }</p>
  </section>`;
}

export async function dataAction(action, rerender, file) {
  try {
    if (action === 'download') {
      const name = await downloadBackup({ includeFiles: true });
      toast(`Saved ${name} to your downloads.`, 'success', 5000);
    } else if (action === 'savenow') {
      toast((await saveNow()) ? 'Saved.' : `Could not save: ${localFiles.error}`, localFiles.error ? 'danger' : 'success', 4000);
    } else if (action === 'folder') {
      const name = await chooseFolder();
      toast(`Saving automatically to “${name}”.`, 'success', 5000);
    } else if (action === 'stopfolder') {
      await stopFolder();
    } else if (action === 'resume') {
      toast((await resumeFolder()) ? 'Folder reconnected.' : 'Permission was not granted.', 'info', 4000);
    } else if (action === 'restore') {
      if (!file) return;
      const hasData = await db.hasUserData();
      let mode = 'merge';
      if (hasData) {
        mode = (await confirmDialog(
          'Restore from Excel',
          'This browser already has data. “Merge” keeps whatever is newer in each record. Choose Cancel to replace everything in this browser with the file instead.',
          'Merge',
          false
        ))
          ? 'merge'
          : 'replace';
        if (mode === 'replace' && !(await confirmDialog('Replace everything?', 'Everything currently in this browser will be removed and replaced by the file.', 'Replace', true))) return;
      }
      toast('Restoring…', 'info', 2000);
      const s = await importWorkbook(file, { mode });
      toast(`Restored ${s.restored} records${s.files ? ` and ${s.files} files` : ''}${s.added ? `, added ${s.added} cards from Excel` : ''}${s.edited ? `, ${s.edited} edited in Excel` : ''}.`, 'success', 6000);
      setTimeout(() => location.reload(), 1200);
      return;
    }
  } catch (err) {
    if (err.name !== 'AbortError') toast(err.message, 'danger', 6000);
  }
  rerender?.();
}

export function renderBackupPill() {
  const pill = $('#backupPill');
  if (!pill) return;
  const st = backupStatus();
  if (localFiles.saving) {
    pill.hidden = false;
    pill.innerHTML = `<span class="backup-line"><i class="sync-dot syncing"></i><span class="label">Saving to Excel…</span></span>`;
    return;
  }
  if (st.tone !== 'warn') {
    // Nothing to nag about; the full status lives in Settings.
    pill.hidden = localFiles.kind === 'none';
    if (!pill.hidden) pill.innerHTML = `<a class="backup-line" href="#/settings" title="${escapeHtml(st.text)}"><i class="sync-dot ok"></i><span class="label">${localFiles.kind === 'local' ? 'Saved on this device' : 'Saved to your folder'}</span></a>`;
    return;
  }
  pill.hidden = false;
  pill.innerHTML = `<button class="btn btn-sm btn-outline-warning w-100" type="button" id="pillBackup"><i class="bi bi-file-earmark-excel me-1"></i><span class="label">${
    localFiles.kind === 'folder-paused' ? 'Reconnect folder' : 'Back up your data'
  }</span></button>`;
  $('#pillBackup').addEventListener('click', () => dataAction(localFiles.kind === 'folder-paused' ? 'resume' : 'download', renderBackupPill));
}
