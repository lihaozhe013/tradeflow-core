-- Database Initialization for PostgreSQL
-- Run this script to reset the database schema (Data is NOT included)

DROP DATABASE IF EXISTS tradeflow;
CREATE DATABASE tradeflow;

-- Connect to the new database
\c tradeflow;

-- Enable warnings
SET client_min_messages = warning;

-- Table: partners
CREATE TABLE partners (
    code TEXT,
    short_name TEXT PRIMARY KEY,
    full_name TEXT,
    address TEXT,
    contact_person TEXT,
    contact_phone TEXT,
    type INTEGER,
    CONSTRAINT partners_code_unique UNIQUE (code)
);

-- Table: products
CREATE TABLE products (
    code TEXT UNIQUE NOT NULL,
    category TEXT,
    product_model TEXT,
    remark TEXT
);

-- Table: inbound_records
CREATE TABLE inbound_records (
    id SERIAL PRIMARY KEY,
    supplier_code TEXT,
    supplier_short_name TEXT,
    supplier_full_name TEXT,
    product_code TEXT,
    product_model TEXT,
    quantity INTEGER,
    unit_price DOUBLE PRECISION,
    total_price DOUBLE PRECISION,
    inbound_date TEXT, -- Kept as TEXT for compatibility with existing app logic
    invoice_date TEXT,
    invoice_number TEXT,
    receipt_number TEXT,
    order_number TEXT,
    remark TEXT
);

-- Table: outbound_records
CREATE TABLE outbound_records (
    id SERIAL PRIMARY KEY,
    customer_code TEXT,
    customer_short_name TEXT,
    customer_full_name TEXT,
    product_code TEXT,
    product_model TEXT,
    quantity INTEGER,
    unit_price DOUBLE PRECISION,
    total_price DOUBLE PRECISION,
    outbound_date TEXT, -- Kept as TEXT for compatibility with existing app logic
    invoice_date TEXT,
    invoice_number TEXT,
    receipt_number TEXT,
    order_number TEXT,
    remark TEXT
);

-- Table: product_prices
CREATE TABLE product_prices (
    id SERIAL PRIMARY KEY,
    partner_short_name TEXT,
    product_model TEXT,
    effective_date TEXT,
    unit_price DOUBLE PRECISION
);

-- Table: receivable_payments
CREATE TABLE receivable_payments (
    id SERIAL PRIMARY KEY,
    customer_code TEXT,
    amount DOUBLE PRECISION,
    pay_date TEXT,
    pay_method TEXT,
    remark TEXT
);

-- Table: payable_payments
CREATE TABLE payable_payments (
    id SERIAL PRIMARY KEY,
    supplier_code TEXT,
    amount DOUBLE PRECISION,
    pay_date TEXT,
    pay_method TEXT,
    remark TEXT
);
