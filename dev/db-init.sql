-- One Postgres container, one database per service, so the boundaries are real.
-- `delegate` is created by POSTGRES_DB.
CREATE DATABASE hmrc;
CREATE DATABASE agent;
