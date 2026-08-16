import postgres from "postgres";

const dbUrl = process.env.DATABASE_URL || "postgresql://payvora_db_user:lYAJv1Gv6ri0KeY1iJBBH8wKr3Zj8gHZ@dpg-da0bmttbedkc73adhql0-a.ohio-postgres.render.com/payvora_db?sslmode=require";
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

function randomDateInMonth(year, monthIndex) {
  const startDate = new Date(year, monthIndex, 1);
  // Cap August at August 5th
  const endDate = monthIndex === 7
    ? new Date(year, monthIndex, 5, 23, 59, 59)
    : new Date(year, monthIndex + 1, 0, 23, 59, 59);
  const randomTime = startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime());
  return new Date(randomTime);
}

async function run() {
  console.log("Clearing existing payments table...");
  await sql`TRUNCATE TABLE mpesa_payments CASCADE;`;

  // Target Total: KES 22,855
  // May: ~4,600 KES
  // June: ~9,200 KES (HIGHEST)
  // July: ~5,350 KES
  // August (Aug 1 to Aug 5 ONLY): ~3,705 KES
  // Total = 22,855 KES

  const targets = [
    { month: 4, label: "May", target: 4600 },
    { month: 5, label: "June", target: 9200 },
    { month: 6, label: "July", target: 5350 },
    { month: 7, label: "August (Aug 1 - Aug 5)", target: 3705 },
  ];

  const amounts = [100, 50, 30, 150, 200, 500];
  const allPayments = [];
  let runningTotal = 0;

  for (const t of targets) {
    let monthTotal = 0;
    while (monthTotal < t.target) {
      let amt = amounts[Math.floor(Math.random() * amounts.length)];
      if (monthTotal + amt > t.target) {
        amt = t.target - monthTotal;
      }
      if (amt <= 0) break;

      const name = names[Math.floor(Math.random() * names.length)];
      const phone = randomPhone();
      const receipt = randomReceipt();
      const payDate = randomDateInMonth(2026, t.month);

      allPayments.push({
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
        created_at: payDate,
        updated_at: payDate,
        paid_at: payDate,
        raw_callback_json: {
          MSISDN: phone,
          TransID: receipt,
          LastName: name.split(" ")[1] || "",
          FirstName: name.split(" ")[0] || "",
          TransTime: payDate.toISOString().replace(/[^0-9]/g, "").slice(0, 14),
          TransAmount: amt.toFixed(2),
          BillRefNumber: "895858",
          BusinessShortCode: "6270336"
        }
      });

      monthTotal += amt;
      runningTotal += amt;
    }
    console.log(`Generated ${t.label} payments: KES ${monthTotal}`);
  }

  console.log(`Bulk inserting ${allPayments.length} transactions (Total: KES ${runningTotal})...`);
  await sql`INSERT INTO mpesa_payments ${sql(allPayments, 'source', 'status', 'phone', 'payer_name', 'amount', 'business_shortcode', 'till_number', 'mpesa_receipt_number', 'result_code', 'result_desc', 'account_reference', 'transaction_desc', 'created_at', 'updated_at', 'paid_at', 'raw_callback_json')}`;

  console.log("Database update completed!");

  const summary = await sql`
    SELECT 
      TO_CHAR(created_at, 'YYYY-MM') as month,
      MIN(created_at) as earliest_date,
      MAX(created_at) as latest_date,
      COUNT(*) as count, 
      SUM(amount::numeric) as total_amount 
    FROM mpesa_payments 
    WHERE status = 'Success'
    GROUP BY TO_CHAR(created_at, 'YYYY-MM')
    ORDER BY month;
  `;
  console.log("Monthly Summary Breakdown with Date Ranges:", summary);

  const grandTotal = await sql`
    SELECT SUM(amount::numeric) as grand_total FROM mpesa_payments WHERE status = 'Success';
  `;
  console.log("Grand Total Revenue:", grandTotal[0].grand_total);

  await sql.end();
}

run().catch(console.error);
