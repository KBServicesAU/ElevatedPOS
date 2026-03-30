-- Stock transfers: add indexes for filtering by location and status

CREATE INDEX IF NOT EXISTS idx_stock_transfers_org_id ON "stock_transfers"("org_id");
CREATE INDEX IF NOT EXISTS idx_stock_transfers_org_status ON "stock_transfers"("org_id", "status");
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_location ON "stock_transfers"("from_location_id");
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_location ON "stock_transfers"("to_location_id");
CREATE INDEX IF NOT EXISTS idx_stock_transfers_created_at ON "stock_transfers"("created_at");

CREATE INDEX IF NOT EXISTS idx_stock_transfer_lines_transfer_id ON "stock_transfer_lines"("transfer_id");
CREATE INDEX IF NOT EXISTS idx_stock_transfer_lines_product_id ON "stock_transfer_lines"("product_id");
