CREATE TABLE "transaction_tags" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "transaction_tags_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "transaction_tag_assignments" (
  "transaction_id" UUID NOT NULL,
  "tag_id" UUID NOT NULL,
  CONSTRAINT "transaction_tag_assignments_pkey" PRIMARY KEY ("transaction_id", "tag_id")
);
CREATE UNIQUE INDEX "transaction_tags_user_id_name_key" ON "transaction_tags"("user_id", "name");
CREATE INDEX "transaction_tags_user_id_idx" ON "transaction_tags"("user_id");
CREATE INDEX "transaction_tag_assignments_tag_id_idx" ON "transaction_tag_assignments"("tag_id");
ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_tag_assignments" ADD CONSTRAINT "transaction_tag_assignments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_tag_assignments" ADD CONSTRAINT "transaction_tag_assignments_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "transaction_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
