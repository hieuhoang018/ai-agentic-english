-- agents/migrations/001_extensions.sql
-- Required extensions for the agent LTM database.
-- pgvector/pgvector:pg16 image includes vector extension pre-built.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
