"""Build app/data/model_data.json from real raw extracts.

Inputs (all under data/raw, see FETCHLOG files for URL + fetch time):
  tse2026/<uf>-c0001-e006257-u.json      TSE 2026 1st-round president totals per UF (+br, zz)
  tse2026/br-e006257-ab.json             TSE 2026 per-UF sections/electorate/turnout
  tse2026/mun/<uf><cd>-c0001-e006257-u.json  TSE 2026 president totals per municipality (+ht/hg)
  tse2022_bu/bu22_<UF>_president_sections.csv  TSE 2022 boletim de urna, 1 row per section,
                                         with DT_BU_RECEBIDO (reception time, Brasilia)
  urnaaberta/ref2022_embedded.json       Urna Aberta 2022 hour-by-hour reconstruction
  ../target_partials.json                target partials (news + Urna Aberta/TSE hg)

Arrival unit: a 2022 section (472,028). 2026 municipal votes are spread over that
municipality's 2022 sections with a uniform swing (2022 section share minus 2022 municipal share
added to the 2026 municipal share), then rescaled so every municipality, state and the nation end
EXACTLY at the registered 2026 totals. Sections are then aggregated into cells
(state, municipality, zona, 2022 reception minute) to keep the file small.
"""
import csv, glob, json, os, collections, math
from datetime import datetime
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = f"{ROOT}/data/raw"
REG = {**{u: 'N' for u in 'AC AP AM PA RO RR TO'.split()}, **{u: 'NE' for u in 'AL BA CE MA PB PE PI RN SE'.split()},
       **{u: 'CO' for u in 'DF GO MT MS'.split()}, **{u: 'SE' for u in 'ES MG RJ SP'.split()},
       **{u: 'S' for u in 'PR RS SC'.split()}, 'ZZ': 'EX'}
REGIONS = ['S', 'SE', 'CO', 'N', 'NE', 'EX']
UFS = sorted(REG)
# 2026 local-time offset to Brasilia (hours to ADD to local 'ht'); TSE 'hg' is Brasilia.
TZ = {'AC': 2, 'AM': 1, 'RO': 1, 'RR': 1, 'MT': 1, 'MS': 1}
notes = []

def cand(d):
    F = L = 0
    for a in d['carg'][0]['agr']:
        for p in a['par']:
            for k in p['cand']:
                if k['n'] == '22': F = int(k['vap'])
                if k['n'] == '13': L = int(k['vap'])
    return F, L

# ---------- 2026 state totals ----------
ab = {a['cdabr'].upper(): a for a in json.load(open(f"{RAW}/tse2026/br-e006257-ab.json"))['abr']}
states = {}
for uf in UFS:
    d = json.load(open(f"{RAW}/tse2026/{uf.lower()}-c0001-e006257-u.json"))
    F, L = cand(d)
    states[uf] = dict(uf=uf, region=REG[uf], F26=F, L26=L, V26=int(d['v']['vv']), sec26=int(d['s']['ts']),
                      elec26=int(d['e']['te']), comp26=int(d['e']['c']), tse_ht_local=ab[uf]['ht'], tse_dt=ab[uf]['dt'])
br = json.load(open(f"{RAW}/tse2026/br-c0001-e006257-u.json"))
BF, BL = cand(br); BV = int(br['v']['vv'])
sF = sum(s['F26'] for s in states.values()); sL = sum(s['L26'] for s in states.values()); sV = sum(s['V26'] for s in states.values())
notes.append(f"2026 UF sums vs national file: F {sF} vs {BF}, L {sL} vs {BL}, valid {sV} vs {BV}")
assert (sF, sL, sV) == (BF, BL, BV), notes[-1]

