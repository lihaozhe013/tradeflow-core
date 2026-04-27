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
    product_code TEXT,
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
    product_code TEXT,
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

-- Table: inventory
CREATE TABLE inventory (
    product_model TEXT PRIMARY KEY,
    quantity INTEGER NOT NULL DEFAULT 0
);

-- Table: inventory_ledger
CREATE TABLE inventory_ledger (
    id SERIAL PRIMARY KEY,
    product_model TEXT NOT NULL,
    change_qty INTEGER NOT NULL,
    change_type TEXT NOT NULL,
    reference_id INTEGER,
    date TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE system_logs (
    id SERIAL PRIMARY KEY,
    username TEXT,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT,
    params TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Table: users
CREATE TABLE users (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    display_name TEXT,
    enabled BOOLEAN DEFAULT TRUE,
    last_password_change TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

