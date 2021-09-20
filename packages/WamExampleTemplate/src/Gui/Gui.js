/* eslint-disable max-classes-per-file */
/* eslint-disable no-plusplus */
/* eslint-disable no-underscore-dangle */

// https://github.com/g200kg/webaudio-controls/blob/master/webaudio-controls.js
import '../utils/webaudio-controls.js';

function computeStyleForSize(scale) {
	scale = Math.max(scale, 0.0);

	// your css here
	const style = `.pedal {
		display: inline-block;
		width: ${16 * scale}vw;
		height: ${24 * scale}vw;
		border-radius: 1vw;
		position: relative;
		text-align: center;
		margin: 0 auto;
		overflow: hidden;
		user-select: none;
	}

	#background-image {
		width: 100%;
		height: 100%;
		position: relative;
	}

	.absolute {
		position: absolute;
	}

	.knob,
	.switch {
		cursor: pointer;
		margin: 0;
		padding: 0;
		z-index: 1;
	}

	#trigger-control {
		left: 41%;
		top: 21%;
		height: 12%;
		width: 18%;
	}

	#gain-control {
		left: 36%;
		top: 44%;
		height: 14%;
		width: 22%;
	}

	#bypass-control {
		left: 41%;
		top: 81%;
		height: 12%;
		width: 18%;
	}
	`;
	return style;
}

// your html here;
const template = `<div id="wamsdk-wamexampletemplate" class="wrapper">
<div class="pedal" id="workspace">
	<img id="background-image">

	<webaudio-switch class="switch absolute" id="trigger-control" midilearn="1" type="kick" value="0" defvalue="0"></webaudio-switch>
	<webaudio-knob class="knob absolute" id="gain-control" min="0" max="2" step="0.01" value="0.5" defvalue="0.5" midilearn="1" tooltip="Gain %.1f"></webaudio-knob>
	<webaudio-switch class="switch absolute" id="bypass-control" midilearn="1" type="toggle" invert="1" value="0" defvalue="0"></webaudio-switch>

</div>
</div>
`;

const backgroundImg = './assets/background.png';

const getAssetUrl = (asset) => {
	const base = new URL('.', import.meta.url);
	return `${base}${asset}`;
};

// The GUI is a WebComponent. Not mandatory but useful.
// MANDORY : the GUI should be a DOM node. WebComponents are
// practical as they encapsulate everyhing in a shadow dom
export default class WamExampleTemplateHTMLElement extends HTMLElement {
	// plugin = the same that is passed in the DSP part. It's the instance
	// of the class that extends WebAudioModule. It's an Observable plugin
	constructor(plugin, scale = 1.0) {
		super();

		this.root = this.attachShadow({ mode: 'open' });
		const style = computeStyleForSize(scale);
		this.root.innerHTML = `<style>${style}</style>${template}`;

		// MANDATORY for the GUI to observe the plugin state
		/** @type {WebAudioModule} */
		this.plugin = plugin;
		this._controls = {};
		const parameterIds = ['bypass', 'gain', 'trigger']; // trigger isn't a real parameter
		parameterIds.forEach((parameterId) => {
			this._controls[parameterId] = this.shadowRoot.querySelector(`#${parameterId}-control`);
		});

		this.setResources();
		this.setKnobListener();
		this.setSwitchListener();

		this._guiReady = false;
		this._raf = null;

		this.plugin.audioNode.gui = this;
		if (this.plugin.audioNode.connected) this.onConnect();
	}

	triggerNotes(delayTimeSec, onOff) {
		const now = this.plugin.audioContext.getOutputTimestamp().contextTime;
		const time = now + delayTimeSec;
		const note = 100;
		const velocity = 40;

		/**
		 * @type {WamMidiEvent}
		 */
		const noteEvent = onOff ?
			{ type: 'wam-midi', data: { bytes: [0x90, note, velocity] }, time } :
			{ type: 'wam-midi', data: { bytes: [0x80, note, 0] }, time };
		this.plugin.audioNode.scheduleEvents(noteEvent);
	}

	handleAnimationFrame = async () => {
		if (!this._raf) return;
		if (!this._guiReady) {
			// rendered size of GUI
			const workspace = this.shadowRoot.querySelector('#workspace');
			const computedStyle = getComputedStyle(workspace);
			const workspaceWidth = parseFloat(computedStyle.getPropertyValue('width').replace('px', ''));
			const workspaceHeight = parseFloat(computedStyle.getPropertyValue('height').replace('px', ''));

			const parameterValues = await this.plugin.audioNode.getParameterValues();
			Object.keys(parameterValues).forEach((parameterId) => {
				const value = parameterValues[parameterId].value;
				this._controls[parameterId].value = value;
			});
			this._updateState = (e) => {
				const event = e.detail;
				const { type, data } = event;
				if (type === 'wam-automation') {
					const { id, value } = data;
					this._controls[id].value = value;
				}
			}
			this.plugin.audioNode.addEventListener('wam-automation', this._updateState);
			this._guiReady = true;
		}
		// your GUI animation code here
		this._raf = window.requestAnimationFrame(this.handleAnimationFrame);
	}

	/**
	 * Change relative URLS to absolute URLs for CSS assets, webaudio controls spritesheets etc.
	 */
	setResources() {
		// Set up the background img & style
		const background = this.root.querySelector('img');
		background.src = getAssetUrl(backgroundImg);
	}

	setKnobListener() {
		this.shadowRoot
			.querySelector('#gain-control')
			.addEventListener('input', (e) => {
				this.plugin.audioNode.setParameterValues({
					drive: {
						id: 'gain',
						value: e.target.value,
						interpolate: true,
					},
				});
			});
	}

	setSwitchListener() {
		this.shadowRoot
			.querySelector('#bypass-control')
			.addEventListener('change', () => {
				this.plugin.audioNode.setParameterValues({
					bypass: {
						id: 'bypass',
						value: this._controls['bypass'].value,
						interpolate: false,
					},
				});
			});

		this.shadowRoot
			.querySelector('#trigger-control')
			.addEventListener('change', () => {
				this.triggerNotes(0.1, this._controls['trigger'].value);
			});
	}

	// name of the custom HTML element associated
	// with the plugin. Will appear in the DOM if
	// the plugin is visible
	static is() {
		return 'wam-example-template';
	}

	onConnect() {
        this._raf = window.requestAnimationFrame(this.handleAnimationFrame);
    }

    onDisconnect() {
        window.cancelAnimationFrame(this._raf);
    }
}

if (!customElements.get(WamExampleTemplateHTMLElement.is())) {
	customElements.define(WamExampleTemplateHTMLElement.is(), WamExampleTemplateHTMLElement);
}
