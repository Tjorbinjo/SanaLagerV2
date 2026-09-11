(() => {
  const { createClient } = window.supabase;
  const client = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  const app = document.querySelector('#helper-app');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const normalize = value => String(value || '').trim().toLocaleLowerCase('de-DE');

  async function start() {
    const [backpacks, items] = await Promise.all([
      client.from('backpacks').select('id,name,identifier,backpack_items(item_id,target_quantity)').order('id'),
      client.from('items').select('id,name,unit').eq('active', true).order('name'),
    ]);
    if (backpacks.error || items.error) { app.innerHTML = '<p class="error">Die Materialliste konnte nicht geladen werden.</p>'; return; }
    app.innerHTML = `<main class="helper"><div class="brand"><span class="cross"></span><span>DEUTSCHES ROTES KREUZ<small>Sanitätsdienst</small></span></div><p class="eyebrow">MOBILE VERBRAUCHSLISTE</p><h1>Materialverbrauch melden</h1><p class="muted">Wähle den Rucksack und schreibe jeden verbrauchten Artikel in das Textfeld. Die Vorschläge helfen bei der Schreibweise.</p><form id="report" class="panel form"><label>Rucksack<select name="backpack" required><option value="">Bitte auswählen</option>${backpacks.data.map(pack => `<option value="${pack.id}">${esc(pack.name)} · ${esc(pack.identifier)}</option>`).join('')}</select></label><label>Dein Name<input name="name" required autocomplete="name"></label><label>Bemerkung<textarea name="note" rows="3"></textarea></label><div><strong>Verbrauchte Artikel</strong><div id="rows"></div><button type="button" class="button secondary" id="add">+ Artikel hinzufügen</button></div><p id="error" class="error"></p><button class="button primary">Verbrauch melden</button></form></main>`;
    const rows = document.querySelector('#rows');
    const packSelect = document.querySelector('[name=backpack]');
    const suggestions = pack => (pack?.backpack_items || []).map(entry => items.data.find(item => item.id === entry.item_id)).filter(Boolean);
    const addRow = () => { const pack = backpacks.data.find(item => item.id === Number(packSelect.value)); const listId = `items-${Date.now()}-${Math.random().toString(16).slice(2)}`; const row = document.createElement('div'); row.className = 'helper-entry'; row.innerHTML = `<label>Artikel<input name="item" list="${listId}" placeholder="z. B. Verbandpäckchen" required><datalist id="${listId}">${suggestions(pack).map(item => `<option value="${esc(item.name)}">`).join('')}</datalist></label><label>Menge<input name="amount" type="number" min="1" value="1" required></label>`; rows.append(row); };
    const refreshSuggestions = () => { const pack = backpacks.data.find(item => item.id === Number(packSelect.value)); rows.querySelectorAll('datalist').forEach(list => { list.innerHTML = suggestions(pack).map(item => `<option value="${esc(item.name)}">`).join(''); }); };
    addRow();
    packSelect.onchange = refreshSuggestions;
    document.querySelector('#add').onclick = addRow;
    document.querySelector('#report').onsubmit = async event => {
      event.preventDefault();
      const form = event.target;
      const pack = backpacks.data.find(item => item.id === Number(form.backpack.value));
      const packItems = suggestions(pack);
      const entries = [...rows.querySelectorAll('.helper-entry')].map(row => { const name = row.querySelector('[name=item]').value.trim(); const match = packItems.find(item => normalize(item.name) === normalize(name)); return { item_id: match?.id || null, name, amount: Number(row.querySelector('[name=amount]').value) }; });
      const invalid = entries.some(entry => !entry.name || !Number.isInteger(entry.amount) || entry.amount < 1);
      if (invalid) { document.querySelector('#error').textContent = 'Bitte Artikel und positive Mengen eintragen.'; return; }
      const result = await client.from('reports').insert({ backpack_id: Number(form.backpack.value), reporter_name: form.name.value, note: form.note.value, entries });
      if (result.error) document.querySelector('#error').textContent = result.error.message; else form.innerHTML = '<h2>Danke!</h2><p class="muted">Die Verbrauchsmeldung wurde an das Lager gesendet.</p>';
    };
  }
  start();
})();
