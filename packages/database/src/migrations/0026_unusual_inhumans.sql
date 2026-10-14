CREATE TABLE "preference_utilisateur" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"epingles" text[],
	"ordre_sections" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "preference_utilisateur" ADD CONSTRAINT "preference_utilisateur_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "preference_utilisateur_user_unique" ON "preference_utilisateur" USING btree ("user_id");