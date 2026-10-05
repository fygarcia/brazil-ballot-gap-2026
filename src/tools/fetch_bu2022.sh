#!/bin/bash
# Downloads TSE 2022 1st-round boletim de urna (bweb) per UF, keeps only the
# Presidente rows, aggregates to one line per section, and deletes the zip.
# Output: data/raw/tse2022_bu/bu22_<UF>_president_sections.csv
# Source dataset: https://dadosabertos.tse.jus.br/dataset/resultados-2022-boletim-de-urna
set -u
OUT=/workspace/ballot-gap-lab/data/raw/tse2022_bu
TMP=/tmp/bu22
uf=$1
url=https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2022/buweb/bweb_1t_${uf}_051020221321.zip
f=$TMP/bweb_1t_${uf}.zip
[ -s $OUT/bu22_${uf}_president_sections.csv ] && exit 0
t0=$(date -Iseconds)
curl -sS --retry 5 --retry-delay 5 -o $f "$url" || { echo "FAIL $uf"; exit 1; }
unzip -p $f '*.csv' | LC_ALL=C grep -a ';"1";"Presidente";' | iconv -f latin1 -t utf8 | python3 /workspace/ballot-gap-lab/tools/agg_bu2022.py > $OUT/bu22_${uf}_president_sections.csv.tmp && mv $OUT/bu22_${uf}_president_sections.csv.tmp $OUT/bu22_${uf}_president_sections.csv
echo -e "$t0\t$url\t$(stat -c %s $f)\t$(wc -l < $OUT/bu22_${uf}_president_sections.csv)" >> $OUT/FETCHLOG.tsv
rm -f $f
echo "done $uf"
