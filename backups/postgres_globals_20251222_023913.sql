--
-- PostgreSQL database cluster dump
--

\restrict fQIYAu067etlB9ywjvdNbnhw4ABP4hlMVINqfI9g2bHYBadqnNXgg6tqSjl1f3j

SET default_transaction_read_only = off;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

--
-- Roles
--

CREATE ROLE erp_user;
ALTER ROLE erp_user WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:Wr4UyDT0Cm7fYLfldzKWxw==$+raTaAeV7WfEKVp0Lz8UpTpm+fmEOw747fjI5rYXin0=:k8YlR3fLpAokjsXpgSKu5M8TbgA7l4E+pJMeMsasRWw=';

--
-- User Configurations
--








\unrestrict fQIYAu067etlB9ywjvdNbnhw4ABP4hlMVINqfI9g2bHYBadqnNXgg6tqSjl1f3j

--
-- PostgreSQL database cluster dump complete
--

