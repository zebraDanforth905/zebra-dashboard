import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import postgres from "postgres";
import { revalidatePath } from "next/cache";

const sql = postgres(process.env.POSTGRES_URL || "", { ssl: "require" });

// POST - Create a new payment
export async function POST(request: NextRequest) {
  await connection();
  try {
    const body = await request.json();
    const { customer_id, amount, date, status, description } = body;

    if (!customer_id || !amount || !date || !status) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const result = await sql`
      INSERT INTO payments (customer_id, amount, date, status, comment)
      VALUES (${customer_id}, ${amount}, ${date}, ${status}, ${description || ''})
      RETURNING id, customer_id, amount, date, status, comment AS description
    `;

    revalidatePath(`/dashboard/billing/${customer_id}/edit`);

    return NextResponse.json(result[0], { status: 201 });
  } catch (error) {
    console.error("Error creating payment:", error);
    return NextResponse.json(
      { error: "Failed to create payment" },
      { status: 500 }
    );
  }
}

// PUT - Update an existing payment
export async function PUT(request: NextRequest) {
  await connection();
  try {
    const body = await request.json();
    const { id, customer_id, amount, date, status, description } = body;

    if (!id || !customer_id || !amount || !date || !status) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const result = await sql`
      UPDATE payments
      SET amount = ${amount},
          date = ${date},
          status = ${status},
          comment = ${description || ''}
      WHERE id = ${id}
      RETURNING id, customer_id, amount, date, status, comment AS description
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    revalidatePath(`/dashboard/billing/${customer_id}/edit`);

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error("Error updating payment:", error);
    return NextResponse.json(
      { error: "Failed to update payment" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a payment
export async function DELETE(request: NextRequest) {
  await connection();
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const customer_id = searchParams.get("customer_id");

    if (!id || !customer_id) {
      return NextResponse.json(
        { error: "Missing id or customer_id" },
        { status: 400 }
      );
    }

    const result = await sql`
      DELETE FROM payments
      WHERE id = ${id}
      RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    revalidatePath(`/dashboard/billing/${customer_id}/edit`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting payment:", error);
    return NextResponse.json(
      { error: "Failed to delete payment" },
      { status: 500 }
    );
  }
}
