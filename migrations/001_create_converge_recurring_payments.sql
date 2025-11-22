-- Migration: Create converge_recurring_payments table
-- This table stores recurring payment information from Converge payment processor

CREATE TABLE IF NOT EXISTS converge_recurring_payments (
    recurring_id VARCHAR(255) PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    billing_cycle VARCHAR(50) NOT NULL,
    last_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    exp_date DATE,
    start_date DATE,
    last_payment DATE,
    next_payment DATE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on customer_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_converge_recurring_customer ON converge_recurring_payments(customer_id);

-- Create index on next_payment for upcoming payment queries
CREATE INDEX IF NOT EXISTS idx_converge_recurring_next_payment ON converge_recurring_payments(next_payment);
