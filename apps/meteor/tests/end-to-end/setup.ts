import type { ISetting } from '@rocket.chat/core-typings';
import { after, before } from 'mocha';

import { getCredentials } from '../data/api-data';
import { getSettingValueById, updateSetting } from '../data/permissions.helper';

let rateLimiterInDevWasEnabled: ISetting['value'];

before(async () => {
	await new Promise<void>((resolve, reject) => getCredentials((err?: Error) => (err ? reject(err) : resolve())));
	rateLimiterInDevWasEnabled = await getSettingValueById('API_Enable_Rate_Limiter_Dev');
	await updateSetting('API_Enable_Rate_Limiter_Dev', false);
});

after(async () => {
	if (rateLimiterInDevWasEnabled !== undefined) {
		await updateSetting('API_Enable_Rate_Limiter_Dev', rateLimiterInDevWasEnabled);
	}
});
