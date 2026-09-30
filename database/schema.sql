CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS applicants (
    applicant_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    age SMALLINT,
    income NUMERIC(14, 2),
    employment_length NUMERIC(5, 2),
    loan_purpose TEXT,
    credit_history_length NUMERIC(5, 2),
    previous_default BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE applicants ADD COLUMN IF NOT EXISTS age SMALLINT;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS income NUMERIC(14, 2);
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS employment_length NUMERIC(5, 2);
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS loan_purpose TEXT;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS credit_history_length NUMERIC(5, 2);
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS previous_default BOOLEAN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applicants_age_range_check') THEN
        ALTER TABLE applicants ADD CONSTRAINT applicants_age_range_check CHECK (age IS NULL OR age BETWEEN 18 AND 120);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applicants_income_nonnegative_check') THEN
        ALTER TABLE applicants ADD CONSTRAINT applicants_income_nonnegative_check CHECK (income IS NULL OR income >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applicants_employment_length_nonnegative_check') THEN
        ALTER TABLE applicants ADD CONSTRAINT applicants_employment_length_nonnegative_check CHECK (employment_length IS NULL OR employment_length >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applicants_credit_history_length_nonnegative_check') THEN
        ALTER TABLE applicants ADD CONSTRAINT applicants_credit_history_length_nonnegative_check CHECK (credit_history_length IS NULL OR credit_history_length >= 0);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS loan_applications (
    application_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id TEXT NOT NULL REFERENCES applicants(applicant_id),
    loan_amount NUMERIC(14, 2) NOT NULL CHECK (loan_amount > 0),
    income NUMERIC(14, 2) NOT NULL CHECK (income >= 0),
    employment_length NUMERIC(5, 2) NOT NULL CHECK (employment_length >= 0),
    device_id TEXT,
    ip_address INET,
    upi_id TEXT,
    bank_account_id TEXT,
    interest_rate NUMERIC(6, 3),
    loan_status TEXT,
    application_date DATE,
    identifier_provenance TEXT NOT NULL DEFAULT 'API SUBMISSION'
        CHECK (identifier_provenance IN ('API SUBMISSION', 'SYNTHETIC DEMO DATA')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE loan_applications ADD COLUMN IF NOT EXISTS interest_rate NUMERIC(6, 3);
ALTER TABLE loan_applications ADD COLUMN IF NOT EXISTS loan_status TEXT;
ALTER TABLE loan_applications ADD COLUMN IF NOT EXISTS application_date DATE;
ALTER TABLE loan_applications ADD COLUMN IF NOT EXISTS identifier_provenance TEXT NOT NULL DEFAULT 'API SUBMISSION';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loan_applications_identifier_provenance_check') THEN
        ALTER TABLE loan_applications ADD CONSTRAINT loan_applications_identifier_provenance_check
            CHECK (identifier_provenance IN ('API SUBMISSION', 'SYNTHETIC DEMO DATA'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loan_applications_interest_rate_nonnegative_check') THEN
        ALTER TABLE loan_applications ADD CONSTRAINT loan_applications_interest_rate_nonnegative_check
            CHECK (interest_rate IS NULL OR interest_rate >= 0);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS loan_applications_applicant_id_idx ON loan_applications(applicant_id);
CREATE INDEX IF NOT EXISTS loan_applications_device_id_idx ON loan_applications(device_id) WHERE device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS loan_applications_ip_address_idx ON loan_applications(ip_address) WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS loan_applications_upi_id_idx ON loan_applications(upi_id) WHERE upi_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS loan_applications_bank_account_id_idx ON loan_applications(bank_account_id) WHERE bank_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS loan_applications_identifier_provenance_idx ON loan_applications(identifier_provenance);

CREATE TABLE IF NOT EXISTS risk_assessments (
    assessment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES loan_applications(application_id),
    risk_level TEXT NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
    risk_score SMALLINT NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
    rules_version TEXT NOT NULL,
    assessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS risk_assessments_application_id_idx ON risk_assessments(application_id, assessed_at DESC);

CREATE TABLE IF NOT EXISTS risk_signals (
    risk_signal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES risk_assessments(assessment_id) ON DELETE CASCADE,
    signal_type TEXT NOT NULL CHECK (signal_type IN (
        'SHARED_DEVICE', 'SHARED_UPI', 'SHARED_BANK', 'SHARED_IP',
        'DEFAULT_HISTORY', 'NETWORK_CONNECTION'
    )),
    weight SMALLINT NOT NULL CHECK (weight BETWEEN 0 AND 100),
    description TEXT NOT NULL,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS risk_signals_assessment_id_idx ON risk_signals(assessment_id);

CREATE TABLE IF NOT EXISTS audit_logs (
    audit_log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id TEXT,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_resource_idx ON audit_logs(resource_type, resource_id, created_at DESC);