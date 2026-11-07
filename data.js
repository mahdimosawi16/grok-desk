/* Data layer: Supabase Realtime primary, REST fallback, optional Pages JSON via #d= */
(function (w) {
  'use strict';
  const cfg = w.DESK_CONFIG || {};
  let client = null;
  let mode = 'none'; // supabase | pages | none
  const DATA_KEY = 'desk.dataPath';

  function dataPath() {
    try {
      const d = location.hash.match(/(?:^#|&)d=([^&]+)/);
      if (d) { localStorage.setItem(DATA_KEY, decodeURIComponent(d[1])); }
      return localStorage.getItem(DATA_KEY) || cfg.dataPath || '';
    } catch (e) { return cfg.dataPath || ''; }
  }

  function init() {
    if (cfg.supabaseUrl && cfg.supabaseAnonKey && w.supabase) {
      client = w.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        realtime: { params: { eventsPerSecond: 5 } },
      });
      mode = 'supabase';
      return mode;
    }
    if (dataPath()) { mode = 'pages'; return mode; }
    mode = 'none';
    return mode;
  }

  async function restOne(table, filter) {
    const url = new URL(cfg.supabaseUrl + '/rest/v1/' + table);
    Object.keys(filter || {}).forEach((k) => url.searchParams.set(k, filter[k]));
    url.searchParams.set('select', 'payload,updated_at');
    const r = await fetch(url, {
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: 'Bearer ' + cfg.supabaseAnonKey,
      },
      cache: 'no-store',
    });
    if (!r.ok) throw Object.assign(new Error('rest ' + r.status), { status: r.status });
    const rows = await r.json();
    return rows[0] || null;
  }

  async function restRows(table, params) {
    const url = new URL(cfg.supabaseUrl + '/rest/v1/' + table);
    Object.keys(params || {}).forEach((k) => url.searchParams.set(k, params[k]));
    const r = await fetch(url, {
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: 'Bearer ' + cfg.supabaseAnonKey,
      },
      cache: 'no-store',
    });
    if (!r.ok) throw Object.assign(new Error('rest ' + r.status), { status: r.status });
    return r.json();
  }

  async function pagesGet(apiPath) {
    const base = 'd/' + encodeURIComponent(dataPath()).replace(/%2F/g, '/');
    const u = new URL(apiPath, location.origin);
    const p = u.pathname.replace(/^\/api\//, '');
    let file = null;
    if (p === 'state') file = base + '/state.json';
    else if (p === 'chart') file = base + '/chart_' + (u.searchParams.get('range') || 'LIVE').toUpperCase() + '.json';
    else if (p === 'activity') file = base + '/activity.json';
    else if (p === 'account') file = base + '/account.json';
    else if (p === 'settings') file = base + '/settings.json';
    else if (p.startsWith('coin/')) file = base + '/coin/' + encodeURIComponent(p.slice(5)) + '.json';
    else if (p.startsWith('audit/')) file = base + '/audit/' + encodeURIComponent(p.slice(6)) + '.json';
    else if (/^agents\/[^/]+\/decisions$/.test(p)) file = base + '/agents/' + p.split('/')[1] + '_decisions.json';
    else return null;
    const r = await fetch(file + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw Object.assign(new Error('pages ' + r.status), { status: r.status });
    return r.json();
  }

  async function get(apiPath) {
    if (mode === 'none') init();
    if (mode === 'supabase') {
      try {
        const u = new URL(apiPath, 'https://x');
        const p = u.pathname.replace(/^\/api\//, '');
        if (p === 'state') {
          const row = await restOne('desk_state', { id: 'eq.1' });
          return row ? row.payload : null;
        }
        if (p === 'chart') {
          const range = (u.searchParams.get('range') || 'LIVE').toUpperCase();
          const row = await restOne('desk_chart', { range: 'eq.' + range });
          return row ? row.payload : { points: [], start: 0, marks: [] };
        }
        if (p === 'activity') {
          const row = await restOne('desk_activity', { id: 'eq.1' });
          return row ? row.payload : { rows: [], next: null };
        }
        if (p === 'account') {
          const row = await restOne('desk_account', { id: 'eq.1' });
          return row ? row.payload : {};
        }
        if (p === 'settings') {
          const row = await restOne('desk_settings', { id: 'eq.1' });
          return row ? row.payload : {};
        }
        if (p.startsWith('coin/')) {
          const mint = decodeURIComponent(p.slice(5));
          const row = await restOne('desk_coins', { mint: 'eq.' + mint });
          if (!row) { const er = new Error('not found'); er.status = 404; throw er; }
          return row.payload;
        }
        if (p.startsWith('audit/')) {
          const mint = decodeURIComponent(p.slice(6));
          const row = await restOne('desk_audits', { mint: 'eq.' + mint });
          return row ? row.payload : { layers: [] };
        }
        if (/^agents\/[^/]+\/decisions$/.test(p)) {
          const agent = p.split('/')[1];
          const row = await restOne('desk_agent_decisions', { agent: 'eq.' + agent });
          return row ? row.payload : { rows: [] };
        }
        if (p === 'search') return { rows: [] };
        if (p === 'copy') return { state: 'no_traders', traders: [], hot: [], trades: [] };
        if (p === 'signals') {
          const rows = await restRows('desk_signals', {
            select: '*',
            order: 'ts.desc',
            limit: '80',
          });
          return { rows: rows || [] };
        }
        return null;
      } catch (e) {
        if (dataPath()) return pagesGet(apiPath); // fallback
        throw e;
      }
    }
    if (mode === 'pages' || dataPath()) return pagesGet(apiPath);
    throw Object.assign(new Error('no data backend'), { status: 0 });
  }

  function subscribe(onState) {
    if (mode !== 'supabase' || !client) return () => {};
    const ch = client.channel('desk-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'desk_state' }, (payload) => {
        if (payload.new && payload.new.payload) onState(payload.new.payload);
      })
      .subscribe();
    return () => { try { client.removeChannel(ch); } catch (e) {} };
  }

  function subscribeSignals(onRow) {
    if (mode !== 'supabase' || !client) return () => {};
    const ch = client.channel('desk-signals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'desk_signals' }, (payload) => {
        if (payload.new) onRow(payload.new, payload.eventType || 'INSERT');
      })
      .subscribe();
    return () => { try { client.removeChannel(ch); } catch (e) {} };
  }

  async function select(table, params) {
    if (mode === 'none') init();
    if (mode !== 'supabase') throw Object.assign(new Error('no data backend'), { status: 0 });
    return restRows(table, params);
  }

  async function rpc(fn, args) {
    if (mode === 'none') init();
    if (mode !== 'supabase') throw Object.assign(new Error('no data backend'), { status: 0 });
    const r = await fetch(cfg.supabaseUrl + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: 'Bearer ' + cfg.supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args || {}),
      cache: 'no-store',
    });
    const text = await r.text();
    let body = null;
    if (text) { try { body = JSON.parse(text); } catch (e) { body = text; } }
    if (!r.ok) {
      const msg = (body && (body.message || body.error || body.hint)) || ('rpc ' + r.status);
      throw Object.assign(new Error(msg), { status: r.status, body });
    }
    return body;
  }

  /* First full snapshot is silent. Later ids sound. partial=true queues rows that
     arrive before the first snapshot (realtime) so history loaded with the page stays quiet. */
  function diffPaperSignals(state, rows, partial) {
    const prevIds = new Set((state && state.ids) || []);
    const pending = (state && state.pending) || [];
    const list = rows || [];
    const soundOf = (r) => (r && r.kind === 'paper_buy' ? 'buy' : r && r.kind === 'paper_sell' ? 'sell' : null);
    if (!state || !state.ready) {
      if (partial) return { ready: false, ids: [...prevIds], pending: pending.concat(list), sounds: [] };
      const ids = new Set(prevIds);
      list.forEach((r) => { if (r && r.id != null) ids.add(String(r.id)); });
      const sounds = [];
      pending.forEach((r) => {
        if (!r || r.id == null) return;
        const id = String(r.id);
        if (ids.has(id)) return;
        ids.add(id);
        const s = soundOf(r); if (s) sounds.push(s);
      });
      return { ready: true, ids: [...ids], pending: [], sounds };
    }
    const ids = new Set(prevIds);
    const sounds = [];
    list.forEach((r) => {
      if (!r || r.id == null) return;
      const id = String(r.id);
      if (ids.has(id)) return;
      ids.add(id);
      const s = soundOf(r); if (s) sounds.push(s);
    });
    return { ready: true, ids: [...ids], pending: [], sounds };
  }

  /* New open row = buy. open -> closed = sell. Rows already present, or first seen already closed, stay quiet.
     qty/cost going to 0 is not itself a sell. Ids missing from this page keep their last status. */
  function diffCopyPositions(state, rows) {
    const prev = state && state.ready ? (state.status || {}) : null;
    const status = Object.assign({}, prev || {});
    const sounds = [];
    const list = rows || [];
    if (!prev) {
      list.forEach((r) => { if (r && r.id != null) status[String(r.id)] = r.status || ''; });
      return { ready: true, status, sounds };
    }
    list.forEach((r) => {
      if (!r || r.id == null) return;
      const id = String(r.id);
      const st = r.status || '';
      const known = Object.prototype.hasOwnProperty.call(prev, id);
      if (!known && st === 'open') sounds.push('buy');
      else if (known && prev[id] === 'open' && st === 'closed') sounds.push('sell');
      status[id] = st;
    });
    return { ready: true, status, sounds };
  }

  w.DeskData = { init, get, subscribe, subscribeSignals, select, rpc, diffPaperSignals, diffCopyPositions, mode: () => mode, dataPath };
})(window);
