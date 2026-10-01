/**
 * Creates (or refreshes) a branch with sample data, and makes sure the platform
 * owner is a Super Admin.
 *
 *   npm run seed                      # Demo Academy (demo-academy)
 *   npm run seed -- --branch my-test --name "My Test Center" --tz America/Chicago
 *   npm run seed -- --no-sample       # branch + super admin only
 *
 * Uses the developer's gcloud login (see scripts/lib/firestore-rest.ts), or the
 * Firestore emulator when FIRESTORE_EMULATOR_HOST is set.
 */
import { parseArgs } from 'node:util'
import { validateBranchId } from '../shared/src/slug'
import { seedBranch } from './lib/seedBranch'

const { values } = parseArgs({
  options: {
    branch: { type: 'string', default: 'demo-academy' },
    name: { type: 'string', default: 'Demo Academy' },
    tz: { type: 'string', default: 'America/New_York' },
    'super-admin': { type: 'string', default: 'goochoi913@gmail.com' },
    'no-sample': { type: 'boolean', default: false },
  },
})

const idError = validateBranchId(values.branch!)
if (idError) {
  console.error(`Invalid branch ID “${values.branch}”: ${idError}`)
  process.exit(1)
}

seedBranch({
  branchId: values.branch!,
  name: values.name!,
  timezone: values.tz!,
  superAdmin: values['super-admin']!,
  sample: !values['no-sample'],
}).catch((e) => {
  console.error(e)
  process.exit(1)
})
