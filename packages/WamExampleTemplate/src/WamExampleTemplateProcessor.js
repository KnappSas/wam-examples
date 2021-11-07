/* eslint-disable object-curly-newline */
/* eslint-disable prefer-destructuring */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-underscore-dangle */
/* eslint-disable max-len */
/* eslint-disable no-undef */
/* eslint-disable no-plusplus */
/* eslint-disable no-bitwise */
/* eslint-disable max-classes-per-file */

/** @typedef {import('../../api').AudioWorkletProcessor} AudioWorkletProcessor */
/** @typedef {import('../../api').WamNodeOptions} WamNodeOptions */
/** @typedef {import('../../api').WamProcessor} WamProcessor */
/** @typedef {import('../../api').WamParameter} WamParameter */
/** @typedef {import('../../api').WamParameterInfo} WamParameterInfo */
/** @typedef {import('../../api').WamParameterInfoMap} WamParameterInfoMap */
/** @typedef {import('../../api').WamParameterData} WamParameterData */
/** @typedef {import('../../api').WamParameterDataMap} WamParameterDataMap */
/** @typedef {import('../../api').WamMidiData} WamMidiData */
/** @typedef {import('./types').AudioWorkletGlobalScope} AudioWorkletGlobalScope */
/** @typedef {import('./types').WamExampleTemplateEffect} WamExampleTemplateEffect */
/** @typedef {import('./types').WamExampleTemplateSynth} WamExampleTemplateSynth */

/**
 * @typedef IDependencies
 * @property {string} RingBuffer
 * @property {string} WamArrayRingBuffer
 * @property {string} WamProcessor
 * @property {string} WamParameterInfo
 * @property {string} WamExampleTemplateSynth
 * @property {string} WamExampleTemplateEffect
 */

/**
 * @param {string} [uuid]
 * @param {IDependencies} [dependencies]
 */
const initializeWamExampleTemplateProcessor = (uuid, dependencies) => {
	/** @type {AudioWorkletGlobalScope} */
	// @ts-ignore
	const audioWorkletGlobalScope = globalThis;
	const { registerProcessor } = audioWorkletGlobalScope;
	/** @type {AudioWorkletGlobalScope["RingBuffer"]} */
	const RingBuffer = audioWorkletGlobalScope[dependencies?.RingBuffer || "RingBuffer"];
	/** @type {AudioWorkletGlobalScope["WamArrayRingBuffer"]} */
	const WamArrayRingBuffer = audioWorkletGlobalScope[dependencies?.WamArrayRingBuffer || "WamArrayRingBuffer"];
	/** @type {AudioWorkletGlobalScope["WamProcessor"]} */
	const WamProcessor = audioWorkletGlobalScope[dependencies?.WamProcessor || "WamProcessor"];
	/** @type {AudioWorkletGlobalScope["WamParameterInfo"]} */
	const WamParameterInfo = audioWorkletGlobalScope[dependencies?.WamParameterInfo || "WamParameterInfo"];
	/** @type {AudioWorkletGlobalScope["WamExampleTemplateSynth"]} */
	const WamExampleTemplateSynth = audioWorkletGlobalScope[dependencies?.WamExampleTemplateSynth || "WamExampleTemplateSynth"];
	/** @type {AudioWorkletGlobalScope["WamExampleTemplateEffect"]} */
	const WamExampleTemplateEffect = audioWorkletGlobalScope[dependencies?.WamExampleTemplateEffect || "WamExampleTemplateEffect"];

	/**
	 * `WamExampleTemplate`'s `AudioWorkletProcessor`
	 */
	class WamExampleTemplateProcessor extends WamProcessor {
		/**
		 * @param {AudioWorkletNodeOptions} options
		 */
		constructor(options) {
			super(options);
			// your plugin initialization code here
			/** @private @type {WamExampleTemplateSynth} */
			this._synth = null;
	
			/** @private @type {WamExampleTemplateEffect} */
			this._effect = null;
		}
	
		/**
		 * Fetch plugin's params.
		 * @returns {WamParameterInfoMap}
		 */
		_generateWamParameterInfo() {
			return {
				// your plugin parameters here
				bypass: new WamParameterInfo('bypass', {
					type: 'boolean',
					label: 'Bypass',
					defaultValue: 0,
				}),
				...WamExampleTemplateSynth.generateWamParameterInfo(),
				...WamExampleTemplateEffect.generateWamParameterInfo(),
			};
		}
	
		/**
		 * Post-constructor initialization method.
		 */
		 _initialize() {
			super._initialize();
			const synthConfig = {
				passInput: true,
			};
			this._synth = new WamExampleTemplateSynth(this._parameterInterpolators, this._samplesPerQuantum, globalThis.sampleRate,
				synthConfig);
	
			const effectConfig = {
				numChannels: 2,
				inPlace: true,
			};
			this._effect = new WamExampleTemplateEffect(this._parameterInterpolators, this._samplesPerQuantum, globalThis.sampleRate,
				effectConfig);
		 }
	
		/**
		 *
		 * @param {WamMidiData} midiData
		 */
		_onMidi(midiData) {
			/* eslint-disable no-lone-blocks */
			const bytes = midiData.bytes;
			let type = bytes[0] & 0xf0;
			const channel = bytes[0] & 0x0f;
			const data1 = bytes[1];
			const data2 = bytes[2];
			if (type === 0x90 && data2 === 0) type = 0x80;
	
			// handle midi as needed here
			switch (type) {
			case 0x80: { /* note off */
				this._synth.noteOff(channel, data1, data2);
			} break;
			case 0x90: { /* note on */
				this._synth.noteOn(channel, data1, data2);
			} break;
			case 0xa0: { /* aftertouch */ } break;
			case 0xb0: { /* continuous controller */ } break;
			case 0xc0: { /* patch change */ } break;
			case 0xd0: { /* channel pressure */ } break;
			case 0xe0: { /* pitch bend */ } break;
			case 0xf0: { /* system */ } break;
			default: { /* invalid */ } break;
			}
		}
	
		/**
		 * Implement custom DSP here.
		 * @param {number} startSample beginning of processing slice
		 * @param {number} endSample end of processing slice
		 * @param {Float32Array[][]} inputs
		 * @param {Float32Array[][]} outputs
		 */
		_process(startSample, endSample, inputs, outputs) {
			const input = inputs[0];
			const output = outputs[0];
			if (input.length !== output.length) return;
	
			const bypass = !!this._parameterInterpolators.bypass.values[startSample];
	
			if (bypass) {
				for (let c = 0; c < output.length; ++c) {
					const x = input[c];
					const y = output[c];
					// pass input directly to output
					let n = startSample;
					while (n < endSample) {
						y[n] = x[n];
						n++;
					}
				}
			} else {
				this._synth.process(startSample, endSample, input, output);
				this._effect.process(startSample, endSample, input, output);
			}
		}
	}
	try {
		registerProcessor(uuid, WamExampleTemplateProcessor);
	} catch (error) {
		console.warn(error);
	}
};

export default initializeWamExampleTemplateProcessor;
