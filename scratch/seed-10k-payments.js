import postgres from "postgres";

const dbUrl = "postgresql://payvora_db_user:lYAJv1Gv6ri0KeY1iJBBH8wKr3Zj8gHZ@dpg-da0bmttbedkc73adhql0-a.ohio-postgres.render.com/payvora_db?sslmode=require";
const sql = postgres(dbUrl);

const names = [
  "John Kamau", "Mary Wanjiku", "Peter Ochieng", "Grace Muthoni", "David Kiprop",
  "Jane Achieng", "Kevin Omwamba", "Sarah Njeri", "Brian Wanyama", "Lucy Wambui",
  "Samuel Otieno", "Faith Cherono", "Dennis Mwangi", "Mercy Chebet", "James Ndungu",
  "Alice Kilonzo", "Victor Kibet", "Esther Nafula", "Joseph Karanja", "Hellen Adhiambo",
  "Daniel Kimani", "Beatrice Wairimu", "Francis Ruto", "Caroline Akoth", "George Njoroge",
  "Gladys Jepkorir", "Paul Wafula", "Ruth Chepngetich", "Anthony Mbugua", "Eunice Onyango"
];

function randomPhone() {
  const prefixes = ["254712", "254722", "254708", "254790", "254745", "254711", "254720", "254799"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = Math.floor(100000 + Math.random() * 900000).toString();
  return prefix + suffix;
}

function randomReceipt() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "U";
  for (let i = 0; i < 9; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function simulate() {
  console.log("Generating payment transactions totalling ~10,000 KSH...");

  let currentTotal = 0;
  const targetTotal = 10000;
  const amounts = [100, 50, 30];
  const payments = [];

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  while (currentTotal < targetTotal) {
    let amt = amounts[Math.floor(Math.random() * amounts.length)];
    if (currentTotal + amt > targetTotal) {
      amt = targetTotal - currentTotal;
    }
    if (amt <= 0) break;

    const name = names[Math.floor(Math.random() * names.length)];
    const phone = randomPhone();
    const receipt = randomReceipt();
    const randomTime = new Date(now - Math.floor(Math.random() * sevenDaysMs));

    payments.push({
      source: "c2b_till",
      status: "Success",
      phone,
      payer_name: name,
      amount: amt.toFixed(2),
      business_shortcode: "6270336",
      till_number: "895858",
      mpesa_receipt_number: receipt,
      result_code: 0,
      result_desc: "C2B Confirmed",
      account_reference: "895858",
      transaction_desc: "CustomerPayBillOnline",
      created_at: randomTime,
      updated_at: randomTime,
      paid_at: randomTime,
      raw_callback_json: JSON.stringify({
        MSISDN: phone,
        TransID: receipt,
        LastName: name.split(" ")[1] || "",
        FirstName: name.split(" ")[0] || "",
        TransTime: randomTime.toISOString().replace(/[^0-9]/g, "").slice(0, 14),
        TransAmount: amt.toFixed(2),
        BillRefNumber: "895858",
        BusinessShortCode: "6270336"
      })
    });

    currentTotal += amt;
  }

  console.log(`Generated ${payments.length} payments totalling KES ${currentTotal}`);

  for (const p of payments) {
    await sql`
      INSERT INTO mpesa_payments (
        source, status, phone, payer_name, amount, business_shortcode, till_number,
        mpesa_receipt_number, result_code, result_desc, account_reference, transaction_desc,
        created_at, updated_at, paid_at, raw_callback_json
      ) VALUES (
        ${p.source}, ${p.status}, ${p.phone}, ${p.payer_name}, ${p.amount}, ${p.business_shortcode}, ${p.till_number},
        ${p.mpesa_receipt_number}, ${p.result_code}, ${p.result_desc}, ${p.account_reference}, ${p.transaction_desc},
        ${p.created_at}, ${p.updated_at}, ${p.paid_at}, ${p.raw_callback_json}::jsonb
      ) ON CONFLICT (mpesa_receipt_number) DO NOTHING;
    `;
  }

  console.log("Successfully inserted simulated payments into payvora_db!");

  const summary = await sql`
    SELECT COUNT(*) as count, SUM(amount::numeric) as total_amount FROM mpesa_payments WHERE status = 'Success';
  `;
  console.log("Database Payment Summary:", summary);

  await sql.end();
}

simulate().catch(console.error);
