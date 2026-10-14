import { drizzle } from 'drizzle-orm/node-postgres'
import * as authSchema from './schemas/auth-schema'
import * as academique from './schemas/academique'
import * as organisation from './schemas/organisation'
import * as profils from './schemas/profils'
import * as tiers from './schemas/tiers'
import * as applications from './schemas/applications'
import * as lieux from './schemas/lieux'
import * as infrastructure from './schemas/infrastructure'
import * as materiel from './schemas/materiel'
import * as reseau from './schemas/reseau'
import * as actifs from './schemas/actifs'
import * as flux from './schemas/flux'
import * as smsi from './schemas/smsi'
import * as smsiManagement from './schemas/smsi_management'
import * as nis2 from './schemas/nis2'
import * as nis2Incidents from './schemas/nis2_incidents'
import * as cadres from './schemas/cadres'
import * as rgpd from './schemas/rgpd'
import * as iso27001 from './schemas/iso27001'
import * as ebios from './schemas/ebios'
import * as conformite from './schemas/conformite'
import * as piecesJointes from './schemas/pieces_jointes'
import * as nis2Entite from './schemas/nis2_entite'
import * as glpi from './schemas/glpi'
import * as harfanglab from './schemas/harfanglab'
import * as certificats from './schemas/certificats'
import * as servicesExposes from './schemas/services_exposes'
import * as whitelists from './schemas/whitelists'
import * as slowpoke from './schemas/slowpoke'
import * as vpn from './schemas/vpn'
import * as postes from './schemas/postes'
import * as alerting from './schemas/alerting'
import * as rbac from './schemas/rbac'
import * as preferences from './schemas/preferences'
import * as workflow from './schemas/workflow'
import * as audit from './schemas/audit'

export const schema = {
  ...authSchema,
  ...academique,
  ...organisation,
  ...profils,
  ...tiers,
  ...applications,
  ...lieux,
  ...infrastructure,
  ...materiel,
  ...reseau,
  ...actifs,
  ...flux,
  ...smsi,
  ...smsiManagement,
  ...nis2,
  ...cadres,
  ...rgpd,
  ...iso27001,
  ...nis2Incidents,
  ...ebios,
  ...conformite,
  ...piecesJointes,
  ...nis2Entite,
  ...glpi,
  ...harfanglab,
  ...certificats,
  ...servicesExposes,
  ...whitelists,
  ...slowpoke,
  ...vpn,
  ...postes,
  ...alerting,
  ...rbac,
  ...preferences,
  ...workflow,
  ...audit,
}

const db = drizzle(process.env.DATABASE_URL!, { schema })

export { db }
