-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "idempotency_key" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "work_order_items" ADD COLUMN     "deleted_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");


-- İade (negatif tutar) için açıklama zorunlu.
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_note_chk"
  CHECK ("amount_kurus" > 0 OR length(trim(coalesce("note", ''))) > 0);
