import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { estimateQuoteEventsTable } from "@workspace/db/schema";

describe("estimate quote event schema", () => {
  it("keeps revision assets and identifiers private and constrained", () => {
    const config = getTableConfig(estimateQuoteEventsTable);
    const columnNames = config.columns.map(column => column.name);
    const checkNames = config.checks.map(({ name }) => name);
    const indexNames = config.indexes.map(index => index.config.name);

    expect(columnNames).toContain("customer_snapshot");
    expect(columnNames).toContain("pdf_object_path");
    expect(columnNames).toContain("logo_content_type");
    expect(checkNames).toEqual(expect.arrayContaining([
      "estimate_quote_events_revision_positive_check",
      "estimate_quote_events_type_status_check",
      "estimate_quote_events_response_shape_check",
    ]));
    expect(indexNames).toEqual(expect.arrayContaining([
      "estimate_quote_events_idempotency_key_unique",
      "estimate_quote_events_token_hash_unique",
      "estimate_quote_events_one_response_per_revision",
    ]));
  });
});
