-- An installment plan can be postponed one period ("skipped"): the unpaid parcel moves to the next period with
-- no balance change, so the plan keeps its parcel count and ends one period later. Each skip is counted here.
ALTER TABLE "Transaction" ADD COLUMN skipped_installments INTEGER NOT NULL DEFAULT 0;
