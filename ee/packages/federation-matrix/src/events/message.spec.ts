import { FederationMatrix } from '@rocket.chat/core-services';
import { federationSDK } from '@rocket.chat/federation-sdk';

import { message } from './message';

jest.mock('@rocket.chat/core-services', () => ({
	FederationMatrix: {
		saveFederationMessage: jest.fn(),
	},
	Message: {
		saveMessageFromFederation: jest.fn(),
	},
}));

jest.mock('@rocket.chat/federation-sdk', () => ({
	federationSDK: {
		eventEmitterService: {
			on: jest.fn(),
		},
	},
}));

jest.mock('@rocket.chat/models', () => ({
	Users: { findOneByUsername: jest.fn() },
	Rooms: { findOneById: jest.fn() },
	Messages: { findOneByFederationId: jest.fn() },
}));

jest.mock('@rocket.chat/logger', () => ({
	Logger: jest.fn().mockImplementation(() => ({
		error: jest.fn(),
		warn: jest.fn(),
		info: jest.fn(),
		debug: jest.fn(),
	})),
}));

const registeredHandler = (eventName: string) => {
	const on = federationSDK.eventEmitterService.on as jest.Mock;
	const registration = on.mock.calls.find(([name]) => name === eventName);

	if (!registration) {
		throw new Error(`No handler registered for ${eventName}`);
	}

	return registration[1] as (payload: unknown) => Promise<void>;
};

describe('message listener', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('resolves when the message is saved', async () => {
		(FederationMatrix.saveFederationMessage as jest.Mock).mockResolvedValue(undefined);

		message();

		await expect(registeredHandler('homeserver.matrix.message')({ event_id: '$a', event: {} })).resolves.toBeUndefined();
		expect(FederationMatrix.saveFederationMessage).toHaveBeenCalledTimes(1);
	});

	it('propagates a failure so the event stays staged for another attempt', async () => {
		const err = new Error('Failed to download media abc from remote.example');
		(FederationMatrix.saveFederationMessage as jest.Mock).mockRejectedValue(err);

		message();

		await expect(registeredHandler('homeserver.matrix.message')({ event_id: '$a', event: {} })).rejects.toBe(err);
	});

	it('propagates the original error unchanged', async () => {
		class MediaDownloadError extends Error {
			readonly status = 404;
		}
		const err = new MediaDownloadError('media not committed yet');
		(FederationMatrix.saveFederationMessage as jest.Mock).mockRejectedValue(err);

		message();

		await expect(registeredHandler('homeserver.matrix.message')({ event_id: '$a', event: {} })).rejects.toBeInstanceOf(MediaDownloadError);
	});
});
