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
const assets = require("assets");
const clipboard = require("clipboard");

const $ = require("../utils/utils");
const NodeUtils = require("../utils/nodeutils");
const ExportUtils = require("../utils/exportutils");

const { trace } = require('../utils/debug');
const { Context, ContextTarget } = require("./context");
const { parse } = require("./parse");
const { formatDart } = require("../lib/dart_style");
const PropType = require("./proptype");
const NodeType = require("./nodetype");
const { project } = require("./project");
const { alert } = require("../ui/alert");
const { checkXDVersion } = require("../version");
const { getTextStyleParamList, getTextStyle } = require("./nodes/text");

async function copySelected(selection, root) {
	if (!checkXDVersion()) { return; }
	let xdNode = $.getSelectedItem(selection);
	if (!xdNode) { alert("Select a single item to copy."); return; }

	let type = NodeType.getType(xdNode);
	let isCopyable = type !== NodeType.ROOT && type !== NodeType.WIDGET;
	if (!isCopyable) {
		alert("The selected item cannot be copied.");
		return null;
	}

	let ctx = new Context(ContextTarget.CLIPBOARD);

	let result, node = parse(root, xdNode, ctx);
	if (node) {
		node.layout = null; // disable the Layout decorator.
		result = _formatDart(node.serialize(ctx)+';', true, ctx);
	}

	if (result) {
		clipboard.copyText(result);
		ctx.resultMessage = "Flutter code copied to clipboard";
	} else {
		ctx.resultMessage = "Unable to export this node";
	}
	return ctx;
}

async function exportAll(selection, root) {
	if (!checkXDVersion()) { return; }
	let ctx = new Context(ContextTarget.FILES);

	if (!await project.checkRoot(false)) { return null; }
	let codeF = project.code;

	let count = 0, total = 0;
	// Parse entire document, getting all artboards and components, combining them in one object for iteration
	parse(root, null, ctx);
	let widgets = Object.assign({}, ctx.artboards, ctx.masterComponents);
	// Write each widget to disk
	for (let n in widgets) {
		if (NodeUtils.getProp(widgets[n].xdNode, PropType.INCLUDE_IN_EXPORT_PROJECT) === false)
			continue;
		++total;
		let fileName = await writeWidget(widgets[n], codeF, ctx);
		if (fileName) { count++; }
	}

	await exportColors(ctx);
	await exportCharStyles(ctx);
	await project.validate(ctx);

	ctx.resultMessage = $.getExportAllMessage(count, total, "widget");
	return ctx;
}

async function exportSelected(selection, root) {
	if (!checkXDVersion()) { return; }
	let xdNode = $.getSelectedItem(selection);
	if (!xdNode) { alert("Select an Artboard or Master Component."); return null; }

	if (!NodeUtils.isWidget(xdNode)) {
		let msg = "Only Artboards and Master Components can be exported as Widgets.";
		if (xdNode instanceof xd.SymbolInstance) {
			msg += ` Press <b>${$.getCmdKeyStr()}-Shift-K</b> to locate the Master Component.`;
		}
		alert(msg);
		return null;
	}

	if (!await project.checkRoot()) { return null; }
	let codeF = project.code;

	let ctx = new Context(ContextTarget.FILES);
	let fileName, node = parse(root, xdNode, ctx);
	if (node) {
		// Write the widget we have selected to disk
		fileName = await writeWidget(node, codeF, ctx);
	}

	await project.validate(ctx);

	ctx.resultMessage = fileName ? `Exported '${fileName}' successfully` : "Widget export failed";
	return ctx;
}

//Writes a single artboard / component to dart file
async function writeWidget(node, codeF, ctx) {
	let fileName = node.widgetName + ".dart";
	let fileStr = node.serializeWidget(ctx);
	fileStr = _formatDart(fileStr, false, ctx, node);
	
	if (!fileStr) { return null; }

	await codeF.writeFile(fileName, fileStr, ctx);
	return fileName;
}

