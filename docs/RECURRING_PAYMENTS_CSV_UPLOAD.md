# Recurring Payments CSV Upload Feature

## Overview
This feature allows admin users to upload CSV files containing recurring payment data from Converge payment processor. The system automatically matches recurring payments to customers and provides an interface to handle unmatched entries.

## Database Setup

Before using this feature, run the migration script to create the necessary database table:

```bash
psql $POSTGRES_URL < migrations/001_create_converge_recurring_payments.sql
```

Or execute the SQL directly in your database management tool.

**Note:** The `customer_id` field is NOT unique, meaning each customer can have multiple recurring payments. When you upload a CSV, any recurring IDs not present in the CSV will be automatically deleted from the database (to remove cancelled/ended subscriptions).

## Usage

1. **Access the Feature**
   - Navigate to the Billing page (`/dashboard/billing`)
   - Only admin users will see the "Upload Recurring Payments CSV" section

2. **Upload CSV File**
   - Click "Choose File" and select your Converge recurring payments CSV export
   - The system will automatically:
     - Check each `Recurring ID` against existing records
     - **If the Recurring ID exists**: Update that record with new data (keeps the same customer)
     - **If the Recurring ID is new**: Add to unmatched list for manual assignment
     - **Delete any recurring payments not in the CSV** (cancelled/ended subscriptions)
     - Display unmatched entries for manual assignment

3. **Handle Unmatched Entries**
   - For each unmatched recurring payment:
     - Use the search box to filter customers by name or email
     - Select an existing customer from the dropdown, OR
     - Click "+ New" to create a new customer first
     - Click "Assign" to save the assignment
   - The interface is compact and displays all information in a scrollable list

## CSV Format

The CSV file should have the following columns (as exported from Converge):
- Amount
- Billing Cycle
- Recurring ID
- Last Name
- Email
- Phone
- Exp Date (MM/YY format)
- Start Date
- Last Payment
- Next Payment
- Description

Example:
```csv
"Amount","Billing Cycle","Recurring ID","Last Name","Email","Phone","Exp Date","Start Date","Last Payment","Next Payment","Description"
"180","MONTHLY","091024O39-81782A31-A689","Tiszai","urstea@gmail.com","","0727","2024-10-15","2025-11-15","2025-12-15","Monthly tuition for Orson"
```

## Database Schema

### converge_recurring_payments
- `recurring_id` (VARCHAR, PRIMARY KEY): Unique recurring payment ID from Converge
- `customer_id` (UUID, NOT NULL): Reference to customers table (customers can have multiple)
- `amount` (DECIMAL): Payment amount
- `billing_cycle` (VARCHAR): Frequency (e.g., "MONTHLY")
- `last_name` (VARCHAR): Customer last name
- `email` (VARCHAR): Customer email
- `phone` (VARCHAR): Customer phone
- `exp_date` (DATE): Card expiration date
- `start_date` (DATE): Recurring payment start date
- `last_payment` (DATE): Date of last payment
- `next_payment` (DATE): Date of next scheduled payment
- `description` (TEXT): Payment description
- `created_at` (TIMESTAMP): Record creation timestamp
- `updated_at` (TIMESTAMP): Record update timestamp

### customers (updated)
- No changes needed - `converge_recurring_id` column has been removed

## Features

- **Smart Updating**: Existing recurring payments (matched by Recurring ID) are automatically updated with new data while preserving customer assignment
- **Multiple Payments Per Customer**: Customers can have multiple recurring payment plans
- **Automatic Cleanup**: Recurring payments not in the CSV are automatically deleted (cancelled subscriptions)
- **Manual Assignment**: New Recurring IDs are presented for manual customer assignment
- **Customer Search**: Search customers by name or email when assigning unmatched entries
- **Compact UI**: Space-efficient interface with scrollable list for many unmatched entries
- **Admin Only**: Only users with `user_type = 'admin'` can access this feature
- **Mobile Responsive**: UI adapts to mobile and desktop screens
- **Error Handling**: Clear error messages and validation
- **Assignment Interface**: Easy-to-use interface for handling unmatched entries

## Technical Details

### Server Actions
- `uploadRecurringPaymentsCSV(csvContent: string)`: Parses CSV and processes entries
- `assignRecurringPaymentToCustomer(recurringId, customerId, paymentData)`: Assigns unmatched entry to customer

### Components
- `RecurringCSVUpload`: Main component for file upload and unmatched entry management
- Located at: `app/ui/billing/recurring-csv-upload.tsx`

### Page Integration
- Integrated into: `app/dashboard/billing/page.tsx`
- Only visible to admin users
- Fetches all customers for dropdown selection

## Future Enhancements

Potential improvements:
- Bulk assignment for unmatched entries
- Export unmatched entries to CSV
- Email notifications for upcoming payments
- Payment history tracking
- Automatic recurring payment reminders
