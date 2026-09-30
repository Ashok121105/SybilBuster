# Neo4j Graph Model

Neo4j is an optional graph backend for STEP 4. The backend checks the connection, creates uniqueness constraints, imports the checked-in synthetic fixture, and then enables graph queries only after all three operations succeed. If Neo4j is absent or fails, the API continues with CSV-backed and in-memory graph logic; it never reports a successful Neo4j connection unless the driver verifies one.

## Configuration

Set these values in `backend/.env`:

```dotenv
NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=replace-with-local-secret
NEO4J_DATABASE=neo4j
```

`NEO4J_DATABASE` defaults to `neo4j`. All connection values are optional for local development. Keep passwords out of source control. The import runs automatically during backend startup when Neo4j is configured and reachable; run `npm run graph:import` to explicitly verify and import the fixture. That command exits with an error when Neo4j is not configured or cannot be reached.

## Nodes

| Label | Key and representative properties |
| --- | --- |
| `Applicant` | `applicantId` (unique), `name`, `income`, `employmentLength` |
| `LoanApplication` | `applicationId` (unique), `loanAmount`, `status`, `createdAt` |
| `Device` | `value` (unique) |
| `IP` | `value` (unique) |
| `UPI` | `value` (unique) |
| `BankAccount` | `value` (unique) |
| `DefaultHistory` | `applicantId` (unique), `source` |

The uniqueness constraints also provide lookup indexes for the graph's identifier keys.

## Relationships

| Relationship | Direction and meaning |
| --- | --- |
| `APPLIED_FOR` | `(Applicant)-[:APPLIED_FOR]->(LoanApplication)` |
| `USES_DEVICE` | `(LoanApplication)-[:USES_DEVICE]->(Device)` |
| `USES_IP` | `(LoanApplication)-[:USES_IP]->(IP)` |
| `USES_UPI` | `(LoanApplication)-[:USES_UPI]->(UPI)` |
| `USES_BANK` | `(LoanApplication)-[:USES_BANK]->(BankAccount)` |
| `CONNECTED_TO` | Between applicants sharing an identifier; records `identifierType` and the synthetic identifier value |
| `HAS_DEFAULT_HISTORY` | `(Applicant)-[:HAS_DEFAULT_HISTORY]->(DefaultHistory)` for the fixture's explicitly marked default-history rows |

Identifier values from the graph fixture are clearly synthetic and use reserved documentation IP ranges. New applications are merged into Neo4j when the graph service is active. Shared identifiers create `CONNECTED_TO` edges and queryable paths; one matching identifier alone does not generate a suspicious-network risk signal. The risk engine preserves configured per-identifier weights and only adds `NETWORK_CONNECTION` when at least two identifier types and the configured number of other applications are present.

## Dataset Import

The importer joins:

- `data/raw/applicants.csv`
- `data/raw/loan_applications.csv`
- `data/synthetic/relationships.csv`

Rows are merged by `applicant_id` and `application_id`. Re-running the import is idempotent. The `previous_default` field creates a `HAS_DEFAULT_HISTORY` edge only for rows marked `true`; it remains synthetic demonstration data and is not a verified record.

## API And Fallback

`GET /api/graph/:applicationId` returns the source application, connected applicants, shared identifier values, relationship paths, and grouped evidence. The service reads Neo4j when available. Otherwise it derives the same response from the validated fixture and current application repository. When PostgreSQL is unavailable, the API uses process-local storage seeded from these same fixture rows; newly submitted applications and assessments are lost on restart.

Neo4j connection settings do not replace or require PostgreSQL configuration. The backend can run without either database. Graph responses and risk scores are demo evidence only, not fraud determinations or lending recommendations.
