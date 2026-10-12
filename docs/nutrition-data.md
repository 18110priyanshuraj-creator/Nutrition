# Nutrition data and target provenance

## Reference links to evaluate

- ICMR–National Institute of Nutrition: https://www.nin.res.in/
- ICMR–NIN RDA/EAR report 2024: https://www.nin.res.in/RDA_Full_Report_2024.html
- Indian Food Composition Tables 2017 information: consult the official NIN publication/catalogue and its current terms of use.
- Google GenAI JavaScript SDK and structured JSON output: https://ai.google.dev/gemini-api/docs

## Important source-status rule

The initial food records in this repository are provisional, generic estimates. They are not certified extracts from an exact IFCT row, and the small starter catalog does not comprehensively cover every nutrient, recipe, region, brand, or cooking method. Do not label it comprehensive or verified.

Before importing any published composition dataset, check that the actual file/publication is official, the specific record and edible/preparation basis match, and the license/terms permit the intended storage and redistribution. Preserve the dataset name, edition/version, record identifier, value, original unit, conversion method and import timestamp.

Missing values must remain unknown. A record missing a nutrient does not establish zero intake. Vitamin A forms, folate reporting conventions, niacin equivalents, fatty-acid coverage and cooked/raw distinctions need explicit source-specific treatment.

## User goals versus reference guidance

The default targets stored by the app are user-provided preferences from the project brief. They are not assertions about medically optimal intake. If age/sex-specific reference values or upper limits are displayed later, version and cite the exact authoritative reference separately. A food log is not a diagnostic test for nutrient deficiency or blood levels.

## Import policy

Any future CSV/JSON import should validate required columns, units, serving basis, source metadata, duplicate IDs and numeric ranges before changing production records. Run a dry-run report first and preserve an import audit trail. Never fill missing nutrients with invented values.