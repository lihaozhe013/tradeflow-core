-- Fix PostgreSQL Auto-increment Sequences
-- Run this script to sync the ID sequences with the actual data in the tables
-- This fixes "Unique constraint failed on the fields: (`id`)" errors after manual data import

-- 1. Fix Outbound Records (The one currently failing)
SELECT setval('outbound_records_id_seq', (SELECT MAX(id) FROM outbound_records));

-- 2. Fix Inbound Records
SELECT setval('inbound_records_id_seq', (SELECT MAX(id) FROM inbound_records));

-- 3. Fix Product Prices
SELECT setval('product_prices_id_seq', (SELECT MAX(id) FROM product_prices));

-- 4. Fix Receivable Payments
SELECT setval('receivable_payments_id_seq', (SELECT MAX(id) FROM receivable_payments));

-- 5. Fix Payable Payments
SELECT setval('payable_payments_id_seq', (SELECT MAX(id) FROM payable_payments));

-- Verification
SELECT 'outbound_next' as table_name, nextval('outbound_records_id_seq') as test_next_id;
-- Note: The verification call above effectively "burns" one ID number, which is fine.
