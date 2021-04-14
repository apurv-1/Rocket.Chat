import { Emitter } from '@rocket.chat/emitter';
import { useEffect, useMemo } from 'react';
import { useSubscription, Subscription, Unsubscribe } from 'use-subscription';

import { IRoom } from '../../definition/IRoom';
import { useUserId, useUserRoom, useUserSubscription } from '../contexts/UserContext';
import { useAsyncState } from '../hooks/useAsyncState';
import { AsyncState } from './asyncState';

export class RoomStore extends Emitter<{
	changed: undefined;
}> {
	lastTime?: Date;

	scroll?: number;

	constructor(readonly rid: string) {
		super();

		this.on('changed', () => console.log(`RoomStore ${this.rid} changed`, this));
	}

	update({ scroll, lastTime }: { scroll?: number; lastTime?: Date }): void {
		if (scroll !== undefined) {
			this.scroll = scroll;
		}
		if (lastTime !== undefined) {
			this.lastTime = lastTime;
		}
		if (scroll || lastTime) {
			this.emit('changed');
		}
	}
}

export const RoomManager = new (class RoomManager extends Emitter<{
	changed: undefined;
	opened: IRoom['_id'];
	closed: IRoom['_id'];
	back: IRoom['_id'];
	removed: IRoom['_id'];
}> {
	private rid: IRoom['_id'] | undefined;

	private lastRid: IRoom['_id'] | undefined;

	private rooms: Map<IRoom['_id'], RoomStore> = new Map();

	constructor() {
		super();
		this.on('opened', (rid) => {
			console.log('room opened ->', rid);
		});
	}

	get lastOpened(): IRoom['_id'] | undefined {
		return this.lastRid;
	}

	get opened(): IRoom['_id'] | undefined {
		return this.rid;
	}

	visitedRooms(): IRoom['_id'][] {
		return [...this.rooms.keys()];
	}

	back(rid: IRoom['_id']): void {
		if (rid === this.rid) {
			this.lastRid = rid;
			this.rid = undefined;
			this.emit('back', rid);
		}
	}

	close(rid: IRoom['_id']): void {
		if (!this.rooms.has(rid)) {
			this.rooms.delete(rid);
		}
		this.emit('changed');
	}

	open(rid: IRoom['_id']): void {
		if (rid === this.rid) {
			return;
		}

		this.back(rid);
		if (!this.rooms.has(rid)) {
			this.rooms.set(rid, new RoomStore(rid));
		}
		this.rid = rid;
		this.emit('opened', rid);
		this.emit('changed');
	}

	getStore(rid: IRoom['_id']): RoomStore | undefined {
		return this.rooms.get(rid);
	}
})();

const subscribeVistedRooms: Subscription<IRoom['_id'][]> = {
	getCurrentValue: () => RoomManager.visitedRooms(),
	subscribe(callback) {
		return RoomManager.on('changed', callback);
	},
};

const subscribeOpenedRoom: Subscription<IRoom['_id'] | undefined> = {
	getCurrentValue: () => RoomManager.opened,
	subscribe(callback) {
		return RoomManager.on('opened', callback);
	},
};

const fields = {};

export const useHandleRoom = (rid: IRoom['_id']): AsyncState<IRoom> => {
	const { resolve, update, ...state } = useAsyncState<IRoom>();
	const uid = useUserId();
	const subscription = (useUserSubscription(rid, fields) as unknown) as IRoom;
	const _room = (useUserRoom(rid, fields) as unknown) as IRoom;

	const room = uid ? subscription || _room : _room;

	useEffect(() => {
		if (room) {
			update();
			resolve(room);
		}
	}, [resolve, update, room]);

	return state;
};

export const useVisitedRooms = (): IRoom['_id'][] => useSubscription(subscribeVistedRooms);

export const useOpenedRoom = (): IRoom['_id'] | undefined => useSubscription(subscribeOpenedRoom);

export const useRoomStore = (rid: IRoom['_id']): RoomStore => {
	const subscribeStore: Subscription<RoomStore | undefined> = useMemo(
		() => ({
			getCurrentValue: (): RoomStore | undefined => RoomManager.getStore(rid),
			subscribe(callback): Unsubscribe {
				return RoomManager.on('changed', callback);
			},
		}),
		[rid],
	);

	const store = useSubscription(subscribeStore);

	if (!store) {
		throw new Error('Something wrong');
	}
	return store;
};
