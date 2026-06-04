export const FEATURE_OPTIONS = [
  { key: "jobs",           label: "Jobs",                desc: "Job management and tracking" },
  { key: "invoices",       label: "Invoices",            desc: "Create and send invoices" },
  { key: "expenses",       label: "Expenses",            desc: "Expense logging and receipts" },
  { key: "mileage",        label: "Mileage Tracking",    desc: "IRS mileage deduction tracking" },
  { key: "estimates",      label: "Estimates & Bidding", desc: "Job estimator with line items" },
  { key: "subcontractors", label: "Subcontractors",      desc: "Sub management and portal" },
  { key: "daily_logs",     label: "Daily Logs",          desc: "Field documentation" },
  { key: "compliance",     label: "Compliance Agent",    desc: "1099 and license alerts" },
  { key: "clients",        label: "Clients",             desc: "Client contact management" },
] as const;

export type FeatureKey = (typeof FEATURE_OPTIONS)[number]["key"];
