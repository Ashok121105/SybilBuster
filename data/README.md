# Dataset foundation and data policy

## Provenance

No public dataset has been imported into this project. The CSV files in `raw/` are fictional demo records created for local development; their fields are modeled on common loan-risk dataset schemas, not copied from a public or customer dataset. They have no external source, license, or real-world labels.

The rows in `synthetic/relationships.csv` and every device, IP, UPI, and bank identifier in it are synthetic demo data. Device, UPI, and bank values are visibly prefixed `SYNTHETIC-DEMO-`. IP values use documentation-only IPv4 ranges reserved for examples (RFC 5737); they do not identify real network endpoints. Each row also carries `identifier_provenance=SYNTHETIC DEMO DATA`.

## Layout

- `raw/applicants.csv`: 12 fictional applicant profiles. Numeric and categorical fields are illustrative; `previous_default` is a synthetic label only.
- `raw/loan_applications.csv`: 12 fictional applications linked to those profiles. Dates, statuses, loan amounts, and interest rates are synthetic. Rates are percentage points (for example, `13.5` means 13.5%). Monetary values are demo units, not a claim about a particular currency.
- `synthetic/relationships.csv`: 12 fictional identifier sets. Three applicants share multiple identifiers as one connected demo group, three share UPI and bank identifiers as a second group, and six have isolated identifiers.
- `processed/`: reserved for future reproducible transformations; currently empty.

All applicant and application identifiers are generated demo identifiers. In database-free mode, the backend loads these CSV fixtures into its in-memory application repository and graph fallback. Shared identifiers and synthetic `previous_default` flags can therefore contribute to demo graph evidence and risk signals under the configured rules; they are not real-world findings.

## Validation

From the project root, run:

```powershell
npm run validate:data
```

The validator checks required CSV headers and values, applicant ID format and uniqueness, application UUID format and uniqueness, loan-to-applicant references, relationship-to-applicant references, and the synthetic provenance markers.

## Why no real financial identifiers

Real device IDs, IP addresses, UPI IDs, and bank-account identifiers can expose or enable linkage to a person's financial activity. They are unnecessary for validating this prototype's file structure and relationship logic. Never add customer records or fabricate identities presented as real. Future ingestion of publicly licensed, anonymized data requires a documented license and permitted-use review; synthetic relationship data must remain clearly labeled and must not be treated as evidence about real people.

## Limitations

These records are not representative, calibrated, independently sourced, or suitable for model training, lending decisions, or claims about fraud. Synthetic sharing patterns are deliberately constructed to exercise connected and isolated cases. A shared identifier is an explainable demo signal, not proof of wrongdoing. The current application and risk engine continue to use only in-memory API submissions; this CSV dataset is not connected to either.