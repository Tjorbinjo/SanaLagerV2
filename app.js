(() => {
  const { createClient } = window.supabase;
  const client = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  const app = document.querySelector('#app');
  const dialog = document.querySelector('#dialog');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const errorText = error => error?.message || 'Die Anfrage konnte nicht verarbeitet werden.';
  const status = value => `<span class="badge ${value === 'einsatzbereit' || value === 'gebucht' ? 'success' : value === 'offen' ? 'warning' : 'danger-badge'}">${esc(value)}</span>`;
  let state = { profile: null, items: [], backpacks: [], reports: [], movements: [] };

  async function load() {
    const [items, backpacks, reports, movements] = await Promise.all([
      client.from('items').select('*').eq('active', true).order('name'),
      client.from('backpacks').select('*, backpack_items(*)').order('id'),
      client.from('reports').select('*').order('created_at', { ascending: false }),
      client.from('stock_movements').select('*, items(name, unit)').order('created_at', { ascending: false }).limit(30),
    ]);
    const failed = [items, backpacks, reports, movements].find(result => result.error);
    if (failed) throw failed.error;
    state.items = items.data || [];
    state.backpacks = backpacks.data || [];
    state.reports = reports.data || [];
    state.movements = movements.data || [];
  }

  function layout(content) {
    return `<div class="shell"><aside class="sidebar"><div class="brand"><span class="cross"></span><span>DEUTSCHES ROTES KREUZ<small>Sanitätslager</small></span></div><nav class="nav"><button data-view="dashboard">Übersicht</button><button data-view="warehouse">Lager</button><button data-view="backpacks">Sanitätsrucksäcke</button><button data-view="reports">Verbrauchsmeldungen</button></nav><button id="logout" class="button secondary side-bottom">Abmelden</button></aside><main class="main"><header class="topbar"><div><small>SANITÄTSLAGER</small><h1 id="title">Übersicht</h1></div><div class="topbar-actions"><button class="button secondary" data-helper-qr>Helfer-QR-Code</button><button class="button secondary" data-receive>+ Wareneingang</button><button class="button primary" data-new-item>+ Artikel</button></div></header><section id="view" class="content">${content}</section></main></div>`;
  }

  function dashboard() {
    const openReports = state.reports.filter(report => report.status === 'offen');
    const lowStock = state.items.filter(item => item.stock <= item.minimum);
    return `<div class="intro"><p class="eyebrow">LAGERSTATUS</p><h2>Arbeitsübersicht</h2><p class="muted">Bestände pflegen, Verbrauch prüfen und Rucksäcke auffüllen.</p></div><div class="metrics"><div class="metric"><strong>${state.items.length}</strong><span>Artikel</span></div><div class="metric"><strong>${state.backpacks.length}</strong><span>Rucksäcke</span></div><div class="metric"><strong>${lowStock.length}</strong><span>Nachbestellen</span></div><div class="metric"><strong>${openReports.length}</strong><span>Offene Meldungen</span></div></div><div class="grid"><section class="panel"><h3>Nachbestellen</h3><div class="list">${lowStock.map(item => `<div class="list-row"><div><strong>${esc(item.name)}</strong><small>${item.stock} ${esc(item.unit)} vorhanden · Warnschwelle ${item.minimum}</small></div><span class="badge warning">Prüfen</span></div>`).join('') || '<p class="empty">Keine Bestandswarnungen.</p>'}</div></section><section class="panel"><h3>Offene Verbrauchsmeldungen</h3><div class="list">${openReports.slice(0, 6).map(report => `<div class="list-row"><div><strong>Rucksack ${report.backpack_id}</strong><small>${esc(report.reporter_name)} · ${new Date(report.created_at).toLocaleDateString('de-DE')}</small></div>${status('offen')}</div>`).join('') || '<p class="empty">Keine offenen Meldungen.</p>'}</div></section></div>`;
  }

  function itemsView() {
    return `<div class="intro"><p class="eyebrow">LAGER</p><h2>Artikel und Bestände</h2><p class="muted">Wareneingänge, Mindestbestände und Korrekturen gehören hierher. Rucksackinhalte verwaltest du separat unter „Sanitätsrucksäcke“.</p></div><section class="panel table-wrap"><table class="table"><thead><tr><th>Artikel</th><th>Bestand</th><th>Warnschwelle</th><th>Einheit</th><th>Aktionen</th></tr></thead><tbody>${state.items.map(item => `<tr><td><strong>${esc(item.name)}</strong></td><td class="${item.stock <= item.minimum ? 'stock-low' : ''}">${item.stock}</td><td>${item.minimum}</td><td>${esc(item.unit)}</td><td><div class="row-actions"><button class="button secondary" data-receive-item="${item.id}">Eingang</button><button class="button secondary" data-adjust-item="${item.id}">Korrektur</button><button class="button secondary" data-edit-item="${item.id}">Stammdaten</button></div></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Noch keine Artikel angelegt.</td></tr>'}</tbody></table></section><section class="panel spaced-panel"><h3>Letzte Lagerbuchungen</h3><p class="muted">Wareneingänge und Bestandskorrekturen</p><div class="table-wrap"><table class="table"><thead><tr><th>Datum</th><th>Artikel</th><th>Änderung</th><th>Grund</th><th>Notiz</th></tr></thead><tbody>${state.movements.map(move => `<tr><td>${new Date(move.created_at).toLocaleString('de-DE')}</td><td>${esc(move.items?.name || 'Artikel')}</td><td class="${move.change < 0 ? 'stock-low' : 'stock-up'}">${move.change > 0 ? '+' : ''}${move.change} ${esc(move.items?.unit || '')}</td><td>${esc(move.reason)}</td><td>${esc(move.note) || '-'}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Noch keine Lagerbuchungen.</td></tr>'}</tbody></table></div></section>`;
  }

  function backpacksView() {
    return `<div class="intro"><p class="eyebrow">RUCKSACKBESTAND</p><h2>Sanitätsrucksäcke</h2><p class="muted">Packlisten mit Sollmengen pflegen, den aktuellen Inhalt sehen und nach einer Meldung auffüllen.</p></div><div class="backpacks">${state.backpacks.map(pack => { const complete = pack.backpack_items.filter(row => row.stock >= row.target_quantity).length; const missing = pack.backpack_items.filter(row => row.stock < row.target_quantity).length; return `<article class="panel"><div class="backpack-head"><div><p class="eyebrow">${esc(pack.identifier)}</p><h3>${esc(pack.name)}</h3></div>${status(missing ? 'nicht einsatzbereit' : 'einsatzbereit')}</div><p class="muted">${complete}/${pack.backpack_items.length} Positionen vollständig${missing ? ` · ${missing} fehlen` : ''}</p><div class="pack-preview">${pack.backpack_items.slice(0, 4).map(row => { const item = state.items.find(candidate => candidate.id === row.item_id); return `<div>${esc(item?.name || 'Artikel')} <strong>${row.stock}/${row.target_quantity}</strong></div>`; }).join('') || '<p class="empty">Noch keine Packliste.</p>'}</div><div class="card-actions"><button class="button secondary" data-edit-pack="${pack.id}">Packliste bearbeiten</button><button class="button primary" data-refill="${pack.id}">Auffüllen</button></div></article>`; }).join('')}</div>`;
  }

  function reportsView() {
    return `<div class="intro"><p class="eyebrow">EINGEGANGEN</p><h2>Verbrauchsmeldungen</h2><p class="muted">Verbrauch buchen. Danach den betroffenen Rucksack auffüllen.</p></div><section class="panel table-wrap"><table class="table"><thead><tr><th>Rucksack</th><th>Helfer</th><th>Verbrauch</th><th>Status</th><th>Aktion</th></tr></thead><tbody>${state.reports.map(report => `<tr><td>Rucksack ${report.backpack_id}</td><td>${esc(report.reporter_name)}<small>${esc(report.note)}</small></td><td>${(report.entries || []).map(entry => `${entry.amount} × ${esc(entry.name)}`).join('<br>')}</td><td>${status(report.status)}</td><td>${report.status === 'offen' ? `<button class="button primary" data-book="${report.id}">Verbrauch buchen</button>` : '<span class="muted">Erledigt</span>'}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Noch keine Meldungen.</td></tr>'}</tbody></table></section>`;
  }

  async function render(view = 'dashboard') {
    try {
      await load();
      app.innerHTML = layout({ dashboard, warehouse: itemsView, backpacks: backpacksView, reports: reportsView }[view]());
      document.querySelector('#title').textContent = ({ dashboard: 'Übersicht', warehouse: 'Lager', backpacks: 'Sanitätsrucksäcke', reports: 'Verbrauchsmeldungen' })[view];
      document.querySelectorAll('[data-view]').forEach(button => { button.classList.toggle('active', button.dataset.view === view); button.onclick = () => render(button.dataset.view); });
      document.querySelector('#logout').onclick = async () => { await client.auth.signOut(); renderLogin(); };
      document.querySelector('[data-helper-qr]').onclick = showHelperQr;
      document.querySelector('[data-receive]').onclick = () => openReceiveDialog();
      document.querySelector('[data-new-item]').onclick = () => openItemDialog();
      document.querySelectorAll('[data-edit-item]').forEach(button => { button.onclick = () => openItemDialog(state.items.find(item => item.id === button.dataset.editItem)); });
      document.querySelectorAll('[data-receive-item]').forEach(button => { button.onclick = () => openReceiveDialog(state.items.find(item => item.id === button.dataset.receiveItem)); });
      document.querySelectorAll('[data-adjust-item]').forEach(button => { button.onclick = () => openAdjustDialog(state.items.find(item => item.id === button.dataset.adjustItem)); });
      document.querySelectorAll('[data-edit-pack]').forEach(button => { button.onclick = () => openPackDialog(state.backpacks.find(pack => String(pack.id) === button.dataset.editPack)); });
      document.querySelectorAll('[data-refill]').forEach(button => { button.onclick = () => refill(button.dataset.refill); });
      document.querySelectorAll('[data-book]').forEach(button => { button.onclick = () => book(button.dataset.book); });
    } catch (error) { app.innerHTML = `<main class="login"><p class="error">${esc(errorText(error))}</p></main>`; }
  }

  function showHelperQr() {
    const helperUrl = new URL('helper.html', window.location.href).href;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(helperUrl)}`;
    dialog.innerHTML = `<section class="dialog qr-dialog"><p class="eyebrow">MOBILE VERBRAUCHSLISTE</p><h2>Helfer-QR-Code</h2><p class="muted">Diesen Code können Helfer mit der Handykamera scannen. Der Link wird automatisch aus deiner aktuellen Website-Adresse erzeugt.</p><img class="qr-image" src="${qrUrl}" alt="QR-Code zur Helfer-Seite"><p class="qr-link">${esc(helperUrl)}</p><div class="dialog-actions"><button class="button secondary" data-close-dialog>Schließen</button><a class="button primary" href="${qrUrl}" download="moers-sanlager-helfer-qr.png">QR-Code herunterladen</a></div></section>`;
    dialog.showModal();
    dialog.querySelector('[data-close-dialog]').onclick = () => dialog.close();
  }

  function openReceiveDialog(item = null) {
    dialog.innerHTML = `<form method="dialog" class="dialog form"><h2>Wareneingang buchen</h2><p class="muted">Der Lagerbestand wird um die Zugangsmenge erhöht und als Buchung gespeichert.</p><label>Artikel<select name="item" required><option value="">Bitte auswählen</option>${state.items.map(candidate => `<option value="${candidate.id}" ${candidate.id === item?.id ? 'selected' : ''}>${esc(candidate.name)} · Bestand ${candidate.stock} ${esc(candidate.unit)}</option>`).join('')}</select></label><label>Zugangsmenge<input name="amount" type="number" min="1" step="1" required></label><label>Notiz<input name="note" maxlength="200" placeholder="z. B. Lieferung vom ..."></label><div class="dialog-actions"><button class="button secondary">Abbrechen</button><button class="button primary" value="save">Wareneingang buchen</button></div><p id="dialog-error" class="error"></p></form>`;
    dialog.showModal();
    dialog.querySelector('form').onsubmit = async event => { if (event.submitter?.value !== 'save') return; event.preventDefault(); const form = event.target; const result = await client.rpc('receive_stock', { item_id_value: form.item.value, amount_value: Number(form.amount.value), note_value: form.note.value.trim() }); if (result.error) { dialog.querySelector('#dialog-error').textContent = errorText(result.error); return; } dialog.close(); render('warehouse'); };
  }

  function openAdjustDialog(item) {
    dialog.innerHTML = `<form method="dialog" class="dialog form"><h2>Bestand korrigieren</h2><p class="muted">${esc(item.name)} · aktueller Bestand: ${item.stock} ${esc(item.unit)}</p><label>Neuer Bestand<input name="stock" type="number" min="0" step="1" value="${item.stock}" required></label><label>Begründung<input name="note" maxlength="200" placeholder="z. B. Zählkorrektur oder beschädigtes Material" required></label><div class="dialog-actions"><button class="button secondary">Abbrechen</button><button class="button primary" value="save">Korrektur speichern</button></div><p id="dialog-error" class="error"></p></form>`;
    dialog.showModal();
    dialog.querySelector('form').onsubmit = async event => { if (event.submitter?.value !== 'save') return; event.preventDefault(); const form = event.target; const result = await client.rpc('adjust_stock', { item_id_value: item.id, new_stock_value: Number(form.stock.value), note_value: form.note.value.trim() }); if (result.error) { dialog.querySelector('#dialog-error').textContent = errorText(result.error); return; } dialog.close(); render('warehouse'); };
  }

  function openItemDialog(item = null) {
    dialog.innerHTML = `<form method="dialog" class="dialog form"><h2>${item ? 'Artikel bearbeiten' : 'Artikel anlegen'}</h2><label>Artikelname<input name="name" value="${esc(item?.name || '')}" required></label><label>Einheit<input name="unit" value="${esc(item?.unit || 'Stück')}" required></label><label>Aktueller Lagerbestand<input name="stock" type="number" min="0" value="${item?.stock || 0}" required></label><label>Warnschwelle<input name="minimum" type="number" min="0" value="${item?.minimum || 0}" required></label><div class="dialog-actions"><button class="button secondary">Abbrechen</button><button class="button primary" value="save">Speichern</button></div><p id="dialog-error" class="error"></p></form>`;
    dialog.showModal();
    dialog.querySelector('form').onsubmit = async event => { if (event.submitter?.value !== 'save') return; event.preventDefault(); const form = event.target; const values = { name: form.name.value.trim(), unit: form.unit.value.trim(), stock: Number(form.stock.value), minimum: Number(form.minimum.value) }; const result = item ? await client.from('items').update(values).eq('id', item.id) : await client.from('items').insert(values); if (result.error) { dialog.querySelector('#dialog-error').textContent = errorText(result.error); return; } dialog.close(); render('items'); };
  }

  function openPackDialog(pack) {
    const selected = new Map(pack.backpack_items.map(row => [row.item_id, row]));
    dialog.innerHTML = `<form method="dialog" class="dialog form"><h2>${esc(pack.name)} · Packliste</h2><p class="muted">Wähle Material aus und trage die gewünschte Sollmenge ein.</p><div class="pack-editor">${state.items.map(item => { const row = selected.get(item.id); return `<label class="pack-line"><input type="checkbox" name="item" value="${item.id}" ${row ? 'checked' : ''}><span>${esc(item.name)}<small>${esc(item.unit)}</small></span><input name="target-${item.id}" type="number" min="1" value="${row?.target_quantity || 1}" ${row ? '' : 'disabled'}></label>`; }).join('')}</div><div class="dialog-actions"><button class="button secondary">Abbrechen</button><button class="button primary" value="save">Packliste speichern</button></div><p id="dialog-error" class="error"></p></form>`;
    dialog.showModal();
    dialog.querySelectorAll('[name=item]').forEach(check => { check.onchange = () => { dialog.querySelector(`[name="target-${check.value}"]`).disabled = !check.checked; }; });
    dialog.querySelector('form').onsubmit = async event => { if (event.submitter?.value !== 'save') return; event.preventDefault(); const form = event.target; const rows = [...form.querySelectorAll('[name=item]:checked')].map(check => ({ item_id: check.value, target_quantity: Number(form.elements[`target-${check.value}`].value) })); const result = await client.rpc('save_packlist', { backpack_id_value: pack.id, entries: rows }); if (result.error) { dialog.querySelector('#dialog-error').textContent = errorText(result.error); return; } dialog.close(); render('backpacks'); };
  }

  async function book(id) { const result = await client.rpc('book_consumption', { report_id: id }); if (result.error) return alert(errorText(result.error)); render('reports'); }
  async function refill(id) { const result = await client.rpc('refill_backpack', { backpack_id_value: Number(id) }); if (result.error) return alert(errorText(result.error)); render('backpacks'); }
  function renderLogin() { app.innerHTML = `<main class="login"><section class="login-form"><div class="brand"><span class="cross"></span><span>DEUTSCHES ROTES KREUZ<small>Sanitätslager</small></span></div><h1>Anmelden</h1><form id="login" class="form"><label>E-Mail<input name="email" type="email" required></label><label>Passwort<input name="password" type="password" required></label><button class="button primary">Anmelden</button><p id="error" class="error"></p></form></section><aside class="login-side"><h2>Alles im Blick. Schnell wieder aufgefüllt.</h2></aside></main>`; document.querySelector('#login').onsubmit = async event => { event.preventDefault(); const form = new FormData(event.target); const result = await client.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') }); if (result.error) document.querySelector('#error').textContent = errorText(result.error); else start(); }; }
  async function start() { const session = await client.auth.getSession(); if (session.error || !session.data.session) return renderLogin(); const profile = await client.from('profiles').select('*').eq('id', session.data.session.user.id).single(); if (profile.error) return renderLogin(); state.profile = profile.data; render(); }
  start();
})();
