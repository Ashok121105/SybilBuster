# Architecture notes

The API owns input validation, in-memory application storage, demo risk scoring, and Socket.IO broadcasts. Routes delegate to controllers; the risk engine depends on repository and graph-service interfaces so persistent storage or a graph adapter can be added independently.

The current graph-service implementation is an in-memory identifier comparison, not a graph database. Risk assessments expose each configured signal and associated application IDs as evidence. `DEFAULT_HISTORY` can only be enabled for explicitly configured demo applicant IDs and must not be represented as verified customer history.

The frontend uses the same HTTP API for submission and assessment, and listens for `application.created` and `risk.updated` over Socket.IO. PostgreSQL tables are preparatory only; there is no database driver, connection, or migration runner in this version.