# ---------- 2026 municipalities ----------
mun26 = {}
missing_mun = []; empty_t = []
cm = json.load(open(f"{RAW}/tse2026/mun-e006257-cm.json"))
for a in cm['abr']:
    for m in a['mu']:
        uf = a['cd'].upper(); f = f"{RAW}/tse2026/mun/{a['cd']}{m['cd']}-c0001-e006257-u.json"
        try:
            d = json.load(open(f))
        except Exception:
            missing_mun.append((uf, m['cd'])); continue
        F, L = cand(d)
        def tmin(dt, ht):
            if not dt.strip() or not ht.strip(): return None
            t = datetime.strptime(dt + ' ' + ht, '%d/%m/%Y %H:%M:%S')
            return (t - datetime(2026, 10, 4, 17, 0)).total_seconds() / 60
        ht = tmin(d['dt'], d['ht']); hg = tmin(d['dg'], d['hg'])
        if ht is None:
            off = 0
            empty_t.append(f"{uf}{m['cd']}")
        elif uf == 'ZZ':
            off = round((hg - ht) / 60) * 60  # estimated: assumes file regenerated < 30 min after last section
        elif (uf, m['cd']) == ('PE', '30015'):
            off = -60  # Fernando de Noronha, UTC-2
        else:
            off = TZ.get(uf, 0) * 60
        mun26[(uf, int(m['cd']))] = dict(F=F, L=L, V=int(d['v']['vv']), sec=int(d['s']['ts']), done=d['and'],
                                         t_done=(ht + off) if ht is not None else None, hg=hg, name=m['nm'])
notes.append(f"2026 municipality files with no completion time (all exterior, 0 valid votes): {len(empty_t)}")
notes.append(f"2026 municipality files loaded: {len(mun26)}; missing: {len(missing_mun)}; status not final ('and'!='f'): {sum(1 for v in mun26.values() if v['done']!='f')}")
for uf in UFS:
    ms = [v for k, v in mun26.items() if k[0] == uf]
    s = states[uf]
    if ms:
        tF, tL, tV = sum(m['F'] for m in ms), sum(m['L'] for m in ms), sum(m['V'] for m in ms)
        s['mun_sum_ok'] = (tF, tL, tV) == (s['F26'], s['L26'], s['V26'])
        if not s['mun_sum_ok']:
            notes.append(f"{uf}: municipal sums {tF},{tL},{tV} != state {s['F26']},{s['L26']},{s['V26']} (residual put on a state-level pseudo-municipality)")
# per-state check of time conversion: hg - t_done should be >= 0
neg = [(k, round(v['hg'] - v['t_done'], 1)) for k, v in mun26.items() if v['t_done'] is not None and v['hg'] - v['t_done'] < -0.5]
notes.append(f"municipalities with TSE hg earlier than converted completion time (tz problem): {len(neg)} {neg[:5]}")

# ---------- 2022 sections ----------
sec = collections.defaultdict(list)
for f in sorted(glob.glob(f"{RAW}/tse2022_bu/bu22_*_president_sections.csv")):
    for r in csv.DictReader(open(f)):
        t = datetime.strptime(r['recv'], '%d/%m/%Y %H:%M:%S')
        tm = (t - datetime(2022, 10, 2, 17, 0)).total_seconds() / 60
        sec[(r['uf'], int(r['mun']))].append((int(r['zona']), tm, int(r['validos']), int(r['lula']), int(r['bolsonaro']), int(r['aptos'])))
n22 = sum(len(v) for v in sec.values())
notes.append(f"2022 sections loaded: {n22}")

