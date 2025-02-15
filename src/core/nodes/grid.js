/*
Copyright 2020 Adobe
All Rights Reserved.

NOTICE: Adobe permits you to use, modify, and distribute this file in
accordance with the terms of the Adobe license agreement accompanying
it. If you have received this file from a source other than Adobe,
then your use, modification, or distribution of it requires the prior
written permission of Adobe. 
*/

const xd = require("scenegraph");

const $ = require("../../utils/utils");
const NodeUtils = require("../../utils/nodeutils");
const { getString, getAssetImage } = require("../../utils/exportutils");

const { AbstractNode } = require("./abstractnode");
const PropType = require("../proptype");

class Grid extends AbstractNode {
	static create(xdNode, ctx) {
		if (xdNode instanceof xd.RepeatGrid) {
			return new Grid(xdNode, ctx);
		}
	}

	constructor(xdNode, ctx) {
		super(xdNode, ctx);
		this.item = null;
	}
	
	_serialize(ctx) {
		let o = this.xdNode, item = this.item;
		if (!item || o.children.length < 1) {
			ctx.log.error( "Repeat grid has no children.", o);
			return "";
		}
		if (item.children.length < 1) {
			ctx.log.warn("Repeat grid item is empty.", o);
			return "";
		}
		if (o.paddingX < 0 || o.paddingY < 0) {
			ctx.log.warn("Negative grid spacing is not supported.", o);
		}
		
		let itemIsResponsive= this._itemIsResponsive();
		if (itemIsResponsive) {
			// strip the virtual group, and ignore transform
			item = item.children[0];
			item.layout = null;
		}

		let params = this._getParams(ctx);
		let l=o.children.length, childData = new Array(l).fill(""), paramVarStr = "";
		for (let n in params) {
			let vals = params[n];
			paramVarStr += `final ${n} = map['${n}'];\n`;
			for (let i=0; i<l; i++) {
				childData[i] += `'${n}': ${vals[i]}, `;
			}
		}
		let childDataStr = `{${childData.join("}, {")}}`;
		let itemStr = item.serialize(ctx);

		let xSpacing = Math.max(0, o.paddingX), ySpacing = Math.max(0, o.paddingY);
		let cellW = o.cellSize.width, cellH = o.cellSize.height;
		let aspectRatio = $.fix(cellW / cellH, 2);
		
		let cols = (o.width + xSpacing/2) / (o.cellSize.width + xSpacing);
		let colCount = Math.round(cols), delta = Math.abs(cols - colCount);

		if (delta > 0.15) {
			ctx.log.warn("Partial columns are not supported in repeat grids.", o);
		}

		// TODO: GS: when .responsive is false, we likely have to wrap this in a SizedBox

		const state = this.xdNode.pluginData
		let name = 'SingleChildScrollView'
		if (state && state[PropType.IS_CUSTOM_WIDGET] && state[PropType.CUSTOM_WIDGET]) {
			name = state[PropType.CUSTOM_WIDGET]
		}
		let children = 'children'
		if (state && state[PropType.CUSTOM_CHILDREN]) {
			children = state[PropType.CUSTOM_CHILDREN]
		}

		if (state && state[PropType.IS_NO_LAYOUT]) {
			return `...[${childDataStr}].map((map) { ${paramVarStr} return ${itemStr}; }).toList()`
		}

		if (!itemIsResponsive) {
			return `${name}(child: Wrap(` +
				'alignment: WrapAlignment.center, ' +
				`spacing: ${xSpacing}, runSpacing: ${ySpacing}, ` +
				`${children}: [${childDataStr}].map((map) { ${paramVarStr} return ${itemStr}; }).toList(),` +
			'), )';
		}
		return `GridView.count(` +
			`mainAxisSpacing: ${ySpacing}, crossAxisSpacing: ${xSpacing}, ` +
			`crossAxisCount: ${colCount}, ` +
			`childAspectRatio: ${aspectRatio}, ` +
			`${children}: [${childDataStr}].map((map) { ${paramVarStr} return ${itemStr}; }).toList(),` +
		')';
	}

	_itemIsResponsive() {
		// check to see if the virtual group has a single child:
		let o = this.item;
		if (!o || !o.children || o.children.length !== 1) { return false; }
		// now check if that child has children and if they are responsive
		o = o.children[0];
		return !!(o.children && o.children.length > 0 && o.children[0].responsive);
	}
	
	_getParams(ctx) {
		let params = {};
		this._diff(this.item, this.xdNode.children.map(o => o), params, ctx);
		return params;
	}

	_diff(node, xdNodes, params, ctx) {
		if (!node || !xdNodes || xdNodes.length < 1) { return; }
		let master = xdNodes[0];
		
		// Currently in XD, only text content and image fills can be different in grid items.
		if (master instanceof xd.Text) {
			let pName = NodeUtils.getProp(master, PropType.TEXT_PARAM_NAME);
			let name = pName || this._getName(params, "text");
			if (this._diffField(params, xdNodes, name, this._getText, !!pName, ctx)) {
				node.addParam("text", name);
			}
		} else if ((master instanceof xd.Rectangle || master instanceof xd.Ellipse) && master.fill instanceof xd.ImageFill) {
			let pName = NodeUtils.getProp(master, PropType.IMAGE_PARAM_NAME);
			let name = pName || this._getName(params, "image");
			if (this._diffField(params, xdNodes, name, this._getImage, !!pName, ctx)) {
				node.addParam("fill", name);
			}
		}
		
		for (let i=0, l=node.children && node.children.length; i<l; i++) {
			let childNode = node.children[i];
			this._diff(childNode, xdNodes.map(o => o.children.at(i)), params, ctx);
		};
	}

	_getName(params, name) {
		let count = 0, n = name;
		while (params[n]) { n = name + "_" + (count++); }
		return n;
	}

	_diffField(params, xdNodes, name, valueF, force, ctx) {
		let a = valueF(xdNodes[0]), values=[], diff=!!force;
		for (let i=0, l=xdNodes.length; i<l; i++) {
			let xdNode = xdNodes[i], b = valueF(xdNode, ctx);
			if (a !== b) { diff = true; }
			values[i] = b;
		}
		if (diff) { params[name] = values; }
		return diff;
	}

	_getText(xdNode, ctx) { return getString(xdNode.text); }

	_getImage(xdNode, ctx) { return getAssetImage(xdNode, ctx); }
	
}
exports.Grid = Grid;
