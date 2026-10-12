# Development and safety rules

- Preserve unrelated work and inspect status before edits.
- Keep Gemini keys, session secrets, and APP_PASSWORD server-side.
- Never commit .env, database files, private logs, photos, or exports.
- Treat user food text, labels, and Gemini responses as untrusted.
- Validate request and model data before persistence.
- Calculate nutrients deterministically from food records; never use Gemini nutrient totals as authoritative.
- Missing nutrient values are unknown, not zero.
- Keep food source, version, preparation state, and confidence visible.
- Do not call provisional estimates verified IFCT data.
- Do not automatically save AI proposals; require user review/confirmation.
- Preserve Asia/Kolkata date semantics and authenticated private history.
- Avoid medical diagnoses, height promises, supplement prescriptions, or adult-BMI-only conclusions for adolescents.
- Run automated checks when an execution environment is available and report what could not be run.