# 2022 per-municipality completion (for the 2026-completion rescaling model)
cells = collections.defaultdict(lambda: [0, 0.0, 0.0, 0.0, 0.0])  # key -> n, V, F, L, t26sum
zone_ids = {}
unmatched22 = []; unmatched26 = []
alloc = {uf: [0.0, 0.0, 0.0] for uf in UFS}
for key, rows in sec.items():
    uf, mc = key
    m = mun26.get(key)
    if m is None:
        unmatched22.append(key); continue
    V22 = sum(r[2] for r in rows); L22 = sum(r[3] for r in rows); B22 = sum(r[4] for r in rows)
    fm22 = B22 / V22 if V22 else 0; lm22 = L22 / V22 if V22 else 0
    fm26 = m['F'] / m['V'] if m['V'] else 0; lm26 = m['L'] / m['V'] if m['V'] else 0
    w = np.array([r[2] if V22 else 1 for r in rows], float); w = w / w.sum() if w.sum() > 0 else np.ones(len(rows)) / len(rows)
    v = w * m['V']
    fs = np.array([(r[4] / r[2] if r[2] else fm22) - fm22 + fm26 for r in rows]).clip(0, 1)
    ls = np.array([(r[3] / r[2] if r[2] else lm22) - lm22 + lm26 for r in rows]).clip(0, 1)
    over = fs + ls > 1
    if over.any():
        tot = fs[over] + ls[over]; fs[over] /= tot; ls[over] /= tot
    Fv = v * fs; Lv = v * ls
    if Fv.sum() > 0: Fv *= m['F'] / Fv.sum()
    if Lv.sum() > 0: Lv *= m['L'] / Lv.sum()
    # 2026 completion rescale of 2022 times (only for sections after 17:00; pre-17:00 = exterior far east)
    t22 = np.array([r[1] for r in rows]); tlast22 = t22.max()
    T26 = m['t_done']
    for i, r in enumerate(rows):
        z = zone_ids.setdefault((uf, r[0]), len(zone_ids))
        if T26 is not None and tlast22 > 0 and T26 > 0 and r[1] > 0:
            t26 = r[1] * (T26 / tlast22)
        else:
            t26 = r[1]
        k = (UFS.index(uf), mc, z, math.floor(r[1]))
        c = cells[k]; c[0] += 1; c[1] += v[i]; c[2] += Fv[i]; c[3] += Lv[i]; c[4] += t26
for k in mun26:
    if k not in sec: unmatched26.append(k)
notes.append(f"2022 municipalities without 2026 file: {len(unmatched22)} {unmatched22[:8]}")
notes.append(f"2026 municipalities without 2022 sections: {len(unmatched26)} {unmatched26[:8]}")
# residual (unmatched 2026 municipalities or missing files) -> state-level residual spread over the state's cells
keys = list(cells.keys())
arr = np.array([cells[k] for k in keys], float)
uf_idx = np.array([k[0] for k in keys])
for i, uf in enumerate(UFS):
    s = states[uf]; msk = uf_idx == i
    for col, tot in ((1, s['V26']), (2, s['F26']), (3, s['L26'])):
        cur = arr[msk, col].sum()
        if abs(cur - tot) > 0.5:
            notes.append(f"{uf}: col{col} allocated {cur:.0f} vs registered {tot}; rescaled state cells by {tot/cur:.5f}")
            arr[msk, col] *= tot / cur
# integerize with largest-remainder per state so integer sums are exact
def integerize(vals, total):
    fl = np.floor(vals); rem = int(round(total - fl.sum()))
    if rem > 0:
        idx = np.argsort(-(vals - fl))[:rem]; fl[idx] += 1
    elif rem < 0:
        idx = np.argsort(vals - fl)[:(-rem)]; fl[idx] -= 1
    return fl.astype(np.int64)
Vi = np.zeros(len(keys), np.int64); Fi = Vi.copy(); Li = Vi.copy()
for i, uf in enumerate(UFS):
    s = states[uf]; msk = np.where(uf_idx == i)[0]
    Vi[msk] = integerize(arr[msk, 1], s['V26']); Fi[msk] = integerize(arr[msk, 2], s['F26']); Li[msk] = integerize(arr[msk, 3], s['L26'])
