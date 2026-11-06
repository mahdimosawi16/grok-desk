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

  w.DeskData = { init, get, subscribe, mode: () => mode, dataPath };
})(window);
