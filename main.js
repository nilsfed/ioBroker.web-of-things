"use strict";

/*
 * Created with @iobroker/create-adapter v1.34.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

// Load your modules here, e.g.:
// const fs = require("fs");


const { Servient, Helpers } = require("@node-wot/core");
const { HttpClientFactory } = require("@node-wot/binding-http");

class WebOfThings extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "web-of-things",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here

		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:
		this.log.info("config option1: " + this.config.option1);
		this.log.info("config option2: " + this.config.option2);
		this.log.info("config optionIPAddr: " + this.config.optionIPAddr);
		this.log.info("Hi there!");


		const servient = new Servient();
		servient.addClientFactory(new HttpClientFactory(null));
		const WoTHelpers = new Helpers(servient);



		/*
		For every state in the system there has to be also an object of type state
		Here a simple template for a boolean variable named "testVariable"
		Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
		*/
		// await this.setObjectNotExistsAsync("testVariable", {
		// 	type: "state",
		// 	common: {
		// 		name: "testVariable",
		// 		type: "boolean",
		// 		role: "indicator",
		// 		read: true,
		// 		write: true,
		// 	},
		// 	native: {},
		// });


		await this.createDevice("plantDevice");
		await this.createChannel("plantDevice", "plantSensorChannel");
		await this.createChannel("plantDevice", "plantActionChannel");
		await this.createChannel("plantDevice", "plantEventChannel");

		// this.createState("plantDevice", "plantSensorChannel", "testState", {
		// 	name: "testState",
		// 	type: "string",
		// 	role: "indicator",
		// 	read: true,
		// 	write: true,
		// });

		WoTHelpers.fetch("http://" + this.config.optionIPAddr + "/").then(async (td) => {
			try {
				servient.start().then(async (WoT) => {
					// Then from here on you can consume the thing
					this.thing = await WoT.consume(td);

					await this.createThingProperties(this.thing);
					this.updateThingPropertiesInterval = setInterval(() => this.updateThingProperties(this.thing) , 10000);

					await this.createThingActions(this.thing);
					await this.subscribeThingEvents(this.thing);

				});
			}
			catch (err) {
				this.log.error("Script error:" + err);
			}
		}).catch((err) => { this.log.error("Fetch error:" + err); });

	/*
		// In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
		this.subscribeStates("testVariable");
		// You can also add a subscription for multiple states. The following line watches all states starting with "lights."
		// this.subscribeStates("lights.*");
		// Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
		// this.subscribeStates("*");

		//	setState examples
		//	you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)

		// the variable testVariable is set to true as command (ack=false)
		await this.setStateAsync("testVariable", true);

		// same thing, but the value is flagged "ack"
		// ack should be always set to true if the value is received from or acknowledged from the target system
		await this.setStateAsync("testVariable", { val: true, ack: true });

		// same thing, but the state is deleted after 30s (getState will return null afterwards)
		await this.setStateAsync("testVariable", { val: true, ack: true, expire: 30 });

		// examples for the checkPassword/checkGroup functions
		let result = await this.checkPasswordAsync("admin", "iobroker");
		this.log.info("check user admin pw iobroker: " + result);

		result = await this.checkGroupAsync("admin", "admin");
		this.log.info("check group user admin group admin: " + result);
	*/
	}

	async createThingProperties(thing) {
		let thing_description = await thing.getThingDescription();
		let all_properties = await thing.readAllProperties();

		this.thing_title = thing_description["title"];

		for (let key in all_properties) {
			this.createState("plantDevice", "plantSensorChannel", key, {
				name: key,
				type: thing_description["properties"][key]["type"],
				unit: thing_description["properties"][key]["unit"],
				min: thing_description["properties"][key]["minimum"],
				max: thing_description["properties"][key]["maximum"],
				role: "indicator",
				read: true,
				write: !thing_description["properties"][key]["readOnly"],
			});
			this.subscribeStates("plantDevice.plantSensorChannel." + key);
			this.setState("plantDevice.plantSensorChannel." + key, { val: all_properties[key] }, true);
		}
	}

	async updateThingProperties(thing) {
		try {
			let all_properties = await thing.readAllProperties();

			for (let key in all_properties) {
				this.setState("plantDevice.plantSensorChannel." + key, { val: all_properties[key] }, true);}
		} catch (error) {
			this.log.info("update properties failed");
		}
	}

	async createThingActions(thing) {
		let thing_description = await thing.getThingDescription();
		this.URIData = {};

		for (var action in thing_description["actions"]) {
			this.createState("plantDevice", "plantActionChannel", action, {
				name: action,
				type: "boolean",
				read: true,
				write: true,
				role: "state",
			});
			this.subscribeStates("plantDevice.plantActionChannel." + action);
			this.setState("plantDevice.plantActionChannel." + action, { val: false }, true);

			if ("uriVariables" in  thing_description["actions"][action]){
				this.URIData[action] = {};
				await this.createChannel("plantDevice", "plantActionURIChannel");
				for (var uriVariable in thing_description["actions"][action]["uriVariables"]) {
					let uri_name = ""+action+"_"+uriVariable;
					this.createState("plantDevice", "plantActionURIChannel", uri_name, {
						name: uri_name,
						type: "number",
						min: thing_description["actions"][action]["uriVariables"][uriVariable]["minimum"],
						max: thing_description["actions"][action]["uriVariables"][uriVariable]["maximum"],
						read: true,
						write: true,
						role: "state",
					});
					this.subscribeStates("plantDevice.plantActionURIChannel." + uri_name);
					this.setState("plantDevice.plantActionURIChannel." + uri_name, { val: null }, true);
				}
			}
		}
	}

	async subscribeThingEvents(thing) {
		let thing_description = await thing.getThingDescription();

		for (let event in thing_description["events"]) {
			this.createState("plantDevice", "plantEventChannel", event, {
				name: event,
				type: "boolean",
				read: true,
				write: true,
				role: "state",
			});
			this.subscribeStates("plantDevice.plantEventChannel." + event);
			this.setState("plantDevice.plantEventChannel." + event, { val: false }, true);

			this.createState("plantDevice", "plantEventChannel", event+"Content", {
				name: event+"Content",
				type: "string",
				read: true,
				write: true,
				role: "state",
			});
			this.subscribeStates("plantDevice.plantEventChannel." + event+"Content");

			thing.subscribeEvent(event, data => {
				data = JSON.parse(data);
				this.log.info("critical-plant-status event: "+ data.data);
				this.setState("plantDevice.plantEventChannel." + event, { val: true }, true);
				this.setState("plantDevice.plantEventChannel." + event+"Content", { val:  data.data }, true);
			}, )
				.then(() => {
					this.log.info("Subscribed to Event: "+ event);
				})
				.catch((e) => {
					this.log.error("onError: %s"+ e);
				});
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
			this.log.debug("change from: " + state.from);

			//Property Change from Outside of Adapter
			if (id.includes(this.common.name + "." + this.instance.toString()+".plantDevice.plantSensorChannel")){
				if (state.from != "system.adapter." + this.common.name + "." + this.instance.toString()) {
					this.log.debug("State change from outside of adapter. -> Write Property");
					this.log.debug("ID: "+ id);
					let propertyName = id.split(".").pop();
					this.log.debug("propertyName: "+ propertyName);
					this.thing.writeProperty(propertyName, { [propertyName]: state.val });
					//set ACK true after writing property
					this.setState(id, state.val, true);
				}
			}

			//Action Trigger
			if (id.includes(this.common.name + "." + this.instance.toString()+".plantDevice.plantActionChannel")){
				if (state.val == true){
					this.log.debug("ID: "+ id);
					let actionName = id.split(".").pop();
					this.log.debug("actionName: "+ actionName);
					this.thing.invokeAction(actionName, undefined, {uriVariables: this.URIData[actionName]});
					//set trigger/toggle boolean false and ACK true after writing property
					this.setState(id, false, true);
				}
			}

			//URI Variable Change
			if (id.includes(this.common.name + "." + this.instance.toString()+".plantDevice.plantActionURIChannel")){
				this.log.info("ID: "+ id);
				let actionAndURIName = id.split(".").pop();
				let actionAndURINameParts = actionAndURIName.split("_")
				let URIName = actionAndURINameParts.pop();
				let actionName = actionAndURINameParts.join("_");
				this.log.info("actionName: "+ actionName);
				this.log.info("URIName: "+ URIName);

				this.URIData[actionName][URIName] = state.val;
				this.log.info("URI_DATA: "+ JSON.stringify(this.URIData));

				//this.thing.invokeAction(actionName, undefined, {uriVariables: null});
				//set trigger/toggle boolean false and ACK true after writing property
				//this.setState(id, state.val, true);
			}
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === "object" && obj.message) {
	// 		if (obj.command === "send") {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info("send command");

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
	// 		}
	// 	}
	// }

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			// clearInterval(interval1);
			clearInterval(this.updateThingPropertiesInterval);
			this.log.debug("cancelled all timers");
			callback();
		} catch (e) {
			callback();
		}
	}

}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new WebOfThings(options);
} else {
	// otherwise start the instance directly
	new WebOfThings();
}