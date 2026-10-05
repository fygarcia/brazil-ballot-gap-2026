# stdin: bweb rows (no header) filtered to CD_CARGO_PERGUNTA=1 (Presidente)
# stdout: one row per section
import sys, csv
cols = ["DT_GERACAO","HH_GERACAO","ANO_ELEICAO","CD_TIPO_ELEICAO","NM_TIPO_ELEICAO","CD_PLEITO","DT_PLEITO","NR_TURNO","CD_ELEICAO","DS_ELEICAO","SG_UF","CD_MUNICIPIO","NM_MUNICIPIO","NR_ZONA","NR_SECAO","NR_LOCAL_VOTACAO","CD_CARGO_PERGUNTA","DS_CARGO_PERGUNTA","NR_PARTIDO","SG_PARTIDO","NM_PARTIDO","DT_BU_RECEBIDO","QT_APTOS","QT_COMPARECIMENTO","QT_ABSTENCOES","CD_TIPO_URNA","DS_TIPO_URNA","CD_TIPO_VOTAVEL","DS_TIPO_VOTAVEL","NR_VOTAVEL","NM_VOTAVEL","QT_VOTOS","NR_URNA_EFETIVADA","CD_CARGA_1_URNA_EFETIVADA","CD_CARGA_2_URNA_EFETIVADA","CD_FLASHCARD_URNA_EFETIVADA","DT_CARGA_URNA_EFETIVADA","DS_CARGO_PERGUNTA_SECAO","DS_AGREGADAS","DT_ABERTURA","DT_ENCERRAMENTO","QT_ELEITORES_BIOMETRIA_NH","DT_EMISSAO_BU","NR_JUNTA_APURADORA","NR_TURMA_APURADORA"]
ix = {c:i for i,c in enumerate(cols)}
sec = {}
order = []
for r in csv.reader(sys.stdin, delimiter=';'):
    if len(r) < len(cols): continue
    k = (r[ix["SG_UF"]], r[ix["CD_MUNICIPIO"]], r[ix["NR_ZONA"]], r[ix["NR_SECAO"]])
    s = sec.get(k)
    if s is None:
        s = sec[k] = {"uf":k[0],"mun":k[1],"nm_mun":r[ix["NM_MUNICIPIO"]],"zona":k[2],"secao":k[3],
            "recv":r[ix["DT_BU_RECEBIDO"]],"enc":r[ix["DT_ENCERRAMENTO"]],"emis":r[ix["DT_EMISSAO_BU"]],
            "tipo_urna":r[ix["DS_TIPO_URNA"]],"aptos":int(r[ix["QT_APTOS"]]),"comp":int(r[ix["QT_COMPARECIMENTO"]]),
            "lula":0,"bolsonaro":0,"validos":0,"brancos":0,"nulos":0,"agregadas":r[ix["DS_AGREGADAS"]]}
        order.append(k)
    tv = r[ix["DS_TIPO_VOTAVEL"]]; n = r[ix["NR_VOTAVEL"]]; q = int(r[ix["QT_VOTOS"]])
    if tv == "Nominal":
        s["validos"] += q
        if n == "13": s["lula"] += q
        elif n == "22": s["bolsonaro"] += q
    elif tv == "Branco": s["brancos"] += q
    elif tv == "Nulo": s["nulos"] += q
out = csv.writer(sys.stdout)
f = ["uf","mun","nm_mun","zona","secao","recv","enc","emis","tipo_urna","aptos","comp","validos","lula","bolsonaro","brancos","nulos","agregadas"]
out.writerow(f)
for k in order:
    s = sec[k]; out.writerow([s[c] for c in f])