assert Fi.sum() == BF and Li.sum() == BL and Vi.sum() == BV
order = np.lexsort((np.array([k[3] for k in keys]), uf_idx))
n = arr[:, 0].astype(int)
t22 = np.array([k[3] for k in keys], float) + 0.5
t26 = arr[:, 4] / arr[:, 0]
munid = {}
cellout = dict(uf=[], zone=[], mun=[], t22=[], t26=[], n=[], V=[], F=[], L=[])
for j in order:
    k = keys[j]
    cellout['uf'].append(int(k[0])); cellout['zone'].append(int(k[2])); cellout['mun'].append(munid.setdefault((k[0], k[1]), len(munid)))
    cellout['t22'].append(round(float(t22[j]), 1)); cellout['t26'].append(round(float(t26[j]), 1))
    cellout['n'].append(int(n[j])); cellout['V'].append(int(Vi[j])); cellout['F'].append(int(Fi[j])); cellout['L'].append(int(Li[j]))
notes.append(f"cells: {len(keys)} (state x municipality x zona x 2022 reception minute); zones {len(zone_ids)}; municipalities {len(munid)}")

# ---------- 2022 real national path (for reference plot) ----------
allrows = sorted((r[1], r[2], r[3], r[4]) for rows in sec.values() for r in rows)
grid = list(range(0, 361))
cum = []; j = 0; cV = cL = cB = cn = 0
for g in grid:
    while j < len(allrows) and allrows[j][0] <= g:
        cn += 1; cV += allrows[j][1]; cL += allrows[j][2]; cB += allrows[j][3]; j += 1
    cum.append([g, round(100 * cn / n22, 3), round(100 * cB / cV, 3) if cV else None, round(100 * cL / cV, 3) if cV else None])

# per-state 2022 arrival stats (median minute after 17:00) and 2026 municipal completion medians
for i, uf in enumerate(UFS):
    rows = [r for (u, _), rr in sec.items() if u == uf for r in rr]
    ts = sorted(r[1] for r in rows)
    s = states[uf]
    s['sec22'] = len(rows); s['V22'] = sum(r[2] for r in rows); s['L22'] = sum(r[3] for r in rows); s['B22'] = sum(r[4] for r in rows)
    s['t22_p10'], s['t22_p50'], s['t22_p90'] = [round(ts[int(q * (len(ts) - 1))], 1) for q in (0.1, 0.5, 0.9)]
    md = sorted(v['t_done'] for k, v in mun26.items() if k[0] == uf and v['t_done'] is not None)
    if md:
        s['t26mun_done_p50'] = round(md[len(md) // 2], 1); s['t26mun_done_p90'] = round(md[int(0.9 * (len(md) - 1))], 1)

target = json.load(open(f"{ROOT}/data/target_partials.json"))
ref = json.load(open(f"{RAW}/urnaaberta/ref2022_embedded.json"))['data']['1']
out = dict(
    meta=dict(built=datetime.now().isoformat(timespec='seconds'), notes=notes, UFS=UFS, REGIONS=REGIONS,
              unit="2022 section (TSE boletim de urna, 1st round), aggregated to cells",
              t_origin="17:00 Brasilia on election day; times in minutes",
              sources=dict(
                  tse2026="https://resultados.tse.jus.br/oficial/ele2026/6257/dados/<uf>/<uf>-c0001-e006257-u.json (+ municipality files, + br-e006257-ab.json)",
                  tse2022_bu="https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2022/buweb/bweb_1t_<UF>_051020221321.zip (dataset resultados-2022-boletim-de-urna, dadosabertos.tse.jus.br)",
                  urnaaberta="https://urnaaberta.com.br/ (embedded 2022 reference + stored 2026 series)")),
    states=[states[u] for u in UFS],
    final=dict(F=BF, L=BL, V=BV, sections=int(br['s']['ts'])),
    cells=cellout,
    nzones=len(zone_ids),
    real2022=dict(grid=cum, ua_horas=ref['horas'], ua_marcos=ref['marcos'], ua_virada=ref['virada']),
    target=target)
json.dump(out, open(f"{ROOT}/app/data/model_data.json", "w"), separators=(',', ':'))
print("\n".join(notes))
print("size MB", os.path.getsize(f"{ROOT}/app/data/model_data.json") / 1e6)
