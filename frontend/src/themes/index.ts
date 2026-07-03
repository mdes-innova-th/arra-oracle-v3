import { registerTheme } from './registry';
import { oracleDefault } from './oracle-default';
import { midnightTeal } from './midnight-teal';
import { emeraldNoir } from './emerald-noir';
import { sakura } from './sakura';
import { copperSlate } from './copper-slate';
import { forestMoss } from './forest-moss';
import { lavenderMist } from './lavender-mist';
import { arcticBlue } from './arctic-blue';

registerTheme(oracleDefault);
registerTheme(midnightTeal);
registerTheme(emeraldNoir);
registerTheme(sakura);
registerTheme(copperSlate);
registerTheme(forestMoss);
registerTheme(lavenderMist);
registerTheme(arcticBlue);

export { getThemes, getTheme, DEFAULT_THEME_ID } from './registry';
export type { ThemeDefinition, ThemeTokens } from './types';