async function exportColors(ctx) {
	if (!NodeUtils.getProp(xd.root, PropType.EXPORT_COLORS)) { return; }
	let entries = assets.colors.get();
	if (!entries) { return; }
	let lists = {}, usedNames = {}, names = [];
	let className = $.cleanVarName(NodeUtils.getProp(xd.root, PropType.COLORS_CLASS_NAME)) || 'XDColors';
	let str = `import 'package:flutter/material.dart';\n\nclass ${className} {\n`;
	for (let i=0, l=entries.length; i<l; i++) {
		let asset = entries[i], name = $.cleanVarName(asset.name);
		if (!name) { continue; }
		if (usedNames[name]) {
			ctx.log.warn(`Duplicate color asset name: ${name}`);
			continue;
		}
		usedNames[name] = true;
		names.push(name);
		let isGradient = !asset.color;
		let match = /(.+?)(\d+)$/.exec(name);
		if (match) {
			let o = lists[match[1]];
			if (!o) {
				o = lists[match[1]] = [];
				o.isGradient = isGradient;
			}
			if (o.isGradient !== isGradient) {
				ctx.log.warn(`Color asset lists can't mix colors and gradients (${match[1]})`);
			} else {
				o[parseInt(match[2])] = name;
			}
		}
		if (isGradient) {
			let type = ExportUtils.getGradientTypeFromAsset(asset);
			str += `\tstatic const ${type} ${name} = ${ExportUtils.getGradientFromAsset(asset)};\n`;
		} else {
			str += `\tstatic const Color ${name} = ${ExportUtils.getColor(asset.color)};\n`;
		}
	}
	str += '\n';
	for (let n in lists) {
		let s = _getColorList(lists[n], n, true);
		if (s) { str += `${s}\n`; }
	}
	str += '\n}';
	str = _formatDart(str, false, ctx, null);
	await project.code.writeFile(`${className}.dart`, str, ctx);
}

function _getColorList(o, name, validate) {
	if (validate && (!o[0] || !o[1])) { return ''; }
	let type = o.isGradient ? 'Gradient' : 'Color';
	let str = `\tstatic const List<${type}> ${name} = const [`;
	for (let i=0; true; i++) {
		if (!o[i]) { break; }
		str += `${i===0 ? '' : ', '}${o[i]}`;
	}
	return str + '];';
}

async function exportCharStyles(ctx) {
	if (!NodeUtils.getProp(xd.root, PropType.EXPORT_CHAR_STYLES)) { return; }
	let entries = assets.characterStyles.get();
	if (!entries || entries.length === 0) { return; }
	let usedNames = {}, names = [];
	let className = $.cleanVarName(NodeUtils.getProp(xd.root, PropType.CHAR_STYLES_CLASS_NAME)) || 'XDTextStyles';
	let str = `import 'package:flutter/material.dart';\n\nclass ${className} {\n`;
	for (let i=0, l=entries.length; i<l; i++) {
		let asset = entries[i], name = $.cleanVarName(asset.name);
		if (!name) { continue; }
		if (usedNames[name]) {
			ctx.log.warn(`Duplicate character style asset name: ${name}`);
			continue;
		}
		usedNames[name] = true;
		names.push(name);
		let style = getTextStyle(getTextStyleParamList(asset.style, false, ctx));
		if (style) { str += `\tstatic const TextStyle ${name} = const ${style};\n`; }
	}
	str += '\n}';
	str = _formatDart(str, false, ctx, null);
	await project.code.writeFile(`${className}.dart`, str, ctx);
}

function _formatDart(str, nestInFunct, ctx, node) {
	let result = null, xdNode = node && node.xdNode;
	try {
		result = formatDart(str, nestInFunct);
	} catch(e) {
		trace(e);
		ctx.log.error(str);
		ctx.log.error('Unable to format the exported source code.', xdNode);
	}
	return result;
}

module.exports = {
	copySelected,
	exportSelected,
	exportAll,
	exportColors,
};
