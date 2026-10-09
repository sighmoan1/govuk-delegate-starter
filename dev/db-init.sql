-- One Postgres container, one database per service, so the boundaries are real.
-- `delegate` is created by POSTGRES_DB.
CREATE DATABASE hmrc;
CREATE DATABASE agent;

-- Observatory owns an isolated database and login. Local development credentials only.
CREATE USER observatory WITH PASSWORD 'observatory';
CREATE DATABASE observatory OWNER observatory;
