"""Build data/target_partials.json from (a) the news partials relayed in the project brief
and (b) the Urna Aberta stored 2026 series (raw/urnaaberta/apuracao_historico_ele6257.json),
whose time label is the TSE file generation time (hg) per the site's own code.
Nothing is interpolated or invented here; inconsistencies are recorded, not fixed."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ua = json.load(open(f"{ROOT}/data/raw/urnaaberta/apuracao_historico_ele6257.json"))
L, F = "280002542548", "280002551544"
br = json.load(open(f"{ROOT}/data/raw/tse2026/br-c0001-e006257-u.json"))
VF = int(br["v"]["vv"])

news = [  # as relayed in the brief (Grok Bot message), Brasilia time
 dict(t_news="17:58", pst=12.45, valid=14425046, F=7369884, L=5872874, pF=51.09, pL=40.71),
 dict(t_news="18:11", pst=17.22, valid=19874131, F=10180435, L=8080760, pF=51.22, pL=40.66, gap_stated=10.56),
 dict(t_news="18:22", pst=21.96, F=12915526, L=10324360, pF=51.07, pL=40.82),
 dict(t_news="18:23", pst=27.88, F=16317418, L=13172611, pF=50.85, pL=41.05),
 dict(t_news="18:27", pst=31.90, F=18644760, L=15117899, pF=50.74, pL=41.14),
 dict(t_news="18:47", pst=41.57, pF=50.41, pL=41.44, gap_stated=8.97),
 dict(t_news="18:54", pst=47.26, pF=50.20, pL=41.63, gap_stated=8.57),
 dict(t_news="19:16", pst=64.81, valid=75762826, F=37566895, L=32007853, pF=49.58, pL=42.25, gap_stated=7.33),
 dict(t_news="20:00-20:13", pst=84.96, F=48704246, pF=48.47, pL=43.49, valid_stated_approx=100.5e6, gap_stated=4.98),
 dict(t_news="20:14", pst=89.29, pF=48.13, pL=43.88, gap_stated=4.25),
 dict(t_news="20:26", pst=90.14, pF=48.05, pL=43.96),
]
pts = ua["body"]["pontos"]
def ua_match(pst):
    m = [p for p in pts if abs(p["p"] - pst) < 1e-9]
    return m
flags = []
out = []
for n in news:
    r = dict(n); r["checks"] = []
    # internal consistency: shares vs votes vs valid
    if "valid" in n:
        for c in ("F", "L"):
            if c in n:
                calc = 100 * n[c] / n["valid"]
                ok = abs(calc - n["p" + c]) <= 0.005 + 1e-9
                r["checks"].append(f"{c} {n[c]:,}/{n['valid']:,} = {calc:.3f}% vs stated {n['p'+c]}% -> {'OK' if ok else 'MISMATCH'}")
                if not ok: flags.append(f"{n['t_news']}: {c} share mismatch ({calc:.3f} vs {n['p'+c]})")
    elif "F" in n:
        vF = n["F"] / (n["pF"] / 100)
        if "L" in n:
            vL = n["L"] / (n["pL"] / 100)
            rel = abs(vF - vL) / vF
            r["implied_valid"] = round((vF + vL) / 2)
            r["checks"].append(f"implied valid from F={vF:,.0f}, from L={vL:,.0f} (rel diff {rel:.2e}) -> {'OK' if rel < 2e-4 else 'MISMATCH'}")
            if rel >= 2e-4: flags.append(f"{n['t_news']}: implied valid totals disagree")
        else:
            r["implied_valid"] = round(vF)
            r["checks"].append(f"implied valid from F only = {vF:,.0f}")
    if "gap_stated" in n:
        g = round(n["pF"] - n["pL"], 2)
        if abs(g - n["gap_stated"]) > 0.011:
            r["checks"].append(f"stated gap {n['gap_stated']} vs pF-pL {g} -> MISMATCH")
            flags.append(f"{n['t_news']}: stated gap {n['gap_stated']} != pF-pL {g}")
        else:
            r["checks"].append(f"gap {g} OK")
    v = n.get("valid") or r.get("implied_valid")
    if v:
        r["valid_per_pct_point"] = round(v / n["pst"])
    m = ua_match(n["pst"])
    if m:
        p = m[0]
        r["ua_tse_hg"] = p["h"]; r["ua_idg"] = p["i"]; r["ua_pF"] = p["v"][F]; r["ua_pL"] = p["v"][L]
        same = abs(p["v"][F] - n["pF"]) < 0.006 and abs(p["v"][L] - n["pL"]) < 0.006
        r["checks"].append(f"Urna Aberta stored point with same %sections: TSE hg {p['h']} (news said {n['t_news']}), shares {p['v'][F]}/{p['v'][L]} {'match' if same else 'DIFFER'}")
        if p["h"] != n["t_news"]:
            flags.append(f"{n['t_news']} ({n['pst']}%): TSE file time per Urna Aberta is {p['h']}")
        r["t_used"] = p["h"]; r["t_source"] = "TSE hg via Urna Aberta stored series"
    else:
        r["checks"].append("no Urna Aberta stored point with this %sections")
        r["t_used"] = n["t_news"] if "-" not in n["t_news"] else None
        r["t_source"] = "news timestamp (unverified)"
    out.append(r)

# timing plausibility for news-only points
flags.append("18:11 (17.22%): Urna Aberta stored 14.24% at TSE hg 18:10 and 12.45% at 18:00; 17.22% one minute later would need +2.98 pts of sections in <=1 min. News time likely a publication time; the TSE file time is unknown (somewhere after 18:10 and before 18:43).")
flags.append("18:22 (21.96%) -> 18:23 (27.88%): +5.92 pts of sections (~6.9M valid votes) in one minute, then +4.02 pts in the next 4 min and +9.67 in the next 16-20 min. The one-minute jump is implausible as TSE file times; treat 18:22/18:23/18:27 as publication times with unknown lag. They are kept as markers but flagged 'time uncertain'.")
flags.append("20:00-20:13 (84.96%): Urna Aberta has this exact snapshot at TSE hg 20:04 -> use 20:04.")
flags.append("20:26 (90.14%): Urna Aberta has this exact snapshot at TSE hg 20:17 (news time is 9 min late) -> use 20:17.")
flags.append("Urna Aberta stored series has a hole between hg 18:10 and 18:43 and between 19:14 and 20:04: it does NOT provide a minute series for most of the 18:15-20:15 window. Only 5 real points inside the window have TSE file times: 18:43, 18:48, 19:14, 20:04, 20:10-20:15.")
flags.append("Urna Aberta stored series: TSE idg (generation id) decreases at 124 of 388 steps while %sections never decreases -> the site merged results from more than one TSE file/mirror; ordering by %sections is safe, ordering by idg is not.")

# UA series inside 17:00-21:00 as secondary markers
ua_series = [dict(t=p["h"], pst=p["p"], pF=p["v"][F], pL=p["v"][L], idg=p["i"]) for p in pts if "17:00" <= p["h"] <= "23:59"]
res = dict(
  description="Target series for 2026-10-04 1st round, President, national. Times Brasilia (UTC-3).",
  final=dict(sections=int(br["s"]["ts"]), valid=VF, F=56104503, L=53879538, pF=47.03, pL=45.16, abstention_pct=21.08,
             source="TSE resultados JSON br-c0001-e006257-u.json (data/raw/tse2026)"),
  news_partials=out,
  news_source="News partials as relayed in the project brief (Grok Bot message, 2026-10-05). Original outlets not identified in the brief; not independently re-fetched.",
  ua_series=ua_series,
  ua_source="Urna Aberta stored series https://yagyudxwcarczzwpazip.supabase.co/functions/v1/apuracao-historico?ele=6257 captured by loading https://urnaaberta.com.br/resultado in headless Chrome; 'h' = TSE file generation time hg; shares rounded to 0.01.",
  flags=flags)
json.dump(res, open(f"{ROOT}/data/target_partials.json", "w"), indent=1, ensure_ascii=False)
for r in out: print(r["t_news"], r["pst"], r.get("t_used"), "|", " ; ".join(r["checks"]))
print(); print("\n".join(flags))
