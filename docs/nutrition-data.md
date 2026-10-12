# Nutrition data and target provenance

## Official Indian sources checked

- **ICMR–National Institute of Nutrition (NIN):** https://www.nin.res.in/
- **Indian Food Composition Tables (IFCT) 2017, official NIN PDF:** https://www.nin.res.in/ebooks/IFCT2017.pdf
- **NIN publication/catalogue page for RDA and EAR:** https://www.nin.res.in/RDA_Full_Report_2024.html
- **Official NIN downloads:** https://www.nin.res.in/downloads/
- **Official Gemini structured-output documentation:** https://ai.google.dev/gemini-api/docs/generate-content/structured-output

The official NIN publications page describes its RDA/EAR publication as the ICMR-NIN Expert Group's **RDA/EAR 2020**. The URL contains “2024” but is not proof that all age-specific reference values were revised in 2024. Verify the edition and age/sex tables before presenting values as official reference recommendations.

## Verified status of this application

The initial food catalogue is a small list of **provisional generic estimates**, not an IFCT import. Values must not be called official or comprehensive.

The official IFCT 2017 document is available as a PDF. This checkpoint has **not** confirmed a structured machine-readable edition and redistribution license authorizing copied data in this public repository. Therefore no IFCT records have been imported or marked verified. The normalized import tool is available as `npm run foods:import`; it defaults to a dry run and requires the operator to specify the dataset/version, source URL, license note and `licenseConfirmed: true`. That field is the operator's assertion, not independent license verification or legal advice.

A future import should be based on actual source rows and preserve dataset/version, source-record identifier, source URL, license/terms, preparation/edible basis, original values and units, canonical values and conversions. Do not scrape or redistribute restricted files. Run a dry run, review duplicates and conversions, then test in a disposable database before importing production data.

## Missing values and reporting conventions

Missing nutrients remain unknown, not zero. This starter catalogue does not comprehensively cover all foods or nutrients. A total is marked incomplete if any logged food lacks the nutrient field.

Do not assume vitamin A values in IU, retinol, carotenoid equivalents or retinol activity equivalents are interchangeable. Vitamin D conversion uses 1 µg = 40 IU. Check source conventions for folate versus dietary folate equivalents and niacin versus niacin equivalents. Do not combine raw/cooked or different edible-portion values without an explicit valid conversion.

## User targets and health guidance

Initial targets are user-configured preferences, not medically validated prescriptions. Keep them separate from age/sex-appropriate reference recommendations and any applicable upper limits. The app estimates food intake; it does not test blood levels, diagnose nutrient deficiency, predict final height or prescribe supplements.

## Normalized import input

Dry run first:

    npm run foods:import -- /path/to/normalized-foods.json

Only apply after independently checking source values, conversion rules and usage rights:

    npm run foods:import -- /path/to/normalized-foods.json --apply

See `docs/food-import-format.md` for a format-only example. That example is not a real nutrition record.