import { common } from './common';
import { auth } from './auth';
import { dashboard } from './dashboard';
import { projects } from './projects';
import { crawl } from './crawl';
import { audit } from './audit';
import { keywords } from './keywords';
import { rankings } from './rankings';
import { competitors } from './competitors';
import { backlinks } from './backlinks';
import { integrations } from './integrations';
import { reports } from './reports';
import { billing } from './billing';
import { settings } from './settings';
import { notifications } from './notifications';
import { errors } from './errors';
import { validation } from './validation';
import { calendar } from './calendar';
import { payment } from './payment';
import { help } from './help';

export const fa = {
  common,
  auth,
  dashboard,
  projects,
  crawl,
  audit,
  keywords,
  rankings,
  competitors,
  backlinks,
  integrations,
  reports,
  billing,
  settings,
  notifications,
  errors,
  validation,
  calendar,
  payment,
  help,
};

export type TranslationKeys = typeof fa;
export type TranslationNamespace = keyof TranslationKeys;

export default fa;
