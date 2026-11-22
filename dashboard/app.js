// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, a filterable table, a
// per-protocol detail view with the model's own inputs, the netted farm
// economics and the protocol's farm plan, and the fitted model itself with
// its blind test. No network: every byte it shows is in data.js. The page
// recomputes each row from the snapshot figures, so the page's arithmetic
// and the board's data are visibly the same. The farm steps themselves come
// from the board's own strings, so the dialog and board.json cannot drift.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtMoney(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var sign = n < 0 ? '-' : '';
    return sign + usd.format(Math.abs(n));
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtFactor(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return 'x' + n.toFixed(2);
  }
  function fmtOdds(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return Math.round(n * 100) + '%';
  }

  // The fitted model in two functions: the page recomputes a row's token
  // odds and implied value from the snapshot figures and the stored
  // coefficients, and checks the numbers board.json carries.
  function oddsOf(row, model) {
    var ageYears = (row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days) / 365;
    var growth = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    var z = model.logit_intercept + model.logit_age_per_year * ageYears +
      model.logit_log_tvl * Math.log(Math.max(1, row.tvl_usd)) + model.logit_growth_per_pt * growth;
    var p = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
    return Math.round((1 - p) * 1e4) / 1e4;
  }
  function impliedOf(row, model) {
    var size = Math.exp(model.intercept + model.slope * Math.log(Math.max(1, row.tvl_usd)));
    var launch = Math.round(size);
    return Math.max(1, Math.round(launch * oddsOf(row, model)));
  }

  // The farm economics, recomputed from the row's own figures: capital and
  // hold from TVL and age, gas from the chain, cost from gas plus 5% a year
  // on the capital, expected value from implied value times one farmer's
  // share, net from expected minus cost. Same arithmetic as main.ts.
  var GAS_USD = {
    Ethereum: 4, Base: 0.05, Arbitrum: 0.1, Optimism: 0.05, Polygon: 0.02,
    Solana: 0.01, Avalanche: 0.3, BNB: 0.15, Binance: 0.15, Sonic: 0.05,
    Berachain: 0.05, Hyperliquid: 0.01, Sui: 0.01, Aptos: 0.01, Sei: 0.01,
    Mantle: 0.05, Linea: 0.05, Scroll: 0.05, zkSync: 0.1, Starknet: 0.1,
    Cosmos: 0.05, Osmosis: 0.05, Injective: 0.01, Near: 0.01, Fantom: 0.05
  };
  function capitalFor(row) {
    if (row.tvl_usd >= 5e9) return 250;
    if (row.tvl_usd >= 1e9) return 150;
    if (row.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function round2(n) { return Math.round(n * 100) / 100; }
  function econOf(row, model) {
    var chain = row.chains && row.chains.length ? row.chains[0] : 'its main chain';
    var gas = GAS_USD[chain] === undefined ? 1 : GAS_USD[chain];
    var capital = capitalFor(row);
    var hold = holdFor(row.age_days);
    var gasActions = 3 + Math.ceil(hold / 7);
    var gasUsd = round2(gasActions * gas);
    var oppUsd = round2((capital * model.opportunity_rate * hold) / 365);
    var costUsd = round2(gasUsd + oppUsd);
    var expectedUsd = round2(row.implied_value_usd * model.farmer_share);
    var netUsd = round2(expectedUsd - costUsd);
    var verdict = netUsd > 2 * costUsd ? 'FARM' : netUsd > 0 ? 'THIN' : 'SKIP';
    var breakEven = expectedUsd > gasUsd ? Math.round((expectedUsd - gasUsd) / ((model.opportunity_rate * hold) / 365)) : null;
    return { capital: capital, hold: hold, gasActions: gasActions, gasUsd: gasUsd, oppUsd: oppUsd, costUsd: costUsd, expectedUsd: expectedUsd, netUsd: netUsd, verdict: verdict, breakEven: breakEven };
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function verdictClass(v) {
    if (v === 'FARM') return 'farm';
    if (v === 'THIN') return 'thin';
    return 'skip';
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model, fitted on ' + DATA.model.comps + ' live-token comps' })
      )
    );
  }

  function lede() {
    var k = DATA.kpis;
    var verdictText = k.farm + ' FARM · ' + k.thin + ' THIN · ' + k.skip + ' SKIP';
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by fitted implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, every one the snapshot holds. Implied value is a fitted model, not a promise: it is what a token would be worth if the protocol issued one and its record stayed as it is.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Median implied value' }), el('b', { text: fmtUsd(k.median_implied) })),
        el('div', { class: 'fact' }, el('span', { text: 'Farm verdicts' }), el('b', { text: verdictText })),
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist TVL' }), el('b', { text: fmtUsd(k.watchlist_tvl) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token comps' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function strips() {
    var ig = DATA.integrity;
    var reasonText = ig.reasons.map(function (r) { return r.reason + ' ' + r.count; }).join(' · ');
    var topText = DATA.kpis.top3.map(function (t, i) { return (i + 1) + '. ' + t.name + ' ' + fmtUsd(t.implied); }).join(' · ');
    return el('section', { class: 'strips' },
      el('p', { class: 'strip' },
        el('b', { text: 'Integrity: ' }),
        document.createTextNode(ig.scanned + ' protocols scanned = ' + ig.ranked + ' ranked pre-token + ' + ig.excluded + ' pre-token excluded + ' + ig.traded + ' traded. ')
      ),
      el('p', { class: 'strip sub' }, el('b', { text: 'Excluded: ' }), document.createTextNode(reasonText + '.')),
      el('p', { class: 'strip sub' }, el('b', { text: 'Top implied: ' }), document.createTextNode(topText + '.'))
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token comparables' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'verdict ' + verdictClass(r.verdict), text: r.verdict }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model, its netted farm verdict and its farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Verdict' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these ' + DATA.live.length + ' protocols already trade, so their market cap is a fact, not a model. They are the comparables the size curve is fitted on, and they are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var h = m.heldout;
    var odds = DATA.rows.map(function (r) { return r.token_probability; });
    var minOdds = Math.min.apply(null, odds);
    var maxOdds = Math.max.apply(null, odds);
    var head = ['Candidate', 'Fold A (n=' + h.folds[0].n + ')', 'Fold B (n=' + h.folds[1].n + ')', 'Mean'];
    var body = [
      ['radar-3: size curve alone', h.folds[0].radar3, h.folds[1].radar3, h.mean.radar3],
      ['v1 formula: size x category x growth x maturity', h.folds[0].v1_formula, h.folds[1].v1_formula, h.mean.v1_formula],
      ['size curve + category factors', h.folds[0].size_category, h.folds[1].size_category, h.mean.size_category],
      ['joint fit: log TVL + growth + age', h.folds[0].joint, h.folds[1].joint, h.mean.joint],
      ['flat 0.25x TVL', h.folds[0].flat, h.folds[1].flat, h.mean.flat]
    ];
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is fitted, and what the blind test kept' }),
      el('p', { class: 'sub', text: 'One function scores every row, fitted at run time on the snapshot\u2019s own figures (' + m.comps + ' live-token comparables for the value, all 758 protocols for the odds). No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( exp(' + m.intercept + ' + ' + m.slope + ' x ln(tvl_usd)) x token_odds )'
      ),
      el('p', { class: 'sub', text: 'The size curve is sublinear (slope ' + m.slope + ', R\u00b2 ' + m.r2 + '): a protocol ten times bigger is worth only about three times more per dollar of TVL. Token odds come from a logistic fit on every protocol: each extra year with no token adds ' + m.logit_age_per_year + ' to the log-odds of having one, so older no-token protocols get lower odds (across the board the odds run ' + fmtOdds(minOdds) + ' to ' + fmtOdds(maxOdds) + '). Log TVL adds ' + m.logit_log_tvl + ' per log unit and seven-day growth ' + m.logit_growth_per_pt + ' per point.' }),
      el('p', { class: 'sub', text: 'A joint fit of log(mcap) on log TVL, growth and age gives a growth slope of ' + m.joint_growth_per_pt + ' per point and an age slope of ' + m.joint_age_per_year + ' per year (R\u00b2 ' + m.joint_r2 + '). Growth is mean-reverting across protocols: fast growers are worth less, not more. The first version paid a +0.25 momentum bonus against its own evidence; this version does not.' }),
      el('h3', { text: 'Held-out test: median |log error| predicting the comparables\u2019 market caps' }),
      el('p', { class: 'sub', text: h.split + '. Lower is better. The value part only: the comparables already have tokens, so no issuance factor applies to them.' }),
      el('table', { class: 'heldout' },
        el('thead', null, el('tr', null, head.map(function (c) { return el('th', { scope: 'col', text: c }); }))),
        el('tbody', null, body.map(function (row) {
          return el('tr', null, row.map(function (c, i) {
            return el('td', { class: i === 0 ? '' : 'num', text: typeof c === 'number' ? c.toFixed(3) : c });
          }));
        }))
      ),
      el('p', { class: 'sub', text: 'The size curve alone wins (mean ' + h.mean.radar3 + '). Adding category factors (' + h.mean.size_category + '), the joint growth and age terms (' + h.mean.joint + ') or the first version\u2019s growth and maturity terms (' + h.mean.v1_formula + ') all make the held-out error worse, so the value model keeps none of them. The flat 0.25x multiple is worst at ' + h.mean.flat + '. Every term was split-tested; only the size curve survived.' }),
      el('p', { class: 'note', text: 'Farm verdicts are netted, not asserted: expected value is implied value times one farmer\u2019s share (' + m.farmer_pool + ' farmer pool shared among an estimated ' + m.estimated_wallets.toLocaleString('en-US') + ' qualifying wallets), minus gas for every transaction plus ' + Math.round(m.opportunity_rate * 100) + '% a year on the locked-up capital. The snapshot carries no wallet counts, so the wallet estimate is a stated assumption: if the pool is shared more thinly, every row\u2019s expected value falls together.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var model = DATA.model;
    var size = Math.exp(model.intercept + model.slope * Math.log(Math.max(1, row.tvl_usd)));
    var recomputed = impliedOf(row, model);
    var econ = econOf(row, model);
    var econOk = econ.expectedUsd === row.expected_value_usd && econ.costUsd === row.farm_cost_usd &&
      econ.netUsd === row.net_value_usd && econ.verdict === row.verdict && econ.breakEven === row.break_even_deposit_usd;
    var claimDate = new Date(DATA.as_of + 'T00:00:00Z');
    claimDate.setUTCDate(claimDate.getUTCDate() + econ.hold);
    var claimStr = claimDate.toISOString().slice(0, 10);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + '  ·  ' + row.verdict }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Launch value' }), el('b', { class: 'num', text: fmtUsd(row.launch_value) })),
        el('div', null, el('span', { text: 'Token odds' }), el('b', { class: 'num', text: fmtOdds(row.token_probability) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': launch value times token odds. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm verdict: ' + row.verdict }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Expected value' }), el('b', { class: 'num', text: fmtMoney(row.expected_value_usd) })),
        el('div', null, el('span', { text: 'Gas (' + econ.gasActions + ' transactions)' }), el('b', { class: 'num', text: fmtMoney(row.gas_usd) })),
        el('div', null, el('span', { text: 'Opportunity (' + fmtMoney(row.capital_usd) + ' at 5%/yr, ' + econ.hold + 'd)' }), el('b', { class: 'num', text: fmtMoney(row.opportunity_usd) })),
        el('div', null, el('span', { text: 'Farm cost' }), el('b', { class: 'num', text: fmtMoney(row.farm_cost_usd) })),
        el('div', null, el('span', { text: 'Net (expected - cost)' }), el('b', { class: 'num', text: fmtMoney(row.net_value_usd) })),
        el('div', null, el('span', { text: 'Break-even deposit' }), el('b', { class: 'num', text: row.break_even_deposit_usd === null ? 'none pays' : fmtMoney(row.break_even_deposit_usd) }))
      ),
      el('p', { class: 'sub', text: 'Expected value is implied value times one farmer\u2019s share (' + model.farmer_pool + ' pool / ' + model.estimated_wallets.toLocaleString('en-US') + ' wallets). FARM when the net beats twice the cost, THIN when it beats the cost, SKIP when it does not. The page recomputes the net as ' + fmtMoney(econ.netUsd) + ' and the verdict as ' + econ.verdict + (econOk ? ', the same numbers the board carries.' : ' — which differs from the board: the data would be stale.') }),
      el('p', { class: 'sub', text: 'Plan runs ' + DATA.as_of + ' to ' + claimStr + ' (' + econ.hold + ' days). The break-even deposit is a ceiling: above it the opportunity cost eats the expected value' + (row.break_even_deposit_usd === null ? '; here even the gas alone costs more than the expected value.' : '.') })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(strips());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
