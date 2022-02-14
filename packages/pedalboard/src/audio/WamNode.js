/**
 * @typedef {import('@webaudiomodules/api').WamNode} IWamNode
 * @typedef {import('@webaudiomodules/sdk').WebAudioModule} WebAudioModule
 * @typedef {import('../index').default} PedalboardPlugin
 * @typedef {import('./PedalboardAudioNode').default} PedalboardAudioNode
 * @typedef {import('@webaudiomodules/api').WamParameterInfo} WamParameterInfo
 * @typedef {import('@webaudiomodules/api').WamParameterInfoMap} WamParameterInfoMap
 * @typedef {import('@webaudiomodules/api').WamParameterDataMap} WamParameterDataMap
 * @typedef {import('@webaudiomodules/api').WamEvent} WamEvent
 * @typedef {import('@webaudiomodules/api').WamEventMap} WamEventMap
 * @typedef {import('@webaudiomodules/api').WamEventType} WamEventType
 * @typedef {import('@webaudiomodules/api').WamInfoEvent} WamInfoEvent
 * @typedef {import('@webaudiomodules/api').WamParameterConfiguration} WamParameterConfiguration
 */
//@ts-check
import { getWamParameterInfo } from '@webaudiomodules/sdk';

const WamParameterInfo = getWamParameterInfo();
/**
 * @implements {IWamNode}
 * @implements {AudioWorkletNode}
 */
export default class WamNode extends AudioWorkletNode {
	/**
	 * @param {PedalboardPlugin} module
	 * @param {PedalboardAudioNode} pedalboardNode
	 */
	constructor(module, pedalboardNode) {
		const { audioContext, moduleId, instanceId, subgroupKey, destination } = module;
		const pluginList = pedalboardNode.pluginList.map((p) => p.instance.instanceId);
		const options = {
			processorOptions: {
				moduleId,
				instanceId,
				pluginList,
				subgroupKey,
				destinationId: destination.instanceId,
			},
		};
		super(audioContext, moduleId, options);

		/** @type {WebAudioModule} */
		this.module = module;
		/** @type {PedalboardAudioNode} */
		this.pedalboardNode = pedalboardNode;
		/** @type {{ instanceId: string; parameterId: string }[]} */
		this._parameterInfoMap = [];
		/** @type {Record<number, ((...args: any[]) => any)>} */
		this._resolves = {};
		/** @type {Record<number, ((...args: any[]) => any)>} */
		this._rejects = {};
		this._messageRequestId = 0;
		/**
		 * @param {string} call
		 * @param {any} args
		 */
		this._call = (call, ...args) => {
			const id = this._messageRequestId;
			this._messageRequestId += 1;
			return new Promise((resolve, reject) => {
				this._resolves[id] = resolve;
				this._rejects[id] = reject;
				this.port.postMessage({ id, call, args });
			});
		};
		this._handleMessage = ({ data }) => {
			// eslint-disable-next-line object-curly-newline
			const { id, call, args, value, error } = data;
			if (call) {
				/** @type {any} */
				const r = { id };
				try {
					r.value = this[call](...args);
				} catch (e) {
					r.error = e;
				}
				this.port.postMessage(r);
			} else {
				if (error) {
					if (this._rejects[id]) this._rejects[id](error);
					delete this._rejects[id];
					return;
				}
				if (this._resolves[id]) {
					this._resolves[id](value);
					delete this._resolves[id];
				}
			}
		};

		this.port.start();
		this.port.addEventListener('message', this._handleMessage);

		/**
		 * @param {CustomEvent<{ pluginList: PedalboardAudioNode['pluginList'] }>} e
		 */
		this.handlePedalboardChange = async (e) => {
			const workletPluginList = e.detail.pluginList.map((p) => p.instance.instanceId);
			this._parameterInfoMap = [];
			// eslint-disable-next-line no-restricted-syntax
			for (const { instance } of this.pedalboardNode.pluginList) {
				// eslint-disable-next-line no-shadow
				const { instanceId } = instance;
				// eslint-disable-next-line no-await-in-loop
				const parameterInfo = await instance.audioNode.getParameterInfo();
				Object.keys(parameterInfo).forEach((parameterId) => {
					this._parameterInfoMap.push({ instanceId, parameterId });
				});
			}
			const data = { instanceId: this.instanceId };
			await this._call('updatePluginList', workletPluginList);
			await this._call('updateParameterInfo', data);
			await this._call('setCompensationDelay', await this.getCompensationDelay());
			/** @type {CustomEvent<WamInfoEvent>} */
			const wamInfoEvent = new CustomEvent('wam-info', { detail: { type: 'wam-info', data, time: this.context.currentTime } });
			this.dispatchEvent(wamInfoEvent);
		};
		// @ts-ignore
		this.addEventListener('change', this.handlePedalboardChange);
	}

	get groupId() { return this.module.groupId; }

	get moduleId() { return this.module.moduleId; }

	get instanceId() { return this.module.instanceId; }

