#!/bin/bash
# usage: fetch_mun2026.sh <uf> <cdmun>  -> data/raw/tse2026/mun/<uf><cd>-c0001-e006257-u.json
uf=$1; cd=$2; f=${uf}${cd}-c0001-e006257-u.json
D=/workspace/ballot-gap-lab/data/raw/tse2026/mun
[ -s $D/$f ] && exit 0
curl -sS -m 30 --retry 4 -A "Mozilla/5.0" -o $D/$f https://resultados.tse.jus.br/oficial/ele2026/6257/dados/$uf/$f || echo "FAIL $uf $cd"
