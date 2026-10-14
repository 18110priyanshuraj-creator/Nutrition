# Normalized food import format

Import only datasets whose source, values and usage rights you have checked. The initial application catalog is provisional; it is not an IFCT data export.

Dry run:

    npm run foods:import -- /path/to/normalized-foods.json

Apply only after reviewing the dry-run report and confirming the dataset terms allow the planned use:

    npm run foods:import -- /path/to/normalized-foods.json --apply

Each record expresses nutrient amounts per 100 g on the explicitly stated edible/preparation basis. The 'value' field is the converted canonical amount, while 'originalValue' and 'originalUnit' preserve the source value. Null means unknown; unknown values are omitted from calculations while their source metadata remains in nutrient_provenance_json.

Format-only example below. It is not a real food-composition record:

    {
      "datasetName": "Example licensed dataset",
      "datasetVersion": "1.0",
      "sourceUrl": "https://example.org/dataset-documentation",
      "sourceLicenseNote": "Replace with the actual applicable license and terms after review",
      "licenseConfirmed": true,
      "records": [{
        "id": "example-food-id",
        "name": "Example cooked food",
        "aliases": ["example alias"],
        "preparation": "cooked; edible portion",
        "sourceRecordId": "source-row-001",
        "sourceBasis": "per 100 g cooked edible portion",
        "confidence": "estimate",
        "lastVerifiedAt": null,
        "completeness": "partial",
        "nutrients": {
          "kcal": {"value": 100, "canonicalUnit": "kcal", "originalValue": 100, "originalUnit": "kcal"},
          "calcium_mg": {"value": null, "canonicalUnit": "mg", "originalValue": null, "originalUnit": "mg", "conversionNote": "Not reported in source"}
        }
      }]
    }

The importer is transactional, checks duplicate IDs, and records import metadata. Known canonical-unit mismatches fail validation. Verified records require an explicit verification timestamp. Do not invent conversions for alternate forms such as vitamin A, folate or niacin equivalents; add a source/form-aware conversion only after verifying its basis.