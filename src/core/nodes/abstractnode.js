/*
Copyright 2020 Adobe
All Rights Reserved.

NOTICE: Adobe permits you to use, modify, and distribute this file in
accordance with the terms of the Adobe license agreement accompanying
it. If you have received this file from a source other than Adobe,
then your use, modification, or distribution of it requires the prior
written permission of Adobe. 
*/


const { trace } = require("../../utils/debug");
const $ = require("../../utils/utils");
const { Parameter } = require("../parameter");
const { Layout } = require("../decorators/layout");
const PropType = require("../proptype");

// Abstract class representing the minimum interface required for an export node.
class AbstractNode {
	// Nodes should also have a static `create(xdNode, ctx)` method
	// that returns an instance if appropriate for the xdNode.

	constructor(xdNode, ctx) {
		this.xdNode = xdNode;
		this.parameters = null;
		this.children = null;
		this.decorators = null;
		this.hasDecorators = false; // indicates this node has non-cosmetic decorators.
		this.layout = new Layout(this, ctx);
		this._cache = null;
	}

	get hasChildren() {
		return !!(this.children && this.children.length);
	}

	get responsive() {
		return !!this.xdNode.horizontalConstraints;
	}

	get xdId() {
		return this.xdNode ? this.xdNode.guid : null;
	}

	get xdName() {
		return this.xdNode ? this.xdNode.name : null;
	}

	get adjustedBounds() {
		// Note: Artboards always return x/y=0 & w/h = specified size for localBounds, even if children exceed edges.
		let xdNode = this.xdNode;
		let bip = xdNode.boundsInParent, lb = xdNode.localBounds, pb = xdNode.parent.localBounds;
		// calculate the untransformed top left corner, by finding the center and subtracting half w & h:
		let tl = {x: bip.x + bip.width/2 - lb.width/2, y: bip.y + bip.height/2 - lb.height/2};
		return {
			x: tl.x - pb.x,
			y: tl.y - pb.y,
			width: lb.width,
			height: lb.height,
		}
	}

	addDecorator(decorator) {
		this.decorators = this.decorators || [];
		this.decorators.push(decorator);
		if (!decorator.cosmetic) { this.hasDecorators = true; }
	}

	addParam(key, name, type, value) {
		if (!name || !key) { return null; }
		let param = new Parameter(name, type, value);
		if (!this.parameters) { this.parameters = {}; }
		return this.parameters[key] = param;
	}

	getParam(key) {
		return this.parameters && this.parameters[key];
	}

	getParamName(key) {
		let param = this.getParam(key);
		return (param && param.name) || null;
	}

	get transform() {
		// currently supports rotation & flipY.
		return {rotation: this.xdNode.rotation, flipY: false};
	}

	toString(ctx) {
		return `[${this.constructor.name}]`;
	}

	serialize(ctx) {
		if (this._cache === null) {
			let nodeStr = this._serialize(ctx);
			this._cache = this._decorate(nodeStr, ctx);
		}
		return this._cache;
	}

	_serialize(ctx) {
		return "";
	}

	_decorate(nodeStr, ctx) {
		if (!nodeStr) { return nodeStr; }
		let decorators = this.decorators, l = nodeStr && decorators ? decorators.length : 0;
		for (let i=0; i<l; i++) { nodeStr = decorators[i].serialize(nodeStr, ctx); }

		const state = this.xdNode.pluginData
		if (!state || !state[PropType.IS_NO_LAYOUT]) {
			if (this.layout) { nodeStr = this.layout.serialize(nodeStr, ctx); }
		}

		return nodeStr;
	}

	_filterChildList(ctx) {
		return this.children.filter(node => {
			const state = node && node.xdNode ? node.xdNode.pluginData : null;
			return node && (!state || !state[PropType.CUSTOM_SLOT] ||
			state[PropType.CUSTOM_SLOT] === 'children')
		})
	}

	_getChildSlots(ctx) {
		const inSlotChilds = this.children.filter(node => {
			const state = node && node.xdNode ? node.xdNode.pluginData : null;
			return node && state && state[PropType.CUSTOM_SLOT] &&
			state[PropType.CUSTOM_SLOT] !== 'children'
		})
		const slots = []
		inSlotChilds.forEach(node => {
			const state = node.xdNode.pluginData;
			const index = slots.indexOf(state[PropType.CUSTOM_SLOT])
			if (index === -1) [
				slots.push(state[PropType.CUSTOM_SLOT])
			]
		})
		return slots
	}

	_getChildListInSlot(ctx, slot) {
		return this.children.filter(node => {
			const state = node.xdNode.pluginData;
			return state && state[PropType.CUSTOM_SLOT] &&
			state[PropType.CUSTOM_SLOT] === slot
		})
	}

	_getChildList(ctx) {
		let str = "";
		this._filterChildList().forEach(node => {
			let childStr = node && node.serialize(ctx);
			if (childStr) { str += childStr + ", "; }
		});
		return str;
	}

	_addSizedBox(nodeStr, size, ctx) {
		return `SizedBox(width: ${$.fix(size.width, 0)}, height: ${$.fix(size.height, 0)}, child: ${nodeStr},)`;
	}

	_getChildStack(ctx, excludeSlots = false) {
		let name = 'Stack'
		const state = this.xdNode.pluginData;
		if (state && state[PropType.IS_CUSTOM_WIDGET] && state[PropType.CUSTOM_WIDGET]) {
			const widgetName = state[PropType.CUSTOM_WIDGET];
			if (widgetName.startsWith('package')) {
				const filename = widgetName.substr(widgetName.lastIndexOf('/') + 1);
				name = filename.substr(0, filename.length - 5)
			} else {
				name = widgetName;
			}
		}

		let children = 'children'
		if (state && state[PropType.CUSTOM_CHILDREN]) {
			children = state[PropType.CUSTOM_CHILDREN]
		}

		const slotsStr = this._getChildSlots(ctx).map(slot => {
			return slot + ': ' + this._getChildSlot(ctx, slot)
		}).join(',')

		const childString = this._getChildList(ctx)
		const childrenString = childString.length > 0 ? `${children}: <Widget>[${childString}], ` : ''

		if (excludeSlots && childrenString.length === 0) {
			return ''
		}

		if (state && state[PropType.CUSTOM_EXTENDS]) {
			return `${childrenString} ${ excludeSlots ? '':slotsStr}`
		}

		return `${name}(${childrenString} ${ excludeSlots ? '':slotsStr})`;
	}

	_getChildSlot(ctx, slot) {
		const slots = this._getChildListInSlot(ctx, slot).map(node => {
			return node && node.serialize(ctx);
		}).filter(node => (node))

		if (slots.length === 1) {
			return slots
		} else {
			return '[' + slots.join(',') + ']'
		}

		return 'null'
	}
}
exports.AbstractNode = AbstractNode;