	/**
	 * @param {string[]} parameterIds
	 * @returns {Promise<WamParameterInfoMap>}
	 */
	async getParameterInfo(...parameterIds) {
		const ids = parameterIds.length ? parameterIds : Object.keys(this._parameterInfoMap);
		/** @type {WamParameterInfoMap} */
		const map = {};
		await Promise.all(ids.map(async ($parameterId, i) => {
			const { instanceId, parameterId } = this._parameterInfoMap[$parameterId];
			const found = this.pedalboardNode.pluginList
				.find(({ instance }) => instance.instanceId === instanceId);
			if (found) {
				const { instance } = found;
				if (instance) {
					const parameterInfo = await instance.audioNode.getParameterInfo(parameterId);
					map[$parameterId] = new WamParameterInfo(i.toString(), {
						...parameterInfo[parameterId],
						label: `${instance.name}/${parameterInfo[parameterId].label}`
					});
				}
			}
		}));
		return map;
	}

	/**
	 * @param {boolean} normalized
	 * @param {string[]} parameterIds
	 * @returns {Promise<WamParameterDataMap>}
	 */
	async getParameterValues(normalized, ...parameterIds) {
		/** @type {WamParameterDataMap} */
		const map = {};
		await Promise.all(parameterIds.map(async ($parameterId) => {
			const { instanceId, parameterId } = this._parameterInfoMap[$parameterId];
			const found = this.pedalboardNode.pluginList
				.find(({ instance }) => instance.instanceId === instanceId);
			if (found) {
				const { instance } = found;
				if (instance) {
					const parameterValues = await instance.audioNode
						.getParameterValues(normalized, parameterId);
					map[$parameterId] = parameterValues[parameterId];
				}
			}
		}));
		return map;
	}

	/**
	 * @param {WamParameterDataMap} parameterValues
	 * @returns {Promise<void>}
	 */
	async setParameterValues(parameterValues) {
		await Promise.all(
			Object.entries(parameterValues).map(async ([$parameterId, { normalized, value }]) => {
				const { instanceId, parameterId } = this._parameterInfoMap[$parameterId];
				const found = this.pedalboardNode.pluginList
					.find(({ instance }) => instance.instanceId === instanceId);
				if (found) {
					const { instance } = found;
					if (instance) {
						const map = { [parameterId]: { id: parameterId, value, normalized } };
						await instance.audioNode.setParameterValues(map);
					}
				}
			}),
		);
	}

	/**
	 * @param {{ url: string, params: Record<string, number> }[]} pluginArray
	 */
	async setState(pluginArray) {
		this.pedalboardNode.clearPlugins();
		// eslint-disable-next-line no-restricted-syntax
		for (const plugin of pluginArray) {
			// eslint-disable-next-line no-await-in-loop
			await this.pedalboardNode.addPlugin(plugin.url, plugin.params);
		}
	}

	async getState() {
		return Promise.all(this.pedalboardNode.pluginList.map(async (plugin) => (
			{
				url: plugin.url,
				params: await plugin.instance.audioNode.getState(),
			}
		)));
	}

	async getCompensationDelay() {
		let delay = 0;
		await Promise.all(this.pedalboardNode.pluginList.map(async (plugin) => {
			delay += await plugin.instance.audioNode.getCompensationDelay();
		}));
		return delay;
	}

	/**
	 * @param {WamEvent[]} events
	 */
	eventEmitted(...events) {
		events.forEach((event) => {
			const { type } = event;
			this.dispatchEvent(new CustomEvent(type, {
				bubbles: true,
				detail: event,
			}));
		})
	}

	/** @param {WamEvent} event */
	scheduleAutomationEvent(event) {
		if (event.type === 'wam-automation') {
			const { time, type, data } = event;
			const { id: $id, normalized, value } = data;
			const { instanceId, parameterId } = this._parameterInfoMap[+$id];
			const found = this.pedalboardNode.pluginList
				.find(({ instance }) => instance.instanceId === instanceId);
			if (found) {
				const { instance } = found;
				instance.audioNode
					.scheduleEvents({ type, time, data: { id: parameterId, value, normalized } });
				return true;
			}
		}
		return false;
	}

	/**
	 * @param {WamEvent[]} events
	 */
	scheduleEvents(...events) {
		if (this.pedalboardNode.pluginList.length) {
			this.pedalboardNode.pluginList[0].instance.audioNode
				.scheduleEvents(...events.filter((event) => !this.scheduleAutomationEvent(event)));
		}
	}

	clearEvents() {
		this.pedalboardNode.pluginList.forEach((p) => p.instance.audioNode.clearEvents());
	}

	/**
	 * @param {string} toId
	 * @param {number} [output]
	 */
	connectEvents(toId, output) {
		if (this.pedalboardNode.pluginList.length) {
			const last = this.pedalboardNode.pluginList[this.pedalboardNode.pluginList.length - 1];
			last.instance.audioNode.connectEvents(toId, output);
		}
	}

	/**
	 * @param {string} [toId]
	 * @param {number} [output]
	 */
	disconnectEvents(toId, output) {
		if (this.pedalboardNode.pluginList.length) {
			const last = this.pedalboardNode.pluginList[this.pedalboardNode.pluginList.length - 1];
			last.instance.audioNode.connectEvents(toId, output);
		}
	}

	async destroy() {
		this.disconnect();
		// @ts-ignore
		this.removeEventListener('change', this.handlePedalboardChange);
		await this._call('destroy');
		this.port.close();
	}
}
