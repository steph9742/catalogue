ALTER TABLE "connecteur_ldap" ALTER COLUMN "filtre" SET DEFAULT '(|(eduPersonAffiliation=employee)(eduPersonAffiliation=faculty)(eduPersonAffiliation=staff)(eduPersonAffiliation=teacher)(eduPersonAffiliation=researcher)(eduPersonAffiliation=emeritus)(eduPersonAffiliation=affiliate))';--> statement-breakpoint

-- La valeur par défaut ne s'applique qu'aux lignes FUTURES. Le connecteur étant un
-- singleton créé au premier accès, sa ligne peut déjà exister avec l'ancien filtre.
--
-- La condition sur l'ancienne valeur est essentielle : un filtre modifié à la main dans
-- les réglages ne doit pas être écrasé par une migration. La décision humaine prime,
-- comme partout ailleurs.
UPDATE "connecteur_ldap"
SET "filtre" = '(|(eduPersonAffiliation=employee)(eduPersonAffiliation=faculty)(eduPersonAffiliation=staff)(eduPersonAffiliation=teacher)(eduPersonAffiliation=researcher)(eduPersonAffiliation=emeritus)(eduPersonAffiliation=affiliate))'
WHERE "filtre" = '(|(objectClass=ufcEmploye)(objectClass=ufcAutre))';
