/** @typedef {import('../../sdk/src/api/types').WamEventType} WamEventType */
/** @typedef {import('../../sdk/src/types').WamArrayRingBuffer} WamArrayRingBuffer */

import WamNode from '../../sdk/src/WamNode.js';

import getRingBuffer from '../../sdk/src/RingBuffer.js';
import getWamArrayRingBuffer from '../../sdk/src/WamArrayRingBuffer.js';

const RingBuffer = getRingBuffer();
const WamArrayRingBuffer = getWamArrayRingBuffer();

/* eslint-disable no-empty-function */
/* eslint-disable no-unused-vars */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-underscore-dangle */
/* eslint-disable lines-between-class-members */

/**
 * Object containing the most recent levels values
 * from the processor
 *
 * @typedef {Object} LevelsMap
 * @property {Float32Array} synthLevels
 * @property {Float32Array} effectLevels
 */

export default class WamExampleNode extends WamNode {
	/**
	 * @param {WebAudioModule} module
	 * @param {AudioWorkletNodeOptions} options
	 */
	constructor(module, options) {
		options.processorOptions = {
			numberOfInputs: 1,
			numberOfOutputs: 1,
			outputChannelCount: [2],
			useSab: true,
		};
		super(module, options);

		/** @private @type {Set<WamEventType>} */
		this._supportedEventTypes = new Set(['wam-automation', 'wam-midi']);

		/** @private @type {number} */
		this._levelsUpdatePeriodMs = -1;

		/** @private @type {Float32Array} */
		this._levels = new Float32Array(4);

		/** @private @type {LevelsMap} */
		this._levelsMap = {
			synthLevels: new Float32Array(this._levels.buffer, 0, 2),
			effectLevels: new Float32Array(this._levels.buffer, 2 * Float32Array.BYTES_PER_ELEMENT, 2),
		};

		/** @private @type {boolean} */
		this._levelsSabReady = false;
	}

	/**
	 * Get the latest available levels values from the processor.
	 * Returned object should be treated as read-only.
	 *
	 * @readonly
	 * @returns {LevelsMap}
	 * */
	get levels() {
		if (this._levelsSabReady) this._levelsReader.read(this._levels, true);
		return this._levelsMap;
	}

	/**
	 * How often the processor will update the levels values.
	 *
	 * @readonly
	 * @returns {number}
	 */
	get levelsUpdatePeriodMs() {
		return this._levelsUpdatePeriodMs;
	}

	/**
	 * Messages from audio thread
	 * @param {MessageEvent} message
	 * */
	_onMessage(message) {
		const { data } = message;
		const { levels, levelsSab, levelsLength, levelsUpdatePeriodMs } = data;
		if (levels) this._levels.set(levels);
		else if (levelsSab) {
			this._useSab = true;

			if (levelsLength !== this._levels.length) throw Error('Levels signal length mismatch!');

			/** @private @type {SharedArrayBuffer} */
			this._levelsSab = WamArrayRingBuffer.getStorageForEventCapacity(RingBuffer,
				levelsLength, Float32Array);

			/** @private @type {WamArrayRingBuffer} */
			this._levelsReader = new WamArrayRingBuffer(RingBuffer, this._levelsSab,
				levelsLength, Float32Array);

			const request = 'initialize/levelsSab';
			const id = this._generateMessageId();
			let processed = false;
			new Promise((resolve, reject) => {
				this._pendingResponses[id] = resolve;
				this._pendingEvents[id] = () => { if (!processed) reject(); };
				this.port.postMessage({
					id,
					request,
					content: { levelsSab: this._levelsSab }
				});
			}).then((resolved) => {
				processed = true;
				this._levelsSabReady = true;
				delete this._pendingEvents[id];
			}).catch((rejected) => { delete this._pendingResponses[id]; });
		} else if (levelsUpdatePeriodMs) this._levelsUpdatePeriodMs = Math.ceil(levelsUpdatePeriodMs);
		else super._onMessage(message);
	}
}
