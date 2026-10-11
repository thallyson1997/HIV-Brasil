import csv
import json
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "DADOS" / "dados_aids_hiv.csv"
DESTINATION = ROOT / "VISUAIS" / "DADOS_PUBLICOS" / "casos_agregados.json"
MINIMUM_PUBLIC_COUNT = 10


def normalize_text(value):
    normalized = unicodedata.normalize("NFD", value.strip().lower())
    return "".join(character for character in normalized if unicodedata.category(character) != "Mn")


def parse_age(value):
    try:
        age = float(value.strip().replace(",", "."))
    except (AttributeError, ValueError):
        return None
    return age if age >= 0 else None


def age_group(age):
    if age < 20:
        return "Menos de 20"
    if age < 30:
        return "20 a 29"
    if age < 40:
        return "30 a 39"
    if age < 50:
        return "40 a 49"
    if age < 60:
        return "50 a 59"
    return "60 ou mais"


def public_categories(counts):
    visible = {
        label: count
        for label, count in counts.items()
        if count >= MINIMUM_PUBLIC_COUNT
    }
    suppressed_total = sum(
        count
        for count in counts.values()
        if count < MINIMUM_PUBLIC_COUNT
    )
    if suppressed_total >= MINIMUM_PUBLIC_COUNT:
        visible["Outras categorias"] = suppressed_total
    return visible


def build_public_data():
    years = {}

    with SOURCE.open(encoding="utf-8-sig", newline="") as source_file:
        reader = csv.DictReader(source_file, delimiter=";")
        required_columns = {"dt_notific", "id_mn_resi", "cs_sexo", "nu_idade_n", "cs_raca"}
        missing_columns = required_columns.difference(reader.fieldnames or [])
        if missing_columns:
            raise ValueError(f"Colunas ausentes na base: {', '.join(sorted(missing_columns))}")

        for row in reader:
            date = (row.get("dt_notific") or "").strip()
            if len(date) != 10 or date[4] != "-" or date[7] != "-":
                continue

            year = date[:4]
            month = int(date[5:7]) - 1
            if not 0 <= month < 12:
                continue

            aggregate = years.setdefault(
                year,
                {
                    "total": 0,
                    "monthlyTotals": [0] * 12,
                    "latestDate": "",
                    "municipalities": {},
                    "profile": {
                        "sex": Counter(),
                        "age": Counter(),
                        "race": Counter(),
                    },
                },
            )

            aggregate["total"] += 1
            aggregate["monthlyTotals"][month] += 1
            aggregate["latestDate"] = max(aggregate["latestDate"], date)

            municipality_name = (row.get("id_mn_resi") or "").strip()
            if municipality_name:
                municipality_key = normalize_text(municipality_name)
                municipality = aggregate["municipalities"].setdefault(
                    municipality_key,
                    {
                        "name": municipality_name,
                        "total": 0,
                        "months": [0] * 12,
                        "days": Counter(),
                    },
                )
                municipality["total"] += 1
                municipality["months"][month] += 1
                municipality["days"][date] += 1

            sex = (row.get("cs_sexo") or "").strip()
            if sex and sex != "Ignorado":
                aggregate["profile"]["sex"][sex] += 1

            age = parse_age(row.get("nu_idade_n"))
            if age is not None:
                aggregate["profile"]["age"][age_group(age)] += 1

            race = (row.get("cs_raca") or "").strip()
            if race and race != "Ignorado":
                aggregate["profile"]["race"][race] += 1

    public_years = {}
    for year, aggregate in years.items():
        latest_month = max(
            index
            for index, count in enumerate(aggregate["monthlyTotals"])
            if count > 0
        )
        latest_date = aggregate["latestDate"]
        municipalities = []

        for key, municipality in aggregate["municipalities"].items():
            if municipality["total"] < MINIMUM_PUBLIC_COUNT:
                continue

            municipalities.append(
                {
                    "key": key,
                    "name": municipality["name"],
                    "total": municipality["total"],
                    "months": [
                        count if count >= MINIMUM_PUBLIC_COUNT else None
                        for count in municipality["months"]
                    ],
                    "latestMonthCases": (
                        municipality["months"][latest_month]
                        if municipality["months"][latest_month] >= MINIMUM_PUBLIC_COUNT
                        else None
                    ),
                    "latestDayCases": (
                        municipality["days"][latest_date]
                        if municipality["days"][latest_date] >= MINIMUM_PUBLIC_COUNT
                        else None
                    ),
                }
            )

        public_years[year] = {
            "total": aggregate["total"],
            "monthlyTotals": aggregate["monthlyTotals"],
            "municipalities": municipalities,
            "socialProfile": {
                dimension: public_categories(counts)
                for dimension, counts in aggregate["profile"].items()
            },
        }

    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    with DESTINATION.open("w", encoding="utf-8", newline="\n") as output_file:
        json.dump(
            {
                "schemaVersion": 1,
                "minimumPublicCount": MINIMUM_PUBLIC_COUNT,
                "years": public_years,
            },
            output_file,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        output_file.write("\n")

    return public_years


if __name__ == "__main__":
    result = build_public_data()
    print(f"Dados agregados gerados em: {DESTINATION.relative_to(ROOT)}")
    print(f"Anos incluídos: {len(result)}")
    print(f"Arquivo: {DESTINATION.stat().st_size:,} bytes")