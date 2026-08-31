import type { Credentials } from '@rocket.chat/api-client';
import type { IUser } from '@rocket.chat/core-typings';
import { expect } from 'chai';
import { after, before, describe, it } from 'mocha';

import { api, credentials, request } from '../../data/api-data';
import { updateSetting } from '../../data/permissions.helper';
import type { TestUser } from '../../data/users.helper';
import { createUser, deleteUser, login } from '../../data/users.helper';

const PASSWORD = 'rate-limiter-spec';

describe('[Rate Limiter]', () => {
	let alice: TestUser<IUser>;
	let bob: TestUser<IUser>;
	let aliceCredentials: Credentials;
	let bobCredentials: Credentials;

	before(async function () {
		[alice, bob] = await Promise.all([
			createUser({ password: PASSWORD } as Partial<IUser>),
			createUser({ password: PASSWORD } as Partial<IUser>),
		]);
		[aliceCredentials, bobCredentials] = await Promise.all([login(alice.username, PASSWORD), login(bob.username, PASSWORD)]);

		await updateSetting('API_Enable_Rate_Limiter_Dev', true);

		const probe = await request
			.post(api('chat.sendMessage'))
			.set(aliceCredentials)
			.send({ message: { rid: 'GENERAL', msg: 'probe' } });
		if (!probe.headers['x-ratelimit-limit']) {
			this.skip();
		}
	});

	after(async () => {
		await updateSetting('API_Enable_Rate_Limiter_Dev', false);
		await Promise.all([deleteUser(alice), deleteUser(bob)]);
	});

	describe('per user', () => {
		const send = (who: Credentials, msg: string) =>
			request
				.post(api('chat.sendMessage'))
				.set(who)
				.send({ message: { rid: 'GENERAL', msg } });

		it('should reject a user past the endpoint allowance', async () => {
			const statuses = await Promise.all([...Array(12)].map((_, i) => send(aliceCredentials, `burst ${i}`).then((res) => res.status)));

			expect(statuses).to.include(200);
			expect(statuses).to.include(429);
		});

		it('should leave another user on the same address with a full allowance', async () => {
			const res = await send(bobCredentials, 'bob');

			expect(res.status).to.equal(200);
			expect(res.headers['x-ratelimit-remaining']).to.equal('4');
		});
	});

	describe('bypass', () => {
		it('should not limit a user holding api-bypass-rate-limit', async () => {
			const statuses = await Promise.all(
				[...Array(12)].map((_, i) =>
					request
						.post(api('chat.sendMessage'))
						.set(credentials)
						.send({ message: { rid: 'GENERAL', msg: `admin burst ${i}` } })
						.then((res) => res.status),
				),
			);

			expect(statuses).to.deep.equal(Array(12).fill(200));
		});
	});
});
