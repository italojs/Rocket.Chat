import { expect } from 'chai';
import { beforeEach, describe, it } from 'mocha';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

// own sandbox: other specs call sinon.restore() on the default one
const sandbox = sinon.createSandbox();

const pushTokenModelStub = {
	findOneById: sandbox.stub(),
	removeVoipTokensByAuthToken: sandbox.stub(),
};
const registerPushTokenStub = sandbox.stub();
const loggerStub = { debug: sandbox.stub(), warn: sandbox.stub(), error: sandbox.stub(), info: sandbox.stub() };

const { PushService } = proxyquire.noCallThru().load('../../../../../server/services/push/service', {
	'@rocket.chat/models': { PushToken: pushTokenModelStub },
	'./logger': { logger: loggerStub },
	'./tokenManagement/registerPushToken': { registerPushToken: registerPushTokenStub },
	'@rocket.chat/core-services': {
		ServiceClassInternal: class {
			onEvent() {
				// the service registers a watch.users listener on construction; irrelevant here
			}
		},
	},
});

describe('PushService.registerPushToken()', () => {
	let service: any;

	beforeEach(() => {
		sandbox.reset();
		registerPushTokenStub.resolves('token-id');
		pushTokenModelStub.findOneById.resolves({ _id: 'token-id', tokenType: 'gcm', tokenValue: 'GCM_TOKEN' });
		pushTokenModelStub.removeVoipTokensByAuthToken.resolves({ deletedCount: 0 });
		service = new PushService();
	});

	const input = (overrides: Record<string, unknown> = {}) => ({
		token: { gcm: 'GCM_TOKEN' },
		authToken: 'hashed-auth-token',
		appName: 'app',
		userId: 'user1',
		...overrides,
	});

	it('registers a separate voip document when a voip token is provided', async () => {
		await service.registerPushToken(input({ voipToken: 'VOIP_TOKEN' }));

		expect(registerPushTokenStub.calledTwice).to.be.true;
		expect(registerPushTokenStub.secondCall.args[0]).to.include({ tokenType: 'voip', tokenValue: 'VOIP_TOKEN' });
		expect(pushTokenModelStub.removeVoipTokensByAuthToken.called).to.be.false;
	});

	it('removes a previously registered voip document when the device re-registers without a voip token', async () => {
		await service.registerPushToken(input());

		expect(registerPushTokenStub.calledOnce).to.be.true;
		expect(pushTokenModelStub.removeVoipTokensByAuthToken.calledOnce).to.be.true;
		expect(pushTokenModelStub.removeVoipTokensByAuthToken.firstCall.args[0]).to.equal('hashed-auth-token');
	});
});
